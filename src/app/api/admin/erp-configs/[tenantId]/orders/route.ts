import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/erp-configs/[tenantId]/orders
 *
 * Returns approved/exported orders for a tenant (for the ERP config test dialog).
 * Platform admin only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
): Promise<NextResponse> {
  try {
    const { tenantId } = await params;
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    if (!UUID_REGEX.test(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Mandanten-ID." },
        { status: 400 }
      );
    }

    // Fetch approved/exported orders with extracted data
    const { data: orders, error } = await adminClient
      .from("orders")
      .select("id, status, extracted_data, reviewed_data, created_at")
      .eq("tenant_id", tenantId)
      .in("status", ["approved", "exported"])
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching orders:", error.message);
      return NextResponse.json(
        { success: false, error: "Bestellungen konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    // Map to lightweight response
    const result = (orders ?? []).map((o) => {
      const data = (o.reviewed_data ?? o.extracted_data) as { order?: { order_number?: string } } | null;
      return {
        id: o.id as string,
        order_number: (data?.order?.order_number as string) ?? null,
        created_at: o.created_at as string,
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error in GET /api/admin/erp-configs/[tenantId]/orders:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
