-- ============================================================================
-- OPH-1: Multi-Tenant Auth & Benutzerverwaltung
-- Migration: Create tenants, user_profiles tables with RLS,
--            Custom Access Token Hook, handle_new_user trigger,
--            and rate limiting infrastructure.
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. TENANTS TABLE
-- ============================================================================
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'trial')),
  erp_type TEXT DEFAULT 'Custom'
    CHECK (erp_type IN ('SAP', 'Dynamics365', 'Sage', 'Custom')),
  contact_email TEXT NOT NULL,
  email_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for tenants
CREATE INDEX idx_tenants_slug ON public.tenants(slug);
CREATE INDEX idx_tenants_status ON public.tenants(status);

-- Enable RLS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenants
-- Platform admins can see all tenants
CREATE POLICY "Platform admins can view all tenants"
  ON public.tenants FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

-- Tenant users can see their own tenant
CREATE POLICY "Users can view own tenant"
  ON public.tenants FOR SELECT
  USING (
    id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID
  );

-- Only platform admins can insert tenants
CREATE POLICY "Platform admins can insert tenants"
  ON public.tenants FOR INSERT
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

-- Only platform admins can update tenants
CREATE POLICY "Platform admins can update tenants"
  ON public.tenants FOR UPDATE
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

-- Only platform admins can delete tenants
CREATE POLICY "Platform admins can delete tenants"
  ON public.tenants FOR DELETE
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );


-- ============================================================================
-- 2. USER_PROFILES TABLE
-- ============================================================================
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'tenant_user'
    CHECK (role IN ('tenant_user', 'tenant_admin', 'platform_admin')),
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for user_profiles
CREATE INDEX idx_user_profiles_tenant_id ON public.user_profiles(tenant_id);
CREATE INDEX idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX idx_user_profiles_status ON public.user_profiles(status);
CREATE INDEX idx_user_profiles_tenant_status ON public.user_profiles(tenant_id, status);

-- Enable RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
-- Platform admins can see all profiles
CREATE POLICY "Platform admins can view all profiles"
  ON public.user_profiles FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

-- Users can see profiles within their own tenant
CREATE POLICY "Users can view own tenant profiles"
  ON public.user_profiles FOR SELECT
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID
  );

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Tenant admins can update profiles in their tenant
CREATE POLICY "Tenant admins can update tenant profiles"
  ON public.user_profiles FOR UPDATE
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('tenant_admin', 'platform_admin')
  )
  WITH CHECK (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('tenant_admin', 'platform_admin')
  );

-- Insert policy: only service role or triggers can insert (handled by handle_new_user)
-- We also allow platform_admin to insert (for creating profiles manually)
CREATE POLICY "Platform admins can insert profiles"
  ON public.user_profiles FOR INSERT
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

-- Tenant admins can delete profiles in their tenant (soft delete via status is preferred)
CREATE POLICY "Tenant admins can delete tenant profiles"
  ON public.user_profiles FOR DELETE
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('tenant_admin', 'platform_admin')
  );


-- ============================================================================
-- 3. HANDLE_NEW_USER TRIGGER
-- Automatically creates a user_profiles row when a new user is created via
-- Supabase Auth invite. Reads tenant_id and role from raw_user_meta_data
-- which is set during the invite call.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Extract tenant_id from user metadata
  v_tenant_id := (NEW.raw_user_meta_data ->> 'tenant_id')::UUID;

  -- Only create a user_profile if a valid tenant_id is present.
  -- Users created outside the invite flow (e.g. direct Supabase signup) are
  -- skipped — they cannot access the application until assigned to a tenant.
  IF v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_profiles (id, tenant_id, role, first_name, last_name, status)
  VALUES (
    NEW.id,
    v_tenant_id,
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'tenant_user'),
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    'active'
  );
  RETURN NEW;
END;
$$;

-- Create the trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================================
-- 4. CUSTOM ACCESS TOKEN HOOK
-- PostgreSQL function that enriches the JWT with tenant_id and role
-- from the user_profiles table. This runs on every token refresh.
-- See: https://supabase.com/docs/guides/auth/auth-hooks#hook-custom-access-token
-- ============================================================================
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims JSONB;
  user_tenant_id UUID;
  user_role TEXT;
  user_status TEXT;
  tenant_status TEXT;
BEGIN
  -- Extract the current claims
  claims := event -> 'claims';

  -- Look up the user's profile
  SELECT
    up.tenant_id,
    up.role,
    up.status
  INTO user_tenant_id, user_role, user_status
  FROM public.user_profiles up
  WHERE up.id = (event ->> 'user_id')::UUID;

  -- If user has a profile, add tenant_id and role to claims
  IF user_tenant_id IS NOT NULL THEN
    -- Check tenant status
    SELECT t.status INTO tenant_status
    FROM public.tenants t
    WHERE t.id = user_tenant_id;

    claims := jsonb_set(claims, '{app_metadata}',
      COALESCE(claims -> 'app_metadata', '{}'::JSONB) ||
      jsonb_build_object(
        'tenant_id', user_tenant_id::TEXT,
        'role', user_role,
        'user_status', user_status,
        'tenant_status', COALESCE(tenant_status, 'inactive')
      )
    );
  END IF;

  -- Update the event with modified claims
  event := jsonb_set(event, '{claims}', claims);

  RETURN event;
END;
$$;

-- Grant necessary permissions to supabase_auth_admin for the hook
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
GRANT SELECT ON TABLE public.user_profiles TO supabase_auth_admin;
GRANT SELECT ON TABLE public.tenants TO supabase_auth_admin;

-- Revoke public execute to restrict access
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM anon;


-- ============================================================================
-- 5. RATE LIMITING TABLE (Application-level)
-- Tracks failed login attempts per IP/email for application-level rate limiting.
-- ============================================================================
CREATE TABLE public.auth_rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier TEXT NOT NULL,          -- email or IP address
  identifier_type TEXT NOT NULL      -- 'email' or 'ip'
    CHECK (identifier_type IN ('email', 'ip')),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_auth_rate_limits_identifier
  ON public.auth_rate_limits(identifier, identifier_type);
CREATE INDEX idx_auth_rate_limits_locked_until
  ON public.auth_rate_limits(locked_until)
  WHERE locked_until IS NOT NULL;

-- Enable RLS (only service role should access this table)
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies for regular users -- only service role can access
-- This is intentional: rate limit data is server-side only


-- ============================================================================
-- 6. UPDATED_AT TRIGGER (shared helper)
-- Automatically sets updated_at on row update.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_auth_rate_limits_updated_at
  BEFORE UPDATE ON public.auth_rate_limits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================================
-- 7. SEED DATA (optional: first platform admin tenant)
-- Uncomment and adjust to seed your initial platform admin tenant.
-- ============================================================================
-- INSERT INTO public.tenants (name, slug, status, contact_email)
-- VALUES ('IDS.online Platform', 'ids-platform', 'active', 'admin@ids.online');
