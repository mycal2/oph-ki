-- OPH-53: Platform Admin KPI Dashboard
-- RPC function that returns activity KPIs (order count, dealer count, line distribution)
-- for a given date range, plus revenue KPIs for current and last month.
-- All heavy aggregation done in Postgres to avoid shipping raw rows to the app server.

-- ============================================================================
-- 1. Activity + Revenue stats RPC
-- Parameters:
--   p_period_start  — start of the selected activity period (inclusive)
--   p_period_end    — end of the selected activity period (exclusive)
--   p_current_month_start — 1st of current month (for revenue)
--   p_current_month_end   — today (exclusive, i.e. "through yesterday")
--   p_last_month_start    — 1st of previous month
--   p_last_month_end      — 1st of current month (exclusive)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats(
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_current_month_start TIMESTAMPTZ,
  p_current_month_end TIMESTAMPTZ,
  p_last_month_start TIMESTAMPTZ,
  p_last_month_end TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_order_count BIGINT;
  v_dealer_count BIGINT;
  v_line_dist JSON;
  v_active_tenant_count BIGINT;
  v_revenue_current JSON;
  v_revenue_last JSON;
BEGIN
  -- ===================== Activity KPIs (period-filtered) =====================

  -- Order count and distinct dealer count for the selected period
  SELECT
    COUNT(*)::BIGINT,
    COUNT(DISTINCT o.dealer_id)::BIGINT
  INTO v_order_count, v_dealer_count
  FROM public.orders o
  WHERE o.created_at >= p_period_start
    AND o.created_at < p_period_end;

  -- Active tenant count (always current, not period-filtered)
  SELECT COUNT(*)::BIGINT
  INTO v_active_tenant_count
  FROM public.tenants t
  WHERE t.status IN ('active', 'trial');

  -- Line distribution histogram: bucket orders by line_items array length
  SELECT json_agg(row_to_json(buckets))
  INTO v_line_dist
  FROM (
    SELECT
      COALESCE(SUM(CASE WHEN line_count = 1 THEN 1 ELSE 0 END), 0) AS "1",
      COALESCE(SUM(CASE WHEN line_count = 2 THEN 1 ELSE 0 END), 0) AS "2",
      COALESCE(SUM(CASE WHEN line_count BETWEEN 3 AND 5 THEN 1 ELSE 0 END), 0) AS "3-5",
      COALESCE(SUM(CASE WHEN line_count BETWEEN 6 AND 10 THEN 1 ELSE 0 END), 0) AS "6-10",
      COALESCE(SUM(CASE WHEN line_count > 10 THEN 1 ELSE 0 END), 0) AS "11+"
    FROM (
      SELECT
        jsonb_array_length(
          COALESCE(o.extracted_data->'order'->'line_items', '[]'::jsonb)
        ) AS line_count
      FROM public.orders o
      WHERE o.created_at >= p_period_start
        AND o.created_at < p_period_end
        AND o.extracted_data IS NOT NULL
    ) sub
  ) buckets;

  -- ===================== Revenue KPIs (fixed periods) =====================

  -- Current month revenue (through yesterday)
  SELECT json_build_object(
    'transaction_turnover', COALESCE(SUM(sub.order_count * sub.cost_per_order), 0),
    'monthly_fee_turnover', (
      SELECT COALESCE(SUM(t2.monthly_fee), 0)
      FROM public.tenants t2
      WHERE t2.status IN ('active', 'trial')
        AND t2.billing_model IS NOT NULL
    )
  )
  INTO v_revenue_current
  FROM (
    SELECT
      t.cost_per_order,
      COUNT(o.id)::NUMERIC AS order_count
    FROM public.tenants t
    INNER JOIN public.orders o ON o.tenant_id = t.id
      AND o.created_at >= p_current_month_start
      AND o.created_at < p_current_month_end
    WHERE t.billing_model IS NOT NULL
    GROUP BY t.id, t.cost_per_order
  ) sub;

  -- Last month revenue
  SELECT json_build_object(
    'transaction_turnover', COALESCE(SUM(sub.order_count * sub.cost_per_order), 0),
    'monthly_fee_turnover', (
      SELECT COALESCE(SUM(t2.monthly_fee), 0)
      FROM public.tenants t2
      WHERE t2.status IN ('active', 'trial')
        AND t2.billing_model IS NOT NULL
    )
  )
  INTO v_revenue_last
  FROM (
    SELECT
      t.cost_per_order,
      COUNT(o.id)::NUMERIC AS order_count
    FROM public.tenants t
    INNER JOIN public.orders o ON o.tenant_id = t.id
      AND o.created_at >= p_last_month_start
      AND o.created_at < p_last_month_end
    WHERE t.billing_model IS NOT NULL
    GROUP BY t.id, t.cost_per_order
  ) sub;

  -- ===================== Return combined result =====================
  RETURN json_build_object(
    'order_count', v_order_count,
    'active_tenant_count', v_active_tenant_count,
    'dealer_count', v_dealer_count,
    'line_distribution', v_line_dist->0,
    'revenue_current_month', v_revenue_current,
    'revenue_last_month', v_revenue_last
  );
END;
$$;

-- Grant execute to authenticated (RPC is SECURITY DEFINER; API layer enforces admin role)
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
