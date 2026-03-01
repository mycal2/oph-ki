-- OPH-7: Create RPC function for efficient dealer order statistics.
-- Used by GET /api/admin/dealers to show order count + last order date per dealer.

CREATE OR REPLACE FUNCTION get_dealer_order_stats()
RETURNS TABLE(dealer_id UUID, order_count BIGINT, last_order_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    o.dealer_id,
    COUNT(*)::BIGINT AS order_count,
    MAX(o.created_at) AS last_order_at
  FROM orders o
  WHERE o.dealer_id IS NOT NULL
  GROUP BY o.dealer_id;
$$;
