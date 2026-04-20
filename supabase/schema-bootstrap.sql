-- =============================================================================
-- OPH Order Intelligence Platform — Full Schema Bootstrap
-- Run against a fresh Supabase project to recreate the production schema.
-- Contains NO data except the platform_settings singleton seed.
-- =============================================================================

-- ============================================================
-- 1. EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ============================================================
-- 2. FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  v_tenant_id := (NEW.raw_user_meta_data ->> 'tenant_id')::UUID;
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

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
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
  claims := event -> 'claims';
  SELECT up.tenant_id, up.role, up.status
  INTO user_tenant_id, user_role, user_status
  FROM public.user_profiles up
  WHERE up.id = (event ->> 'user_id')::UUID;
  IF user_tenant_id IS NOT NULL THEN
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
  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dealer_order_stats()
RETURNS TABLE(dealer_id UUID, order_count BIGINT, last_order_at TIMESTAMPTZ, tenant_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.dealer_id, COUNT(*)::BIGINT AS order_count, MAX(o.created_at) AS last_order_at, COUNT(DISTINCT o.tenant_id)::BIGINT AS tenant_count
  FROM orders o
  WHERE o.dealer_id IS NOT NULL
  GROUP BY o.dealer_id;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_order_stats()
RETURNS TABLE(tenant_id UUID, order_count BIGINT, orders_last_month BIGINT, last_upload_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.tenant_id, COUNT(*)::BIGINT AS order_count,
    COUNT(*) FILTER (WHERE o.created_at >= NOW() - INTERVAL '30 days')::BIGINT AS orders_last_month,
    MAX(o.created_at) AS last_upload_at
  FROM public.orders o
  GROUP BY o.tenant_id;
$$;

-- Auth hook grants
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- ============================================================
-- 3. TABLES (in FK dependency order)
-- ============================================================

-- erp_configs (no FK dependencies)
CREATE TABLE public.erp_configs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  format       text        NOT NULL CHECK (format IN ('csv','xml','json','split_csv')),
  column_mappings jsonb    NOT NULL DEFAULT '[]'::jsonb,
  separator    text        NOT NULL DEFAULT ',',
  quote_char   text        NOT NULL DEFAULT '"',
  encoding     text        NOT NULL DEFAULT 'UTF-8',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  xml_template text        NULL,
  line_ending  text        NOT NULL DEFAULT 'LF' CHECK (line_ending IN ('LF','CRLF')),
  decimal_separator text   NOT NULL DEFAULT '.' CHECK (decimal_separator IN ('.',',')),
  fallback_mode text       NOT NULL DEFAULT 'block' CHECK (fallback_mode IN ('block','fallback_csv')),
  name         text        NOT NULL,
  description  text        NULL,
  header_column_mappings jsonb DEFAULT NULL,
  empty_value_placeholder text NOT NULL DEFAULT '',
  split_output_mode text NULL DEFAULT 'zip' CHECK (split_output_mode IS NULL OR split_output_mode IN ('zip', 'separate')),
  header_filename_template text NULL,
  lines_filename_template text NULL,
  zip_filename_template text NULL
);

-- tenants (FK → erp_configs)
CREATE TABLE public.tenants (
  id                        uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name                      text        NOT NULL,
  slug                      text        NOT NULL UNIQUE,
  status                    text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','trial')),
  erp_type                  text        NULL DEFAULT 'Custom' CHECK (erp_type IN ('SAP','Dynamics365','Sage','Custom')),
  contact_email             text        NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  inbound_email_address     text        NULL UNIQUE,
  trial_started_at          timestamptz NULL,
  trial_expires_at          timestamptz NULL,
  allowed_email_domains     text[]      NULL DEFAULT '{}',
  data_retention_days       integer     NOT NULL DEFAULT 90 CHECK (data_retention_days >= 30 AND data_retention_days <= 365),
  erp_config_id             uuid        NULL REFERENCES public.erp_configs(id),
  email_confirmation_enabled       boolean NOT NULL DEFAULT true,
  email_results_enabled            boolean NOT NULL DEFAULT true,
  email_results_format             text    NOT NULL DEFAULT 'standard_csv' CHECK (email_results_format IN ('standard_csv','tenant_format')),
  email_results_confidence_enabled boolean NOT NULL DEFAULT true,
  email_postprocess_enabled        boolean NOT NULL DEFAULT false
);

-- user_profiles (FK → auth.users, tenants)
CREATE TABLE public.user_profiles (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id),
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id),
  role       text        NOT NULL DEFAULT 'tenant_user' CHECK (role IN ('tenant_user','tenant_admin','platform_admin')),
  first_name text        NOT NULL DEFAULT '',
  last_name  text        NOT NULL DEFAULT '',
  status     text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- dealers (no FK dependencies)
CREATE TABLE public.dealers (
  id                    uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name                  text        NOT NULL,
  known_domains         text[]      NOT NULL DEFAULT '{}',
  known_sender_addresses text[]     NOT NULL DEFAULT '{}',
  subject_patterns      text[]      NOT NULL DEFAULT '{}',
  filename_patterns     text[]      NOT NULL DEFAULT '{}',
  format_type           text        NOT NULL DEFAULT 'email_text' CHECK (format_type IN ('email_text','pdf_table','excel','mixed')),
  extraction_hints      text        NULL,
  active                boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  street                text        NULL,
  postal_code           text        NULL,
  city                  text        NULL,
  country               text        NULL,
  description           text        NULL
);

-- orders (FK → tenants, user_profiles, dealers)
CREATE TABLE public.orders (
  id                       uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id                uuid        NOT NULL REFERENCES public.tenants(id),
  uploaded_by              uuid        NULL REFERENCES public.user_profiles(id),
  status                   text        NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','processing','extracted','review','checked','approved','exported','error')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  dealer_id                uuid        NULL REFERENCES public.dealers(id),
  recognition_method       text        NOT NULL DEFAULT 'none' CHECK (recognition_method IN ('domain','address','subject','filename','manual','ai_content','none')),
  recognition_confidence   integer     NOT NULL DEFAULT 0 CHECK (recognition_confidence >= 0 AND recognition_confidence <= 100),
  dealer_overridden_by     uuid        NULL REFERENCES public.user_profiles(id),
  dealer_overridden_at     timestamptz NULL,
  override_reason          text        NULL,
  extraction_status        text        NULL CHECK (extraction_status IN ('pending','processing','extracted','failed')),
  extracted_data           jsonb       NULL,
  extraction_attempts      integer     NOT NULL DEFAULT 0,
  extraction_error         text        NULL,
  reviewed_data            jsonb       NULL,
  reviewed_at              timestamptz NULL,
  reviewed_by              uuid        NULL REFERENCES public.user_profiles(id),
  last_exported_at         timestamptz NULL,
  has_unmapped_articles    boolean     NOT NULL DEFAULT false,
  source                   text        NOT NULL DEFAULT 'web_upload' CHECK (source IN ('web_upload','email_inbound')),
  message_id               text        NULL,
  sender_email             text        NULL,
  ingestion_notes          jsonb       NULL,
  preview_token            text        NULL UNIQUE,
  preview_token_expires_at timestamptz NULL,
  subject                  text        NULL,
  output_format_confidence_score integer NULL CHECK (output_format_confidence_score IS NULL OR (output_format_confidence_score >= 0 AND output_format_confidence_score <= 100)),
  output_format_missing_columns  jsonb  NULL
);

-- order_files (FK → orders, tenants)
CREATE TABLE public.order_files (
  id                uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id          uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tenant_id         uuid        NOT NULL REFERENCES public.tenants(id),
  original_filename text        NOT NULL,
  storage_path      text        NOT NULL UNIQUE,
  file_size_bytes   bigint      NOT NULL CHECK (file_size_bytes > 0),
  mime_type         text        NOT NULL,
  sha256_hash       text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- order_edits (FK → orders, tenants, user_profiles)
CREATE TABLE public.order_edits (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id),
  user_id    uuid        NOT NULL REFERENCES public.user_profiles(id),
  field_path text        NOT NULL,
  old_value  jsonb       NULL,
  new_value  jsonb       NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- export_logs (FK → orders, tenants, user_profiles)
CREATE TABLE public.export_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid        NOT NULL REFERENCES public.orders(id),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id),
  user_id     uuid        NOT NULL REFERENCES public.user_profiles(id),
  format      text        NOT NULL CHECK (format IN ('csv','xml','json')),
  filename    text        NOT NULL,
  exported_at timestamptz NOT NULL DEFAULT now()
);

-- dealer_data_mappings (FK → dealers, tenants, user_profiles)
CREATE TABLE public.dealer_data_mappings (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id         uuid        NOT NULL REFERENCES public.dealers(id),
  tenant_id         uuid        NULL REFERENCES public.tenants(id),
  mapping_type      text        NOT NULL CHECK (mapping_type IN ('article_number','unit_conversion','field_label')),
  dealer_value      text        NOT NULL,
  erp_value         text        NOT NULL,
  conversion_factor numeric     NULL,
  description       text        NULL,
  active            boolean     NOT NULL DEFAULT true,
  created_by        uuid        NULL REFERENCES public.user_profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- dealer_audit_log (FK → dealers)
CREATE TABLE public.dealer_audit_log (
  id              uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  dealer_id       uuid        NOT NULL REFERENCES public.dealers(id),
  changed_by      uuid        NOT NULL,
  admin_email     text        NOT NULL,
  action          text        NOT NULL CHECK (action IN ('created','updated','deactivated','reactivated')),
  changed_fields  jsonb       NULL,
  snapshot_before jsonb       NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- dealer_column_mapping_profiles (FK → dealers)
CREATE TABLE public.dealer_column_mapping_profiles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id   uuid        NOT NULL REFERENCES public.dealers(id),
  format_type text        NOT NULL CHECK (format_type IN ('pdf_table','excel','email_text')),
  mappings    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- auth_rate_limits (no FK dependencies)
CREATE TABLE public.auth_rate_limits (
  id               uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  identifier       text        NOT NULL,
  identifier_type  text        NOT NULL CHECK (identifier_type IN ('email','ip','upload_ip')),
  attempt_count    integer     NOT NULL DEFAULT 1,
  first_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until     timestamptz NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- email_quarantine (FK → tenants, user_profiles, orders)
CREATE TABLE public.email_quarantine (
  id            uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id),
  sender_email  text        NOT NULL,
  sender_name   text        NULL,
  subject       text        NULL,
  message_id    text        NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  storage_path  text        NULL,
  review_status text        NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
  reviewed_by   uuid        NULL REFERENCES public.user_profiles(id),
  reviewed_at   timestamptz NULL,
  order_id      uuid        NULL REFERENCES public.orders(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- data_deletion_log (no FK — uses raw UUIDs for historical reference)
CREATE TABLE public.data_deletion_log (
  id               uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id        uuid        NOT NULL,
  order_id         uuid        NOT NULL,
  order_created_at timestamptz NULL,
  file_count       integer     NOT NULL DEFAULT 0,
  deleted_by       uuid        NULL,
  deletion_type    text        NOT NULL CHECK (deletion_type IN ('manual','automatic')),
  deleted_at       timestamptz NOT NULL DEFAULT now()
);

-- platform_settings (FK → auth.users)
CREATE TABLE public.platform_settings (
  id                        text        PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),
  error_notification_emails text[]      NOT NULL DEFAULT '{}',
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid        NULL REFERENCES auth.users(id)
);

-- erp_config_versions (FK → erp_configs, user_profiles)
CREATE TABLE public.erp_config_versions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_config_id  uuid        NOT NULL REFERENCES public.erp_configs(id) ON DELETE CASCADE,
  version_number integer     NOT NULL DEFAULT 1,
  snapshot       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  comment        text        NULL,
  created_by     uuid        NULL REFERENCES public.user_profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- tenant_output_formats (FK → tenants, auth.users, erp_configs)
CREATE TABLE public.tenant_output_formats (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NULL REFERENCES public.tenants(id),
  file_name             text        NOT NULL,
  file_path             text        NOT NULL,
  file_type             text        NOT NULL CHECK (file_type IN ('csv','xlsx','xml','json')),
  detected_schema       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  column_count          integer     NOT NULL DEFAULT 0,
  required_column_count integer     NOT NULL DEFAULT 0,
  uploaded_at           timestamptz NOT NULL DEFAULT now(),
  uploaded_by           uuid        NOT NULL REFERENCES auth.users(id),
  version               integer     NOT NULL DEFAULT 1,
  erp_config_id         uuid        NULL REFERENCES public.erp_configs(id),
  xml_structure         jsonb       NULL,
  field_mappings        jsonb       NULL
);

-- ============================================================
-- 4. INDEXES
-- ============================================================

-- auth_rate_limits
CREATE UNIQUE INDEX idx_auth_rate_limits_identifier ON public.auth_rate_limits (identifier, identifier_type);
CREATE INDEX idx_auth_rate_limits_locked_until ON public.auth_rate_limits (locked_until) WHERE (locked_until IS NOT NULL);

-- data_deletion_log
CREATE INDEX idx_data_deletion_log_tenant ON public.data_deletion_log (tenant_id, deleted_at DESC);

-- dealer_audit_log
CREATE INDEX idx_dealer_audit_log_created_at ON public.dealer_audit_log (created_at DESC);
CREATE INDEX idx_dealer_audit_log_dealer_id ON public.dealer_audit_log (dealer_id);

-- dealer_column_mapping_profiles
CREATE INDEX idx_column_mapping_profiles_dealer ON public.dealer_column_mapping_profiles (dealer_id);
CREATE UNIQUE INDEX idx_column_mapping_profiles_unique ON public.dealer_column_mapping_profiles (dealer_id, format_type);

-- dealer_data_mappings
CREATE INDEX idx_dealer_mappings_dealer ON public.dealer_data_mappings (dealer_id) WHERE (active = true);
CREATE INDEX idx_dealer_mappings_tenant ON public.dealer_data_mappings (tenant_id) WHERE (active = true);
CREATE UNIQUE INDEX idx_dealer_mappings_unique ON public.dealer_data_mappings (dealer_id, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), mapping_type, lower(TRIM(BOTH FROM dealer_value))) WHERE (active = true);

-- dealers
CREATE INDEX idx_dealers_active ON public.dealers (active) WHERE (active = true);
CREATE INDEX idx_dealers_country_city ON public.dealers (country, city) WHERE (active = true);
CREATE INDEX idx_dealers_name ON public.dealers (name);

-- email_quarantine
CREATE INDEX idx_email_quarantine_message_id ON public.email_quarantine (tenant_id, message_id) WHERE (message_id IS NOT NULL);
CREATE INDEX idx_email_quarantine_review_status ON public.email_quarantine (review_status);
CREATE INDEX idx_email_quarantine_tenant_id ON public.email_quarantine (tenant_id);

-- erp_config_versions
CREATE INDEX idx_erp_config_versions_config_id ON public.erp_config_versions (erp_config_id);
CREATE UNIQUE INDEX idx_erp_config_versions_unique_version ON public.erp_config_versions (erp_config_id, version_number);
CREATE INDEX idx_erp_config_versions_version_number ON public.erp_config_versions (erp_config_id, version_number DESC);

-- erp_configs
CREATE UNIQUE INDEX idx_erp_configs_name ON public.erp_configs (name);

-- export_logs
CREATE INDEX idx_export_logs_exported_at ON public.export_logs (exported_at DESC);
CREATE INDEX idx_export_logs_order_id ON public.export_logs (order_id);
CREATE INDEX idx_export_logs_tenant_id ON public.export_logs (tenant_id);

-- order_edits
CREATE INDEX idx_order_edits_changed_at ON public.order_edits (changed_at DESC);
CREATE INDEX idx_order_edits_order_id ON public.order_edits (order_id);
CREATE INDEX idx_order_edits_tenant_id ON public.order_edits (tenant_id);

-- order_files
CREATE INDEX idx_order_files_order_id ON public.order_files (order_id);
CREATE INDEX idx_order_files_sha256_hash ON public.order_files (sha256_hash);
CREATE INDEX idx_order_files_tenant_hash ON public.order_files (tenant_id, sha256_hash);
CREATE INDEX idx_order_files_tenant_id ON public.order_files (tenant_id);

-- orders
CREATE INDEX idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX idx_orders_dealer_id ON public.orders (dealer_id);
CREATE INDEX idx_orders_extraction_status ON public.orders (extraction_status) WHERE (extraction_status IS NOT NULL);
CREATE INDEX idx_orders_message_id ON public.orders (tenant_id, message_id) WHERE (message_id IS NOT NULL);
CREATE INDEX idx_orders_preview_token ON public.orders (preview_token) WHERE (preview_token IS NOT NULL);
CREATE INDEX idx_orders_reviewed_by ON public.orders (reviewed_by);
CREATE INDEX idx_orders_status ON public.orders (status);
CREATE INDEX idx_orders_tenant_created ON public.orders (tenant_id, created_at DESC);
CREATE INDEX idx_orders_tenant_id ON public.orders (tenant_id);
CREATE INDEX idx_orders_tenant_status ON public.orders (tenant_id, status);
CREATE INDEX idx_orders_tenant_status_created ON public.orders (tenant_id, status, created_at);
CREATE INDEX idx_orders_uploaded_by ON public.orders (uploaded_by);

-- tenant_output_formats
CREATE INDEX idx_output_formats_erp_config_id ON public.tenant_output_formats (erp_config_id);
CREATE UNIQUE INDEX idx_output_formats_erp_config_unique ON public.tenant_output_formats (erp_config_id) WHERE (erp_config_id IS NOT NULL);
CREATE UNIQUE INDEX idx_output_formats_tenant_unique ON public.tenant_output_formats (tenant_id) WHERE (tenant_id IS NOT NULL);
CREATE INDEX idx_tenant_output_formats_tenant_id ON public.tenant_output_formats (tenant_id);

-- tenants
CREATE INDEX idx_tenants_erp_config_id ON public.tenants (erp_config_id);
CREATE INDEX idx_tenants_slug ON public.tenants (slug);
CREATE INDEX idx_tenants_status ON public.tenants (status);
CREATE INDEX idx_tenants_trial_expires ON public.tenants (trial_expires_at) WHERE (status = 'trial');

-- user_profiles
CREATE INDEX idx_user_profiles_role ON public.user_profiles (role);
CREATE INDEX idx_user_profiles_status ON public.user_profiles (status);
CREATE INDEX idx_user_profiles_tenant_id ON public.user_profiles (tenant_id);
CREATE INDEX idx_user_profiles_tenant_status ON public.user_profiles (tenant_id, status);

-- ============================================================
-- 5. ROW LEVEL SECURITY — ENABLE + POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.erp_configs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dealers                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_files                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_edits                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_logs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dealer_data_mappings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dealer_audit_log               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dealer_column_mapping_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_rate_limits               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_quarantine               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_deletion_log              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_config_versions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_output_formats          ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- data_deletion_log policies
-- ---------------------------------------------------------------------------
CREATE POLICY "Admins can insert deletion logs"
  ON public.data_deletion_log FOR INSERT
  TO public
  WITH CHECK (
    (((current_setting('request.jwt.claims', true))::jsonb -> 'app_metadata') ->> 'role')
    = ANY (ARRAY['tenant_admin', 'platform_admin'])
  );

CREATE POLICY "Platform admins can read all deletion logs"
  ON public.data_deletion_log FOR SELECT
  TO public
  USING (
    (((current_setting('request.jwt.claims', true))::jsonb -> 'app_metadata') ->> 'role') = 'platform_admin'
  );

CREATE POLICY "Tenant users can read own deletion log"
  ON public.data_deletion_log FOR SELECT
  TO public
  USING (
    tenant_id = (((current_setting('request.jwt.claims', true))::jsonb -> 'app_metadata') ->> 'tenant_id')::uuid
  );

-- ---------------------------------------------------------------------------
-- dealer_audit_log policies
-- ---------------------------------------------------------------------------
CREATE POLICY "Platform admins can read dealer audit logs"
  ON public.dealer_audit_log FOR SELECT
  TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  );

-- ---------------------------------------------------------------------------
-- dealer_column_mapping_profiles policies
-- ---------------------------------------------------------------------------
CREATE POLICY "select_column_mapping_profiles"
  ON public.dealer_column_mapping_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "insert_column_mapping_profiles"
  ON public.dealer_column_mapping_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'platform_admin'
  );

CREATE POLICY "update_column_mapping_profiles"
  ON public.dealer_column_mapping_profiles FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'platform_admin'
  );

CREATE POLICY "delete_column_mapping_profiles"
  ON public.dealer_column_mapping_profiles FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'platform_admin'
  );

-- ---------------------------------------------------------------------------
-- dealer_data_mappings policies
-- ---------------------------------------------------------------------------
CREATE POLICY "select_mappings"
  ON public.dealer_data_mappings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "insert_mappings"
  ON public.dealer_data_mappings FOR INSERT
  TO authenticated
  WITH CHECK (
    ((SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'platform_admin')
    OR (
      (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'tenant_admin'
      AND tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "update_mappings"
  ON public.dealer_data_mappings FOR UPDATE
  TO authenticated
  USING (
    ((SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'platform_admin')
    OR (
      (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'tenant_admin'
      AND tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "delete_mappings"
  ON public.dealer_data_mappings FOR DELETE
  TO authenticated
  USING (
    ((SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'platform_admin')
    OR (
      (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'tenant_admin'
      AND tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- dealers policies
-- ---------------------------------------------------------------------------
CREATE POLICY "All authenticated users can read dealers"
  ON public.dealers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Platform admins can insert dealers"
  ON public.dealers FOR INSERT
  TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  );

CREATE POLICY "Platform admins can update dealers"
  ON public.dealers FOR UPDATE
  TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  )
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  );

CREATE POLICY "Platform admins can delete dealers"
  ON public.dealers FOR DELETE
  TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  );

-- ---------------------------------------------------------------------------
-- email_quarantine policies
-- ---------------------------------------------------------------------------
CREATE POLICY "Platform admins can view all quarantine entries"
  ON public.email_quarantine FOR SELECT
  TO public
  USING (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  );

CREATE POLICY "Platform admins can update quarantine entries"
  ON public.email_quarantine FOR UPDATE
  TO public
  USING (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  )
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  );

-- ---------------------------------------------------------------------------
-- erp_configs policies
-- ---------------------------------------------------------------------------
CREATE POLICY "erp_configs_select_platform_admin"
  ON public.erp_configs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

CREATE POLICY "erp_configs_select_tenant"
  ON public.erp_configs FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT t.erp_config_id
      FROM public.tenants t
      JOIN public.user_profiles up ON up.tenant_id = t.id
      WHERE up.id = auth.uid() AND t.erp_config_id IS NOT NULL
    )
  );

CREATE POLICY "erp_configs_insert_platform_admin"
  ON public.erp_configs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

CREATE POLICY "erp_configs_update_platform_admin"
  ON public.erp_configs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

CREATE POLICY "erp_configs_delete_platform_admin"
  ON public.erp_configs FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

-- ---------------------------------------------------------------------------
-- erp_config_versions policies
-- ---------------------------------------------------------------------------
CREATE POLICY "erp_config_versions_select_platform_admin"
  ON public.erp_config_versions FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

CREATE POLICY "erp_config_versions_insert_platform_admin"
  ON public.erp_config_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

-- ---------------------------------------------------------------------------
-- export_logs policies
-- ---------------------------------------------------------------------------
CREATE POLICY "export_logs_select_platform_admin"
  ON public.export_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

CREATE POLICY "export_logs_select_tenant"
  ON public.export_logs FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "export_logs_insert_platform_admin"
  ON public.export_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

CREATE POLICY "export_logs_insert_tenant"
  ON public.export_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- order_edits policies
-- ---------------------------------------------------------------------------
CREATE POLICY "order_edits_select_platform_admin"
  ON public.order_edits FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

CREATE POLICY "order_edits_select_tenant"
  ON public.order_edits FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "order_edits_insert_platform_admin"
  ON public.order_edits FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

CREATE POLICY "order_edits_insert_tenant"
  ON public.order_edits FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- order_files policies
-- ---------------------------------------------------------------------------
CREATE POLICY "Platform admins can view all order files"
  ON public.order_files FOR SELECT
  TO public
  USING (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  );

CREATE POLICY "Users can view own tenant order files"
  ON public.order_files FOR SELECT
  TO public
  USING (
    tenant_id = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id')::uuid
  );

-- ---------------------------------------------------------------------------
-- orders policies
-- ---------------------------------------------------------------------------
CREATE POLICY "Platform admins can view all orders"
  ON public.orders FOR SELECT
  TO public
  USING (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  );

CREATE POLICY "Users can view own tenant orders"
  ON public.orders FOR SELECT
  TO public
  USING (
    tenant_id = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id')::uuid
  );

CREATE POLICY "Users can update own tenant orders"
  ON public.orders FOR UPDATE
  TO public
  USING (
    tenant_id = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id')::uuid
  );

-- ---------------------------------------------------------------------------
-- platform_settings policies
-- ---------------------------------------------------------------------------
CREATE POLICY "platform_settings_select_admin"
  ON public.platform_settings FOR SELECT
  TO public
  USING (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  );

CREATE POLICY "platform_settings_update_admin"
  ON public.platform_settings FOR UPDATE
  TO public
  USING (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  )
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  );

-- ---------------------------------------------------------------------------
-- tenant_output_formats policies
-- ---------------------------------------------------------------------------
CREATE POLICY "platform_admins_select_output_formats"
  ON public.tenant_output_formats FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid() AND (u.raw_app_meta_data ->> 'role') = 'platform_admin'
    )
  );

CREATE POLICY "platform_admins_insert_output_formats"
  ON public.tenant_output_formats FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid() AND (u.raw_app_meta_data ->> 'role') = 'platform_admin'
    )
  );

CREATE POLICY "platform_admins_update_output_formats"
  ON public.tenant_output_formats FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid() AND (u.raw_app_meta_data ->> 'role') = 'platform_admin'
    )
  );

CREATE POLICY "platform_admins_delete_output_formats"
  ON public.tenant_output_formats FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid() AND (u.raw_app_meta_data ->> 'role') = 'platform_admin'
    )
  );

-- ---------------------------------------------------------------------------
-- tenants policies
-- ---------------------------------------------------------------------------
CREATE POLICY "Platform admins can view all tenants"
  ON public.tenants FOR SELECT
  TO public
  USING (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  );

CREATE POLICY "Users can view own tenant"
  ON public.tenants FOR SELECT
  TO public
  USING (
    id = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id')::uuid
  );

CREATE POLICY "Platform admins can insert tenants"
  ON public.tenants FOR INSERT
  TO public
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  );

CREATE POLICY "Platform admins can update tenants"
  ON public.tenants FOR UPDATE
  TO public
  USING (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  )
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  );

CREATE POLICY "Platform admins can delete tenants"
  ON public.tenants FOR DELETE
  TO public
  USING (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  );

-- ---------------------------------------------------------------------------
-- user_profiles policies
-- ---------------------------------------------------------------------------
CREATE POLICY "Platform admins can view all profiles"
  ON public.user_profiles FOR SELECT
  TO public
  USING (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  );

CREATE POLICY "Users can view own tenant profiles"
  ON public.user_profiles FOR SELECT
  TO public
  USING (
    tenant_id = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id')::uuid
  );

CREATE POLICY "Platform admins can insert profiles"
  ON public.user_profiles FOR INSERT
  TO public
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = 'platform_admin'
  );

CREATE POLICY "Tenant admins can update tenant profiles"
  ON public.user_profiles FOR UPDATE
  TO public
  USING (
    tenant_id = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id')::uuid
    AND ((auth.jwt() -> 'app_metadata') ->> 'role') = ANY (ARRAY['tenant_admin', 'platform_admin'])
  )
  WITH CHECK (
    tenant_id = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id')::uuid
    AND ((auth.jwt() -> 'app_metadata') ->> 'role') = ANY (ARRAY['tenant_admin', 'platform_admin'])
  );

CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  TO public
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Tenant admins can delete tenant profiles"
  ON public.user_profiles FOR DELETE
  TO public
  USING (
    tenant_id = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id')::uuid
    AND ((auth.jwt() -> 'app_metadata') ->> 'role') = ANY (ARRAY['tenant_admin', 'platform_admin'])
  );

-- ============================================================
-- 6. TRIGGERS
-- ============================================================

CREATE TRIGGER set_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_auth_rate_limits_updated_at
  BEFORE UPDATE ON public.auth_rate_limits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_dealers_updated_at
  BEFORE UPDATE ON public.dealers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.dealer_data_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.dealer_column_mapping_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 7. STORAGE BUCKETS + POLICIES
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('order-files', 'order-files', false),
  ('tenant-output-formats', 'tenant-output-formats', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can read own tenant folder"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'order-files'
    AND (storage.foldername(name))[1] = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id')
  );

CREATE POLICY "Authenticated users can upload to own tenant folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'order-files'
    AND (storage.foldername(name))[1] = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id')
  );

CREATE POLICY "Authenticated users can delete from own tenant folder"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'order-files'
    AND (storage.foldername(name))[1] = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id')
  );

-- ============================================================
-- 8. SEED DATA
-- ============================================================

INSERT INTO public.platform_settings (id)
VALUES ('singleton')
ON CONFLICT DO NOTHING;
