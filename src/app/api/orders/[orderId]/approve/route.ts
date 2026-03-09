import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewApproveSchema } from "@/lib/validations";
import type { AppMetadata, ApiResponse, ReviewApproveResponse, CanonicalOrderData } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/orders/[orderId]/approve
 *
 * Approves/releases an order after review.
 * Validates that at least 1 line item with description and quantity exists.
 * Sets status to "approved" (ready for export in OPH-6).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse<ApiResponse<ReviewApproveResponse>>> {
  try {
    const { orderId } = await params;

    // 1. Authenticate
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Nicht authentifiziert." },
        { status: 401 }
      );
    }

    // 2. Check user/tenant status
    const appMetadata = user.app_metadata as AppMetadata | undefined;

    if (appMetadata?.user_status === "inactive") {
      return NextResponse.json(
        { success: false, error: "Ihr Konto ist deaktiviert." },
        { status: 403 }
      );
    }

    if (appMetadata?.tenant_status === "inactive") {
      return NextResponse.json(
        { success: false, error: "Ihr Mandant ist deaktiviert." },
        { status: 403 }
      );
    }

    const tenantId = appMetadata?.tenant_id;
    const isPlatformAdmin = appMetadata?.role === "platform_admin";

    if (!tenantId && !isPlatformAdmin) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    // 3. Validate orderId
    if (!UUID_REGEX.test(orderId)) {
      return NextResponse.json(
        { success: false, error: "Ungültige Bestellungs-ID." },
        { status: 400 }
      );
    }

    // 4. Parse body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Ungültiger JSON-Body." },
        { status: 400 }
      );
    }

    const parsed = reviewApproveSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Validierungsfehler.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { updatedAt } = parsed.data;
    const adminClient = createAdminClient();

    // 5. Fetch order
    let query = adminClient
      .from("orders")
      .select("id, tenant_id, updated_at, status, reviewed_data, extracted_data")
      .eq("id", orderId);

    if (!isPlatformAdmin && tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data: order, error: orderError } = await query.single();

    if (orderError || !order) {
      return NextResponse.json(
        { success: false, error: "Bestellung nicht gefunden." },
        { status: 404 }
      );
    }

    // 6. Optimistic locking
    if (updatedAt && order.updated_at !== updatedAt) {
      return NextResponse.json(
        {
          success: false,
          error: "Diese Bestellung wurde in der Zwischenzeit geändert. Bitte laden Sie die Seite neu.",
        },
        { status: 409 }
      );
    }

    // 7. Check order is in a valid state for approval
    const validStatuses = ["extracted", "review", "approved"];
    if (!validStatuses.includes(order.status as string)) {
      return NextResponse.json(
        {
          success: false,
          error: `Bestellung kann im Status "${order.status}" nicht freigegeben werden.`,
        },
        { status: 400 }
      );
    }

    // 8. Validate reviewed data has at least 1 line item with description + quantity
    const reviewedData = (order.reviewed_data ?? order.extracted_data) as CanonicalOrderData | null;

    if (!reviewedData) {
      return NextResponse.json(
        { success: false, error: "Keine Extraktionsdaten vorhanden. Freigabe nicht möglich." },
        { status: 400 }
      );
    }

    const hasValidLineItem = reviewedData.order.line_items.some(
      (item) =>
        item.description &&
        item.description.trim().length > 0 &&
        item.quantity > 0
    );

    if (!hasValidLineItem) {
      return NextResponse.json(
        {
          success: false,
          error: "Mindestens eine Bestellposition mit Beschreibung und Menge ist erforderlich.",
        },
        { status: 400 }
      );
    }

    // 9. Approve: update status, set reviewer info
    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await adminClient
      .from("orders")
      .update({
        status: "approved",
        reviewed_at: now,
        reviewed_by: user.id,
        // If reviewed_data is null, copy from extracted_data
        ...(order.reviewed_data ? {} : { reviewed_data: order.extracted_data }),
      })
      .eq("id", orderId)
      .select("updated_at")
      .single();

    if (updateError || !updated) {
      console.error("Error approving order:", updateError?.message);
      return NextResponse.json(
        { success: false, error: "Freigabe fehlgeschlagen." },
        { status: 500 }
      );
    }

    // 10. Audit log entry for approval
    await adminClient.from("order_edits").insert({
      order_id: orderId,
      tenant_id: order.tenant_id as string,
      user_id: user.id,
      field_path: "status",
      old_value: order.status,
      new_value: "approved",
    });

    return NextResponse.json({
      success: true,
      data: {
        orderId,
        status: "approved" as const,
        reviewedAt: now,
        reviewedBy: user.id,
      },
    });
  } catch (error) {
    console.error("Unexpected error in POST /api/orders/[orderId]/approve:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
