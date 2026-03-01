-- Fix BUG-009 (OPH-6 QA): Add unique constraint on erp_configs(tenant_id, format)
-- Prevents duplicate configs per tenant per format, ensuring deterministic config lookup.
CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_configs_tenant_format
  ON public.erp_configs(tenant_id, format);
