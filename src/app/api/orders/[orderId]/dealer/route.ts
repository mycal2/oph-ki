import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dealerOverrideSchema } from "@/lib/validations";
import type { AppMetadata, ApiResponse, DealerOverrideResponse } from "@/lib/types";

/**
 * PATCH /api/orders/[orderId]/dealer
 *
 * Manual dealer override. Users can correct the automatic recognition
 * by selecting a different dealer. Uses optimistic locking via updated_at
 * to prevent concurrent edit conflicts.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse<ApiResponse<DealerOverrideResponse>>> {
  try {
    const { orderId } = await params;

    // 1. Verify authentication
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

    // 3. Validate orderId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orderId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Bestellungs-ID." },
        { status: 400 }
      );
    }

    // 4. Parse and validate JSON body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Ungueltiges JSON im Anfrage-Body." },
        { status: 400 }
      );
    }

    const parsed = dealerOverrideSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungueltige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { dealerId, reason, updatedAt } = parsed.data;

    const adminClient = createAdminClient();

    // 5. Verify the order exists and belongs to this tenant
    let orderQuery = adminClient
      .from("orders")
      .select("id, tenant_id, updated_at")
      .eq("id", orderId);

    if (!isPlatformAdmin && tenantId) {
      orderQuery = orderQuery.eq("tenant_id", tenantId);
    }

    const { data: order, error: orderError } = await orderQuery.single();

    if (orderError || !order) {
      return NextResponse.json(
        { success: false, error: "Bestellung nicht gefunden." },
        { status: 404 }
      );
    }

    // 6. Optimistic locking: if updatedAt is provided, check it matches
    if (updatedAt && (order.updated_at as string) !== updatedAt) {
      return NextResponse.json(
        {
          success: false,
          error: "Diese Bestellung wurde zwischenzeitlich geaendert. Bitte laden Sie die Seite neu und versuchen Sie es erneut.",
        },
        { status: 409 }
      );
    }

    // 7. Verify the selected dealer exists and is active
    const { data: dealer, error: dealerError } = await adminClient
      .from("dealers")
      .select("id, name")
      .eq("id", dealerId)
      .eq("active", true)
      .single();

    if (dealerError || !dealer) {
      return NextResponse.json(
        { success: false, error: "Haendler nicht gefunden oder nicht aktiv." },
        { status: 404 }
      );
    }

    // 8. Update the order with the manual override
    const now = new Date().toISOString();
    const { data: updatedOrder, error: updateError } = await adminClient
      .from("orders")
      .update({
        dealer_id: dealerId,
        recognition_method: "manual",
        recognition_confidence: 100,
        dealer_overridden_by: user.id,
        dealer_overridden_at: now,
        override_reason: reason?.trim() || null,
      })
      .eq("id", orderId)
      .select("updated_at")
      .single();

    if (updateError || !updatedOrder) {
      console.error("Error updating order dealer:", updateError?.message);
      return NextResponse.json(
        { success: false, error: "Haendler-Zuweisung fehlgeschlagen." },
        { status: 500 }
      );
    }

    // 9. Fetch the overrider's display name for the UI
    const { data: profile } = await adminClient
      .from("user_profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .single();

    const overriddenByName = profile
      ? `${profile.first_name} ${profile.last_name}`.trim()
      : user.email ?? "";

    return NextResponse.json({
      success: true,
      data: {
        orderId,
        dealerId: dealer.id as string,
        dealerName: dealer.name as string,
        overriddenBy: user.id,
        overriddenByName,
        overriddenAt: now,
        overrideReason: reason?.trim() || null,
        updatedAt: updatedOrder.updated_at as string,
      },
    });
  } catch (error) {
    console.error("Unexpected error in PATCH /api/orders/[orderId]/dealer:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
