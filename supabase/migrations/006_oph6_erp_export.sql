-- OPH-6: ERP-Export & Download
-- Creates erp_configs and export_logs tables, adds last_exported_at to orders.

-- ============================================================================
-- 1. Add last_exported_at column to orders table
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS last_exported_at TIMESTAMPTZ DEFAULT NULL;

-- ============================================================================
-- 2. Create erp_configs table (one config per tenant per format)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.erp_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('csv', 'xml', 'json')),
  column_mappings JSONB NOT NULL DEFAULT '[]'::JSONB,
  separator TEXT NOT NULL DEFAULT ',',
  quote_char TEXT NOT NULL DEFAULT '"',
  encoding TEXT NOT NULL DEFAULT 'UTF-8',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for lookup by tenant
CREATE INDEX IF NOT EXISTS idx_erp_configs_tenant_id ON public.erp_configs(tenant_id);

-- Unique constraint: only one default config per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_configs_tenant_default
  ON public.erp_configs(tenant_id) WHERE is_default = true;

-- ============================================================================
-- 3. Enable RLS on erp_configs
-- ============================================================================

ALTER TABLE public.erp_configs ENABLE ROW LEVEL SECURITY;

-- Tenant users can read their own tenant's configs
CREATE POLICY "erp_configs_select_tenant"
  ON public.erp_configs
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

-- Platform admins can read all configs
CREATE POLICY "erp_configs_select_platform_admin"
  ON public.erp_configs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'platform_admin'
    )
  );

-- Platform admins can insert/update/delete configs (OPH-9 will add tenant_admin access)
CREATE POLICY "erp_configs_insert_platform_admin"
  ON public.erp_configs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'platform_admin'
    )
  );

CREATE POLICY "erp_configs_update_platform_admin"
  ON public.erp_configs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'platform_admin'
    )
  );

CREATE POLICY "erp_configs_delete_platform_admin"
  ON public.erp_configs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'platform_admin'
    )
  );

-- ============================================================================
-- 4. Create export_logs table (audit trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.export_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  format TEXT NOT NULL CHECK (format IN ('csv', 'xml', 'json')),
  filename TEXT NOT NULL,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_export_logs_order_id ON public.export_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_export_logs_tenant_id ON public.export_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_export_logs_exported_at ON public.export_logs(exported_at DESC);

-- ============================================================================
-- 5. Enable RLS on export_logs
-- ============================================================================

ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

-- Tenant users can read their own tenant's export logs
CREATE POLICY "export_logs_select_tenant"
  ON public.export_logs
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

-- Platform admins can read all export logs
CREATE POLICY "export_logs_select_platform_admin"
  ON public.export_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'platform_admin'
    )
  );

-- Tenant users can insert export logs for their own tenant
CREATE POLICY "export_logs_insert_tenant"
  ON public.export_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (
      SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

-- Platform admins can insert export logs for any tenant
CREATE POLICY "export_logs_insert_platform_admin"
  ON public.export_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'platform_admin'
    )
  );

-- No UPDATE or DELETE policies -- export logs are immutable audit records

-- ============================================================================
-- 6. Seed: Default CSV config for Demo Dental GmbH
-- ============================================================================
-- Note: This seed assumes the Demo Dental GmbH tenant exists.
-- In production, configs are created via the admin UI (OPH-9).

INSERT INTO public.erp_configs (tenant_id, format, column_mappings, separator, quote_char, encoding, is_default)
SELECT
  t.id,
  'csv',
  '[
    {"source_field": "position", "target_column_name": "Pos"},
    {"source_field": "article_number", "target_column_name": "Artikelnummer"},
    {"source_field": "description", "target_column_name": "Beschreibung"},
    {"source_field": "quantity", "target_column_name": "Menge"},
    {"source_field": "unit", "target_column_name": "Einheit"},
    {"source_field": "unit_price", "target_column_name": "Einzelpreis"},
    {"source_field": "total_price", "target_column_name": "Gesamtpreis"},
    {"source_field": "currency", "target_column_name": "Waehrung"}
  ]'::JSONB,
  ';',
  '"',
  'UTF-8',
  true
FROM public.tenants t
WHERE t.slug = 'demo-dental'
ON CONFLICT DO NOTHING;
