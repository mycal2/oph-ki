-- OPH-8: RPC function for tenant order statistics.
-- Returns total order count, last-30-days count, and last upload timestamp per tenant.
-- Uses GROUP BY aggregation instead of fetching raw rows.

CREATE OR REPLACE FUNCTION public.get_tenant_order_stats()
RETURNS TABLE (
  tenant_id UUID,
  order_count BIGINT,
  orders_last_month BIGINT,
  last_upload_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    o.tenant_id,
    COUNT(*)::BIGINT AS order_count,
    COUNT(*) FILTER (WHERE o.created_at >= NOW() - INTERVAL '30 days')::BIGINT AS orders_last_month,
    MAX(o.created_at) AS last_upload_at
  FROM public.orders o
  GROUP BY o.tenant_id;
$$;
