import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  requirePlatformAdminOrViewer,
  isErrorResponse,
  checkAdminRateLimit,
} from "@/lib/admin-auth";
import type { AdminDashboardStats, LineDistribution, ApiResponse } from "@/lib/types";

/**
 * Allowed period values and their date range computation.
 */
const periodSchema = z.enum([
  "current_month",
  "last_month",
  "current_quarter",
  "last_quarter",
]);

type Period = z.infer<typeof periodSchema>;

function computeDateRange(period: Period): { start: Date; end: Date } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  switch (period) {
    case "current_month":
      return {
        start: new Date(year, month, 1),
        end: new Date(year, month + 1, 1),
      };
    case "last_month":
      return {
        start: new Date(year, month - 1, 1),
        end: new Date(year, month, 1),
      };
    case "current_quarter": {
      const qStart = Math.floor(month / 3) * 3;
      return {
        start: new Date(year, qStart, 1),
        end: new Date(year, qStart + 3, 1),
      };
    }
    case "last_quarter": {
      const currentQStart = Math.floor(month / 3) * 3;
      return {
        start: new Date(year, currentQStart - 3, 1),
        end: new Date(year, currentQStart, 1),
      };
    }
  }
}

/**
 * Compute "yesterday" as the end of the current-month revenue window.
 * If today is the 1st, "yesterday" is the last day of the previous month.
 */
function getYesterday(): Date {
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // "through yesterday" means the revenue period ends at the start of today
  return yesterday;
}

/**
 * GET /api/admin/stats?period=current_month|last_month|current_quarter|last_quarter
 *
 * Returns platform-wide KPIs for the admin dashboard.
 * Activity KPIs are filtered by the selected period.
 * Revenue KPIs are always fixed (current month YTD and last month).
 *
 * Platform admin or platform viewer only.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requirePlatformAdminOrViewer();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitResponse = checkAdminRateLimit(user.id);
    if (rateLimitResponse) return rateLimitResponse;

    // Parse and validate the period parameter
    const periodParam = request.nextUrl.searchParams.get("period") ?? "current_month";
    const periodResult = periodSchema.safeParse(periodParam);

    if (!periodResult.success) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Ungültiger Zeitraum. Erlaubt: current_month, last_month, current_quarter, last_quarter.",
        },
        { status: 400 }
      );
    }

    const period = periodResult.data;
    const { start: periodStart, end: periodEnd } = computeDateRange(period);

    // Revenue date ranges
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = getYesterday(); // through yesterday = start of today
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);

    // Call the RPC function with all date parameters
    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      "get_admin_dashboard_stats",
      {
        p_period_start: periodStart.toISOString(),
        p_period_end: periodEnd.toISOString(),
        p_current_month_start: currentMonthStart.toISOString(),
        p_current_month_end: currentMonthEnd.toISOString(),
        p_last_month_start: lastMonthStart.toISOString(),
        p_last_month_end: lastMonthEnd.toISOString(),
      }
    );

    if (rpcError) {
      console.error("Error calling get_admin_dashboard_stats:", rpcError.message);
      return NextResponse.json(
        { success: false, error: "Dashboard-Daten konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    // Parse the RPC result (comes back as a JSON object)
    const stats = rpcResult as {
      order_count: number;
      active_tenant_count: number;
      dealer_count: number;
      line_distribution: LineDistribution | null;
      revenue_current_month: {
        transaction_turnover: number;
        monthly_fee_turnover: number;
      } | null;
      revenue_last_month: {
        transaction_turnover: number;
        monthly_fee_turnover: number;
      } | null;
    };

    // Default line distribution if no orders exist
    const lineDistribution: LineDistribution = stats.line_distribution ?? {
      "1": 0,
      "2": 0,
      "3-5": 0,
      "6-10": 0,
      "11+": 0,
    };

    // Build revenue breakdowns
    const currentTx = Number(stats.revenue_current_month?.transaction_turnover ?? 0);
    const currentFee = Number(stats.revenue_current_month?.monthly_fee_turnover ?? 0);
    const lastTx = Number(stats.revenue_last_month?.transaction_turnover ?? 0);
    const lastFee = Number(stats.revenue_last_month?.monthly_fee_turnover ?? 0);

    // Compute "as of" date for current month revenue (yesterday's date)
    // currentMonthEnd = start of today, so subtract 1 day to get yesterday
    const asOfDate = new Date(currentMonthEnd);
    asOfDate.setDate(asOfDate.getDate() - 1);
    // Format as YYYY-MM-DD
    const asOf = asOfDate.toISOString().split("T")[0];

    const response: AdminDashboardStats = {
      orderCount: Number(stats.order_count ?? 0),
      activeTenantCount: Number(stats.active_tenant_count ?? 0),
      dealerCount: Number(stats.dealer_count ?? 0),
      lineDistribution,
      revenueCurrentMonth: {
        total: Math.round((currentTx + currentFee) * 100) / 100,
        transactionTurnover: Math.round(currentTx * 100) / 100,
        monthlyFeeTurnover: Math.round(currentFee * 100) / 100,
        asOf,
      },
      revenueLastMonth: {
        total: Math.round((lastTx + lastFee) * 100) / 100,
        transactionTurnover: Math.round(lastTx * 100) / 100,
        monthlyFeeTurnover: Math.round(lastFee * 100) / 100,
      },
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    console.error("Error in GET /api/admin/stats:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." } as ApiResponse,
      { status: 500 }
    );
  }
}
