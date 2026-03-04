-- ============================================================================
-- OPH-12: DSGVO-Compliance & Datenaufbewahrung
-- ============================================================================

-- 1. Add data retention setting to tenants
ALTER TABLE public.tenants
  ADD COLUMN data_retention_days INTEGER NOT NULL DEFAULT 90
  CONSTRAINT data_retention_days_range CHECK (data_retention_days >= 30 AND data_retention_days <= 365);

-- 2. Create append-only data deletion log
CREATE TABLE public.data_deletion_log (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  order_id UUID NOT NULL,
  order_created_at TIMESTAMPTZ,
  file_count INTEGER NOT NULL DEFAULT 0,
  deleted_by UUID,
  deletion_type TEXT NOT NULL CHECK (deletion_type IN ('manual', 'automatic')),
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for tenant-scoped queries
CREATE INDEX idx_data_deletion_log_tenant ON public.data_deletion_log (tenant_id, deleted_at DESC);

-- 3. Enable RLS on deletion log
ALTER TABLE public.data_deletion_log ENABLE ROW LEVEL SECURITY;

-- Tenant users can read their own tenant's deletion log
CREATE POLICY "Tenant users can read own deletion log"
  ON public.data_deletion_log FOR SELECT
  USING (
    tenant_id = ((current_setting('request.jwt.claims', true)::jsonb) -> 'app_metadata' ->> 'tenant_id')::uuid
  );

-- Platform admins can read all deletion log entries
CREATE POLICY "Platform admins can read all deletion logs"
  ON public.data_deletion_log FOR SELECT
  USING (
    ((current_setting('request.jwt.claims', true)::jsonb) -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

-- Service role can insert deletion log entries
CREATE POLICY "Service role can insert deletion logs"
  ON public.data_deletion_log FOR INSERT
  WITH CHECK (true);

-- NO DELETE or UPDATE policies — this table is append-only
