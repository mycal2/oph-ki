-- ============================================================================
-- OPH-29: Shared ERP Configurations (Decoupled from Tenants)
--
-- Refactors erp_configs from per-tenant to standalone named entities.
-- Tenants reference a shared config via erp_config_id FK.
-- ============================================================================

-- ============================================================================
-- 1. Clear existing data (start fresh per spec)
-- ============================================================================

-- Delete all existing per-tenant ERP configs (and cascading versions)
DELETE FROM public.erp_config_versions;
DELETE FROM public.erp_configs;

-- Delete existing output formats (they'll be recreated per config)
DELETE FROM public.tenant_output_formats;

-- ============================================================================
-- 2. Alter erp_configs: drop tenant_id, add name + description
-- ============================================================================

-- Drop indexes that reference tenant_id
DROP INDEX IF EXISTS public.idx_erp_configs_tenant_unique;
DROP INDEX IF EXISTS public.idx_erp_configs_tenant_id;
DROP INDEX IF EXISTS public.idx_erp_configs_tenant_format;

-- Drop RLS policies that reference tenant_id
DROP POLICY IF EXISTS "erp_configs_select_tenant" ON public.erp_configs;
DROP POLICY IF EXISTS "erp_configs_select_platform_admin" ON public.erp_configs;
DROP POLICY IF EXISTS "erp_configs_insert_platform_admin" ON public.erp_configs;
DROP POLICY IF EXISTS "erp_configs_update_platform_admin" ON public.erp_configs;
DROP POLICY IF EXISTS "erp_configs_delete_platform_admin" ON public.erp_configs;

-- Drop the tenant_id column and is_default column
ALTER TABLE public.erp_configs DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE public.erp_configs DROP COLUMN IF EXISTS is_default;

-- Add name and description columns
ALTER TABLE public.erp_configs
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;

-- Remove the default on name (was only needed to add column to existing table)
ALTER TABLE public.erp_configs ALTER COLUMN name DROP DEFAULT;

-- Unique constraint on name
CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_configs_name
  ON public.erp_configs(name);

-- ============================================================================
-- 3. Add erp_config_id FK to tenants table (BEFORE RLS policies that reference it)
-- ============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS erp_config_id UUID DEFAULT NULL
  REFERENCES public.erp_configs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_erp_config_id
  ON public.tenants(erp_config_id);

-- ============================================================================
-- 4. Re-create RLS policies for erp_configs (platform admin only + tenant read via FK)
-- ============================================================================

-- Platform admins: full CRUD
CREATE POLICY "erp_configs_select_platform_admin"
  ON public.erp_configs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'platform_admin'
    )
  );

-- Tenant users can read the config assigned to their tenant
CREATE POLICY "erp_configs_select_tenant"
  ON public.erp_configs FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT t.erp_config_id FROM public.tenants t
      JOIN public.user_profiles up ON up.tenant_id = t.id
      WHERE up.id = auth.uid() AND t.erp_config_id IS NOT NULL
    )
  );

CREATE POLICY "erp_configs_insert_platform_admin"
  ON public.erp_configs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'platform_admin'
    )
  );

CREATE POLICY "erp_configs_update_platform_admin"
  ON public.erp_configs FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'platform_admin'
    )
  );

CREATE POLICY "erp_configs_delete_platform_admin"
  ON public.erp_configs FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'platform_admin'
    )
  );

-- ============================================================================
-- 5. Add erp_config_id FK to tenant_output_formats table
-- ============================================================================

-- Make tenant_id nullable (output formats can now belong to a config instead)
ALTER TABLE public.tenant_output_formats
  ALTER COLUMN tenant_id DROP NOT NULL;

-- Drop the unique constraint on tenant_id (we'll add a new one)
ALTER TABLE public.tenant_output_formats
  DROP CONSTRAINT IF EXISTS unique_tenant_output_format;

-- Add erp_config_id column
ALTER TABLE public.tenant_output_formats
  ADD COLUMN IF NOT EXISTS erp_config_id UUID DEFAULT NULL
  REFERENCES public.erp_configs(id) ON DELETE CASCADE;

-- New unique constraint: one output format per erp_config
CREATE UNIQUE INDEX IF NOT EXISTS idx_output_formats_erp_config_unique
  ON public.tenant_output_formats(erp_config_id) WHERE erp_config_id IS NOT NULL;

-- Keep unique constraint on tenant_id for backward compat
CREATE UNIQUE INDEX IF NOT EXISTS idx_output_formats_tenant_unique
  ON public.tenant_output_formats(tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_output_formats_erp_config_id
  ON public.tenant_output_formats(erp_config_id);

-- ============================================================================
-- 6. Remove confidence score columns from orders (tied to per-tenant output formats)
-- ============================================================================
-- These columns stay — they're per-order results that don't need schema changes.
-- The lookup logic changes in the API routes instead.
