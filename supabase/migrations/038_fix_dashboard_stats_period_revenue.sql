-- Fix OPH-53: Make revenue KPIs period-aware (same period as activity KPIs).
-- Removes the 4 extra date params; revenue now uses p_period_start / p_period_end.
-- Computes monthCount for monthly fee multiplication within the selected period.

DROP FUNCTION IF EXISTS public.get_admin_dashboard_stats(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats(
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ
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
  v_month_count INT;
  v_revenue JSON;
BEGIN
  -- ===================== Activity KPIs =====================

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

  -- Line distribution histogram
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

  -- ===================== Revenue KPI (period-filtered) =====================

  -- Month count: number of distinct (year, month) pairs in the period
  v_month_count := (
    SELECT COUNT(DISTINCT (EXTRACT(YEAR FROM d)::INT * 100 + EXTRACT(MONTH FROM d)::INT))
    FROM generate_series(p_period_start::DATE, (p_period_end - INTERVAL '1 day')::DATE, INTERVAL '1 day') AS d
  );
  IF v_month_count < 1 THEN
    v_month_count := 1;
  END IF;

  SELECT json_build_object(
    'transaction_turnover', COALESCE(SUM(sub.order_count * sub.cost_per_order), 0),
    'monthly_fee_turnover', ROUND(
      (SELECT COALESCE(SUM(t2.monthly_fee), 0)
       FROM public.tenants t2
       WHERE t2.status IN ('active', 'trial')
         AND t2.billing_model IS NOT NULL
      ) * v_month_count, 2
    )
  )
  INTO v_revenue
  FROM (
    SELECT
      t.cost_per_order,
      COUNT(o.id)::NUMERIC AS order_count
    FROM public.tenants t
    INNER JOIN public.orders o ON o.tenant_id = t.id
      AND o.created_at >= p_period_start
      AND o.created_at < p_period_end
    WHERE t.billing_model IS NOT NULL
    GROUP BY t.id, t.cost_per_order
  ) sub;

  -- ===================== Return combined result =====================
  RETURN json_build_object(
    'order_count', v_order_count,
    'active_tenant_count', v_active_tenant_count,
    'dealer_count', v_dealer_count,
    'line_distribution', v_line_dist->0,
    'revenue', v_revenue
  );
END;
$$;

-- Grant execute to service_role only
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
