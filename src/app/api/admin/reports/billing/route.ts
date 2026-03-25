import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  requirePlatformAdminOrViewer,
  isErrorResponse,
  checkAdminRateLimit,
} from "@/lib/admin-auth";
import { billingReportSchema } from "@/lib/validations";
import type { BillingReportResponse, ApiResponse } from "@/lib/types";

/**
 * Compute the number of months between two dates (inclusive of partial months).
 * Used to detect >12 month ranges for the soft warning.
 */
function monthsBetween(from: string, to: string): number {
  const start = new Date(from);
  const end = new Date(to);
  return (
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    1
  );
}

/**
 * POST /api/admin/reports/billing
 *
 * Generates a billing report for the selected date range and tenants.
 * Returns per-tenant rows (multi-tenant mode) or per-day rows (single-tenant mode)
 * with order counts, line item counts, and optional pricing columns.
 *
 * Platform admin or platform viewer only.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Authenticate
    const auth = await requirePlatformAdminOrViewer();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    // 2. Rate limit
    const rateLimitResponse = checkAdminRateLimit(user.id);
    if (rateLimitResponse) return rateLimitResponse;

    // 3. Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Ungueltiger JSON-Body." } as ApiResponse,
        { status: 400 }
      );
    }

    const parsed = billingReportSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungueltige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError } as ApiResponse,
        { status: 400 }
      );
    }

    const { from, to, tenantIds, includePrices } = parsed.data;

    // 4. Soft warning for date ranges >12 months
    const months = monthsBetween(from, to);
    const warning =
      months > 12
        ? `Der gewaehlte Zeitraum umfasst ${months} Monate. Bei grossen Zeitraeumen kann die Berichterstellung laenger dauern.`
        : undefined;

    // 5. Call the RPC function
    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      "get_billing_report",
      {
        p_from: from,
        p_to: to,
        p_tenant_ids: tenantIds,
        p_include_prices: includePrices,
      }
    );

    if (rpcError) {
      console.error("Error calling get_billing_report:", rpcError.message);
      return NextResponse.json(
        {
          success: false,
          error: "Abrechnungsbericht konnte nicht erstellt werden.",
        } as ApiResponse,
        { status: 500 }
      );
    }

    // 6. Shape the response
    const report = rpcResult as {
      mode: "multi-tenant" | "single-tenant";
      from: string;
      to: string;
      monthCount: number;
      rows: unknown[];
      totals: unknown;
    };

    const response: BillingReportResponse = {
      mode: report.mode,
      from: report.from,
      to: report.to,
      monthCount: report.monthCount,
      rows: (report.rows ?? []) as BillingReportResponse["rows"],
      totals: report.totals as BillingReportResponse["totals"],
      ...(warning ? { warning } : {}),
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    console.error("Error in POST /api/admin/reports/billing:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." } as ApiResponse,
      { status: 500 }
    );
  }
}
