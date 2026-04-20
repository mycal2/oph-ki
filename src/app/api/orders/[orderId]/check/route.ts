import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { orderCheckSchema } from "@/lib/validations";
import type { AppMetadata, ApiResponse } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Response shape for POST /api/orders/[orderId]/check. */
interface OrderCheckResponse {
  orderId: string;
  status: "checked";
  updatedAt: string;
}

/**
 * POST /api/orders/[orderId]/check
 *
 * OPH-90: Marks an order as "checked" (Geprueft).
 * Valid source statuses: extracted, review, checked.
 * Does NOT trigger ERP export or any downstream processing.
 * Does NOT set reviewed_at/reviewed_by (those are reserved for "approved").
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse<ApiResponse<OrderCheckResponse>>> {
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
        { success: false, error: "Ungueltige Bestellungs-ID." },
        { status: 400 }
      );
    }

    // 4. Parse body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Ungueltiger JSON-Body." },
        { status: 400 }
      );
    }

    const parsed = orderCheckSchema.safeParse(body);
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
      .select("id, tenant_id, updated_at, status")
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
          error: "Diese Bestellung wurde in der Zwischenzeit geaendert. Bitte laden Sie die Seite neu.",
        },
        { status: 409 }
      );
    }

    // 7. Check order is in a valid state for checking
    const validStatuses = ["extracted", "review", "checked"];
    if (!validStatuses.includes(order.status as string)) {
      return NextResponse.json(
        {
          success: false,
          error: `Bestellung kann im Status "${order.status}" nicht als geprueft markiert werden.`,
        },
        { status: 400 }
      );
    }

    // 8. Update status to "checked"
    const { data: updated, error: updateError } = await adminClient
      .from("orders")
      .update({ status: "checked" })
      .eq("id", orderId)
      .select("updated_at")
      .single();

    if (updateError || !updated) {
      console.error("Error marking order as checked:", updateError?.message);
      return NextResponse.json(
        { success: false, error: "Markierung als geprueft fehlgeschlagen." },
        { status: 500 }
      );
    }

    // 9. Audit log entry
    if (order.status !== "checked") {
      await adminClient.from("order_edits").insert({
        order_id: orderId,
        tenant_id: order.tenant_id as string,
        user_id: user.id,
        field_path: "status",
        old_value: order.status,
        new_value: "checked",
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        orderId,
        status: "checked" as const,
        updatedAt: updated.updated_at as string,
      },
    });
  } catch (error) {
    console.error("Unexpected error in POST /api/orders/[orderId]/check:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
