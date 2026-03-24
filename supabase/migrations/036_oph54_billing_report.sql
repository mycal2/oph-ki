-- OPH-54: Platform Admin Billing Report
-- RPC function that returns per-tenant or per-day billing data for a date range.
-- Supports two modes:
--   - Multi-tenant (>1 tenant selected): one row per tenant with aggregated counts
--   - Single-tenant (exactly 1 tenant): one row per day in the range
-- Server pre-calculates all totals so the frontend does zero arithmetic.

-- ============================================================================
-- 1. Billing report RPC
-- Parameters:
--   p_from       — start of the date range (inclusive)
--   p_to         — end of the date range (inclusive, will be made exclusive +1 day)
--   p_tenant_ids — array of tenant UUIDs to include
--   p_include_prices — whether to compute pricing columns
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_billing_report(
  p_from DATE,
  p_to DATE,
  p_tenant_ids UUID[],
  p_include_prices BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_count INT;
  v_mode TEXT;
  v_month_count INT;
  v_rows JSON;
  v_totals JSON;
  v_to_exclusive TIMESTAMPTZ;
  v_from_ts TIMESTAMPTZ;
BEGIN
  -- Validate inputs
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'from and to dates are required';
  END IF;

  IF p_from > p_to THEN
    RAISE EXCEPTION 'from date must be before or equal to to date';
  END IF;

  IF p_tenant_ids IS NULL OR array_length(p_tenant_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'at least one tenant ID is required';
  END IF;

  v_tenant_count := array_length(p_tenant_ids, 1);
  v_mode := CASE WHEN v_tenant_count = 1 THEN 'single-tenant' ELSE 'multi-tenant' END;

  -- Convert dates to timestamps for querying (p_to is inclusive, so +1 day for exclusive bound)
  v_from_ts := p_from::TIMESTAMPTZ;
  v_to_exclusive := (p_to + INTERVAL '1 day')::TIMESTAMPTZ;

  -- Compute month count: number of distinct (year, month) pairs in the range.
  -- Partial months count as full months.
  v_month_count := (
    SELECT COUNT(DISTINCT (EXTRACT(YEAR FROM d)::INT * 100 + EXTRACT(MONTH FROM d)::INT))
    FROM generate_series(p_from, p_to, INTERVAL '1 day') AS d
  );

  IF v_mode = 'multi-tenant' THEN
    -- ===================== Multi-tenant mode =====================
    -- One row per tenant with aggregated order counts and line item counts
    SELECT json_agg(row_order)
    INTO v_rows
    FROM (
      SELECT json_build_object(
        'tenantId', t.id,
        'tenantName', t.name,
        'orderCount', COALESCE(agg.order_count, 0),
        'lineItemCount', COALESCE(agg.line_item_count, 0),
        'costPerOrder', CASE WHEN p_include_prices AND t.billing_model IS NOT NULL
                             THEN COALESCE(t.cost_per_order, 0) ELSE NULL END,
        'transactionTotal', CASE WHEN p_include_prices AND t.billing_model IS NOT NULL
                                 THEN ROUND(COALESCE(agg.order_count, 0) * COALESCE(t.cost_per_order, 0), 2) ELSE NULL END,
        'monthlyFee', CASE WHEN p_include_prices AND t.billing_model IS NOT NULL
                           THEN ROUND(COALESCE(t.monthly_fee, 0) * v_month_count, 2) ELSE NULL END,
        'billingModel', t.billing_model
      ) AS row_order
      FROM public.tenants t
      LEFT JOIN (
        SELECT
          o.tenant_id,
          COUNT(*)::INT AS order_count,
          COALESCE(SUM(
            jsonb_array_length(
              COALESCE(o.extracted_data->'order'->'line_items', '[]'::jsonb)
            )
          ), 0)::INT AS line_item_count
        FROM public.orders o
        WHERE o.created_at >= v_from_ts
          AND o.created_at < v_to_exclusive
          AND o.tenant_id = ANY(p_tenant_ids)
        GROUP BY o.tenant_id
      ) agg ON agg.tenant_id = t.id
      WHERE t.id = ANY(p_tenant_ids)
      ORDER BY t.name
    ) sub;

    -- Totals row
    SELECT json_build_object(
      'orderCount', COALESCE(SUM((r->>'orderCount')::INT), 0),
      'lineItemCount', COALESCE(SUM((r->>'lineItemCount')::INT), 0),
      'transactionTotal', CASE WHEN p_include_prices
        THEN ROUND(COALESCE(SUM((r->>'transactionTotal')::NUMERIC), 0), 2) ELSE NULL END,
      'monthlyFeeTotal', CASE WHEN p_include_prices
        THEN ROUND(COALESCE(SUM((r->>'monthlyFee')::NUMERIC), 0), 2) ELSE NULL END
    )
    INTO v_totals
    FROM json_array_elements(COALESCE(v_rows, '[]'::json)) r;

  ELSE
    -- ===================== Single-tenant mode =====================
    -- One row per day in the date range
    SELECT json_agg(row_order)
    INTO v_rows
    FROM (
      SELECT json_build_object(
        'date', d::DATE,
        'orderCount', COALESCE(agg.order_count, 0),
        'lineItemCount', COALESCE(agg.line_item_count, 0),
        'transactionTotal', CASE WHEN p_include_prices AND t.billing_model IS NOT NULL
          THEN ROUND(COALESCE(agg.order_count, 0) * COALESCE(t.cost_per_order, 0), 2) ELSE NULL END
      ) AS row_order
      FROM generate_series(p_from, p_to, INTERVAL '1 day') AS d
      CROSS JOIN (
        SELECT * FROM public.tenants WHERE id = p_tenant_ids[1]
      ) t
      LEFT JOIN (
        SELECT
          (o.created_at AT TIME ZONE 'Europe/Berlin')::DATE AS order_date,
          COUNT(*)::INT AS order_count,
          COALESCE(SUM(
            jsonb_array_length(
              COALESCE(o.extracted_data->'order'->'line_items', '[]'::jsonb)
            )
          ), 0)::INT AS line_item_count
        FROM public.orders o
        WHERE o.created_at >= v_from_ts
          AND o.created_at < v_to_exclusive
          AND o.tenant_id = p_tenant_ids[1]
        GROUP BY (o.created_at AT TIME ZONE 'Europe/Berlin')::DATE
      ) agg ON agg.order_date = d::DATE
      ORDER BY d
    ) sub;

    -- Totals row (monthly fee only appears in totals for single-tenant daily view)
    DECLARE
      v_tenant RECORD;
    BEGIN
      SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_ids[1];

      SELECT json_build_object(
        'orderCount', COALESCE(SUM((r->>'orderCount')::INT), 0),
        'lineItemCount', COALESCE(SUM((r->>'lineItemCount')::INT), 0),
        'transactionTotal', CASE WHEN p_include_prices AND v_tenant.billing_model IS NOT NULL
          THEN ROUND(COALESCE(SUM((r->>'transactionTotal')::NUMERIC), 0), 2) ELSE NULL END,
        'monthlyFeeTotal', CASE WHEN p_include_prices AND v_tenant.billing_model IS NOT NULL
          THEN ROUND(COALESCE(v_tenant.monthly_fee, 0) * v_month_count, 2) ELSE NULL END,
        'costPerOrder', CASE WHEN p_include_prices AND v_tenant.billing_model IS NOT NULL
          THEN COALESCE(v_tenant.cost_per_order, 0) ELSE NULL END
      )
      INTO v_totals
      FROM json_array_elements(COALESCE(v_rows, '[]'::json)) r;
    END;
  END IF;

  -- Return combined result
  RETURN json_build_object(
    'mode', v_mode,
    'from', p_from,
    'to', p_to,
    'monthCount', v_month_count,
    'rows', COALESCE(v_rows, '[]'::json),
    'totals', v_totals
  );
END;
$$;

-- Grant execute to service_role only (API uses adminClient; never expose to authenticated)
GRANT EXECUTE ON FUNCTION public.get_billing_report(DATE, DATE, UUID[], BOOLEAN) TO service_role;
