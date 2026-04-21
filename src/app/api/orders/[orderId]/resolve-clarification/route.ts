import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { orderResolveClarificationSchema } from "@/lib/validations";
import type { AppMetadata, ApiResponse } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Response shape for POST /api/orders/[orderId]/resolve-clarification. */
interface OrderResolveClarificationResponse {
  orderId: string;
  status: "extracted";
  updatedAt: string;
}

/**
 * POST /api/orders/[orderId]/resolve-clarification
 *
 * OPH-93: Resolves clarification by resetting order back to "extracted".
 * Valid source status: clarification only.
 * Clears the clarification_note.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse<ApiResponse<OrderResolveClarificationResponse>>> {
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

    const parsed = orderResolveClarificationSchema.safeParse(body);
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
      .select("id, tenant_id, updated_at, status, clarification_note")
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

    // 7. Check order is in clarification state
    if (order.status !== "clarification") {
      return NextResponse.json(
        {
          success: false,
          error: `Klaerung kann nur fuer Bestellungen im Status "Klaerung" abgeschlossen werden. Aktueller Status: "${order.status}".`,
        },
        { status: 400 }
      );
    }

    // 8. Reset status to "extracted" and clear clarification note
    const { data: updated, error: updateError } = await adminClient
      .from("orders")
      .update({
        status: "extracted",
        clarification_note: null,
      })
      .eq("id", orderId)
      .select("updated_at")
      .single();

    if (updateError || !updated) {
      console.error("Error resolving clarification:", updateError?.message);
      return NextResponse.json(
        { success: false, error: "Klaerung konnte nicht abgeschlossen werden." },
        { status: 500 }
      );
    }

    // 9. Audit log entries
    await adminClient.from("order_edits").insert({
      order_id: orderId,
      tenant_id: order.tenant_id as string,
      user_id: user.id,
      field_path: "status",
      old_value: "clarification",
      new_value: "extracted",
    });

    if (order.clarification_note) {
      await adminClient.from("order_edits").insert({
        order_id: orderId,
        tenant_id: order.tenant_id as string,
        user_id: user.id,
        field_path: "clarification_note",
        old_value: order.clarification_note,
        new_value: null,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        orderId,
        status: "extracted" as const,
        updatedAt: updated.updated_at as string,
      },
    });
  } catch (error) {
    console.error("Unexpected error in POST /api/orders/[orderId]/resolve-clarification:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
