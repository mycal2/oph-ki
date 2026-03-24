-- OPH-50: Extend get_tenant_order_stats to include dealer_count.
-- Adds COUNT(DISTINCT dealer_id) to the existing per-tenant aggregation.
-- DROP required because the return type changed (new column).

DROP FUNCTION IF EXISTS public.get_tenant_order_stats();

CREATE OR REPLACE FUNCTION public.get_tenant_order_stats()
RETURNS TABLE (
  tenant_id UUID,
  order_count BIGINT,
  orders_last_month BIGINT,
  last_upload_at TIMESTAMPTZ,
  dealer_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    o.tenant_id,
    COUNT(*)::BIGINT AS order_count,
    COUNT(*) FILTER (WHERE o.created_at >= NOW() - INTERVAL '30 days')::BIGINT AS orders_last_month,
    MAX(o.created_at) AS last_upload_at,
    COUNT(DISTINCT o.dealer_id)::BIGINT AS dealer_count
  FROM public.orders o
  GROUP BY o.tenant_id;
$$;
