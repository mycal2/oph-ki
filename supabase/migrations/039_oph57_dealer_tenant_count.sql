-- OPH-57: Extend get_dealer_order_stats to also return tenant_count per dealer.
-- tenant_count = number of distinct tenants that have at least one order attributed to this dealer.

DROP FUNCTION IF EXISTS get_dealer_order_stats();

CREATE OR REPLACE FUNCTION get_dealer_order_stats()
RETURNS TABLE(dealer_id UUID, order_count BIGINT, last_order_at TIMESTAMPTZ, tenant_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.dealer_id,
    COUNT(*)::BIGINT AS order_count,
    MAX(o.created_at) AS last_order_at,
    COUNT(DISTINCT o.tenant_id)::BIGINT AS tenant_count
  FROM orders o
  WHERE o.dealer_id IS NOT NULL
  GROUP BY o.dealer_id;
$$;
