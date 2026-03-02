-- OPH-9: Admin ERP-Mapping-Konfiguration
-- Extends erp_configs with new columns, creates erp_config_versions table.
-- Model change: one active config per tenant (not per format).

-- ============================================================================
-- 1. Extend erp_configs with new columns
-- ============================================================================

ALTER TABLE public.erp_configs
  ADD COLUMN IF NOT EXISTS xml_template TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS line_ending TEXT NOT NULL DEFAULT 'LF'
    CHECK (line_ending IN ('LF', 'CRLF')),
  ADD COLUMN IF NOT EXISTS decimal_separator TEXT NOT NULL DEFAULT '.'
    CHECK (decimal_separator IN ('.', ',')),
  ADD COLUMN IF NOT EXISTS fallback_mode TEXT NOT NULL DEFAULT 'block'
    CHECK (fallback_mode IN ('block', 'fallback_csv'));

-- ============================================================================
-- 2. Drop old unique index (one default per tenant) and add new one
--    (one config per tenant, since we now have exactly one row per tenant)
-- ============================================================================

-- Drop the old partial unique index on (tenant_id) WHERE is_default = true
DROP INDEX IF EXISTS idx_erp_configs_tenant_default;

-- Add unique constraint: exactly one config per tenant
-- (We keep the format column for backward compatibility but each tenant has one row)
CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_configs_tenant_unique
  ON public.erp_configs(tenant_id);

-- ============================================================================
-- 3. Create erp_config_versions table (append-only version snapshots)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.erp_config_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_config_id UUID NOT NULL REFERENCES public.erp_configs(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  comment TEXT DEFAULT NULL,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_erp_config_versions_config_id
  ON public.erp_config_versions(erp_config_id);
CREATE INDEX IF NOT EXISTS idx_erp_config_versions_version_number
  ON public.erp_config_versions(erp_config_id, version_number DESC);

-- Unique: no duplicate version numbers per config
CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_config_versions_unique_version
  ON public.erp_config_versions(erp_config_id, version_number);

-- ============================================================================
-- 4. Enable RLS on erp_config_versions
-- ============================================================================

ALTER TABLE public.erp_config_versions ENABLE ROW LEVEL SECURITY;

-- Platform admins can read all versions
CREATE POLICY "erp_config_versions_select_platform_admin"
  ON public.erp_config_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'platform_admin'
    )
  );

-- Platform admins can insert versions
CREATE POLICY "erp_config_versions_insert_platform_admin"
  ON public.erp_config_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'platform_admin'
    )
  );

-- No UPDATE or DELETE policies — versions are immutable
