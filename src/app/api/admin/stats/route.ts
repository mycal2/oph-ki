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
 * GET /api/admin/stats?period=current_month|last_month|current_quarter|last_quarter
 *
 * Returns platform-wide KPIs for the admin dashboard.
 * Both activity and revenue KPIs are filtered by the selected period.
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

    // Call the RPC function — both activity and revenue use the same period
    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      "get_admin_dashboard_stats",
      {
        p_period_start: periodStart.toISOString(),
        p_period_end: periodEnd.toISOString(),
      }
    );

    if (rpcError) {
      console.error("Error calling get_admin_dashboard_stats:", rpcError.message);
      return NextResponse.json(
        { success: false, error: "Dashboard-Daten konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    // Parse the RPC result
    const stats = rpcResult as {
      order_count: number;
      active_tenant_count: number;
      dealer_count: number;
      line_distribution: LineDistribution | null;
      revenue: {
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

    const txTurnover = Number(stats.revenue?.transaction_turnover ?? 0);
    const feeTurnover = Number(stats.revenue?.monthly_fee_turnover ?? 0);

    const response: AdminDashboardStats = {
      orderCount: Number(stats.order_count ?? 0),
      activeTenantCount: Number(stats.active_tenant_count ?? 0),
      dealerCount: Number(stats.dealer_count ?? 0),
      lineDistribution,
      revenue: {
        total: Math.round((txTurnover + feeTurnover) * 100) / 100,
        transactionTurnover: Math.round(txTurnover * 100) / 100,
        monthlyFeeTurnover: Math.round(feeTurnover * 100) / 100,
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
