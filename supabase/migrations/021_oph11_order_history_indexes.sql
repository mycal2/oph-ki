-- OPH-11: Bestellhistorie & Dashboard
-- Performance indexes for order list filtering, pagination, and dashboard stats.

-- Primary list sort: tenant + created_at desc
CREATE INDEX IF NOT EXISTS idx_orders_tenant_created
  ON public.orders (tenant_id, created_at DESC);

-- Status filter: tenant + status
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status
  ON public.orders (tenant_id, status);

-- Stats queries: tenant + status + created_at
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status_created
  ON public.orders (tenant_id, status, created_at);
