import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dealerOverrideSchema, dealerResetSchema } from "@/lib/validations";
import type { AppMetadata, ApiResponse, DealerOverrideResponse, DealerResetResponse } from "@/lib/types";

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
        { success: false, error: "Ungültige Bestellungs-ID." },
        { status: 400 }
      );
    }

    // 4. Parse and validate JSON body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Ungültiges JSON im Anfrage-Body." },
        { status: 400 }
      );
    }

    const parsed = dealerOverrideSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
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
          error: "Diese Bestellung wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu und versuchen Sie es erneut.",
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
        { success: false, error: "Händler nicht gefunden oder nicht aktiv." },
        { status: 404 }
      );
    }

    // 8. Update the order with the manual override
    // OPH-66: Clear dealer reset fields when a new dealer is assigned
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
        dealer_reset_by: null,
        dealer_reset_at: null,
      })
      .eq("id", orderId)
      .select("updated_at")
      .single();

    if (updateError || !updatedOrder) {
      console.error("Error updating order dealer:", updateError?.message);
      return NextResponse.json(
        { success: false, error: "Händler-Zuweisung fehlgeschlagen." },
        { status: 500 }
      );
    }

    // 9. Auto-create customer catalog entry if it doesn't exist (OPH-49 parity)
    const orderTenantId = order.tenant_id as string;
    try {
      const { data: existingEntry } = await adminClient
        .from("customer_catalog")
        .select("id")
        .eq("tenant_id", orderTenantId)
        .eq("dealer_id", dealerId)
        .maybeSingle();

      if (!existingEntry) {
        const { data: dealerFull } = await adminClient
          .from("dealers")
          .select("name, known_sender_addresses, street, postal_code, city, country")
          .eq("id", dealerId)
          .single();

        if (dealerFull) {
          const dealerName = dealerFull.name as string;

          // Check if a manual entry with the same company_name already exists
          const { data: nameMatch } = await adminClient
            .from("customer_catalog")
            .select("id")
            .eq("tenant_id", orderTenantId)
            .ilike("company_name", dealerName)
            .maybeSingle();

          if (!nameMatch) {
            const addresses = dealerFull.known_sender_addresses as string[] | null;
            const dealerEmail = addresses && addresses.length > 0 ? addresses[0] : null;

            await adminClient.from("customer_catalog").insert({
              tenant_id: orderTenantId,
              dealer_id: dealerId,
              company_name: dealerName,
              street: (dealerFull.street as string) ?? null,
              postal_code: (dealerFull.postal_code as string) ?? null,
              city: (dealerFull.city as string) ?? null,
              country: (dealerFull.country as string) ?? null,
              email: dealerEmail,
              keywords: dealerName,
            });
          }
        }
      }
    } catch (autoCreateError) {
      // Non-critical: log but don't fail the dealer override
      console.error("Error auto-creating customer catalog entry on manual dealer assign:", autoCreateError);
    }

    // 10. Fetch the overrider's display name for the UI
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

/**
 * DELETE /api/orders/[orderId]/dealer
 *
 * OPH-66: Reset dealer assignment on an order.
 * Clears dealer_id and all recognition fields, records who performed the reset.
 * Platform-admin only. Blocked when order status is 'exported' or 'processing'.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse<ApiResponse<DealerResetResponse>>> {
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

    // 2. Check platform_admin role (this endpoint is platform-admin only)
    const appMetadata = user.app_metadata as AppMetadata | undefined;

    if (appMetadata?.role !== "platform_admin") {
      return NextResponse.json(
        { success: false, error: "Nur Plattform-Admins können die Händler-Zuweisung zurücksetzen." },
        { status: 403 }
      );
    }

    // 3. Validate orderId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orderId)) {
      return NextResponse.json(
        { success: false, error: "Ungültige Bestellungs-ID." },
        { status: 400 }
      );
    }

    // 4. Parse optional JSON body (for optimistic locking)
    let body: unknown = {};
    try {
      const text = await request.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {
      return NextResponse.json(
        { success: false, error: "Ungültiges JSON im Anfrage-Body." },
        { status: 400 }
      );
    }

    const parsed = dealerResetSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { updatedAt } = parsed.data;

    const adminClient = createAdminClient();

    // 5. Fetch the order (platform admins see all orders, no tenant scoping)
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("id, tenant_id, status, dealer_id, updated_at")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { success: false, error: "Bestellung nicht gefunden." },
        { status: 404 }
      );
    }

    // 6. Block reset on exported orders
    if ((order.status as string) === "exported") {
      return NextResponse.json(
        {
          success: false,
          error: "Bestellung wurde bereits exportiert. Händler-Zuweisung kann nicht zurückgesetzt werden.",
        },
        { status: 409 }
      );
    }

    // 7. Block reset on processing orders
    if ((order.status as string) === "processing") {
      return NextResponse.json(
        {
          success: false,
          error: "Bestellung wird gerade verarbeitet. Bitte warten Sie, bis die Verarbeitung abgeschlossen ist.",
        },
        { status: 409 }
      );
    }

    // 8. Optimistic locking: if updatedAt is provided, check it matches
    if (updatedAt && (order.updated_at as string) !== updatedAt) {
      return NextResponse.json(
        {
          success: false,
          error: "Diese Bestellung wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu und versuchen Sie es erneut.",
        },
        { status: 409 }
      );
    }

    // 9. If order already has no dealer, return current state (no-op)
    const previousDealerId = order.dealer_id as string | null;

    // 10. Atomic update: clear all dealer fields, write reset audit trail
    const now = new Date().toISOString();
    const { data: updatedOrder, error: updateError } = await adminClient
      .from("orders")
      .update({
        dealer_id: null,
        recognition_method: "none",
        recognition_confidence: 0,
        dealer_overridden_by: null,
        dealer_overridden_at: null,
        override_reason: null,
        dealer_reset_by: user.id,
        dealer_reset_at: now,
      })
      .eq("id", orderId)
      .select("updated_at")
      .single();

    if (updateError || !updatedOrder) {
      console.error("Error resetting dealer on order:", updateError?.message);
      return NextResponse.json(
        { success: false, error: "Händler-Zurücksetzung fehlgeschlagen." },
        { status: 500 }
      );
    }

    // 11. Structured log for traceability
    console.log(
      JSON.stringify({
        event: "dealer_reset",
        orderId,
        actorId: user.id,
        previousDealerId,
        timestamp: now,
      })
    );

    // 12. Fetch the resetter's display name for the UI
    const { data: profile } = await adminClient
      .from("user_profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .single();

    const resetByName = profile
      ? `${profile.first_name} ${profile.last_name}`.trim()
      : user.email ?? "";

    return NextResponse.json({
      success: true,
      data: {
        orderId,
        resetBy: user.id,
        resetByName,
        resetAt: now,
        updatedAt: updatedOrder.updated_at as string,
      },
    });
  } catch (error) {
    console.error("Unexpected error in DELETE /api/orders/[orderId]/dealer:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
