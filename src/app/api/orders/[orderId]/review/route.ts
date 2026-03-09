import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewSaveSchema } from "@/lib/validations";
import type { AppMetadata, ApiResponse, ReviewSaveResponse } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/orders/[orderId]/review
 *
 * Auto-save the reviewed (human-edited) order data.
 * Creates audit log entries for each changed field.
 * Uses optimistic locking via updated_at.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse<ApiResponse<ReviewSaveResponse>>> {
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

    // 4. Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Ungültiger JSON-Body." },
        { status: 400 }
      );
    }

    const parsed = reviewSaveSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Validierungsfehler.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { reviewedData, updatedAt } = parsed.data;
    const adminClient = createAdminClient();

    // 5. Fetch current order for optimistic locking and tenant scoping
    let query = adminClient
      .from("orders")
      .select("id, tenant_id, updated_at, status, reviewed_data")
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

    // 6. Optimistic locking check
    if (updatedAt && order.updated_at !== updatedAt) {
      return NextResponse.json(
        {
          success: false,
          error: "Diese Bestellung wurde in der Zwischenzeit von einem anderen Benutzer geändert. Bitte laden Sie die Seite neu.",
        },
        { status: 409 }
      );
    }

    // 7. Don't allow editing exported orders
    if (order.status === "exported") {
      return NextResponse.json(
        { success: false, error: "Exportierte Bestellungen können nicht mehr bearbeitet werden." },
        { status: 400 }
      );
    }

    // 8. Build audit log entries by comparing old and new reviewed_data
    const oldData = order.reviewed_data as Record<string, unknown> | null;
    const auditEntries = buildAuditEntries(
      orderId,
      order.tenant_id as string,
      user.id,
      oldData,
      reviewedData
    );

    // 9. Update the order
    const { data: updated, error: updateError } = await adminClient
      .from("orders")
      .update({
        reviewed_data: reviewedData,
        // Set status to "review" if it was "extracted" (first time editing)
        ...(order.status === "extracted" ? { status: "review" } : {}),
      })
      .eq("id", orderId)
      .select("updated_at")
      .single();

    if (updateError || !updated) {
      console.error("Error updating reviewed_data:", updateError?.message);
      return NextResponse.json(
        { success: false, error: "Speichern fehlgeschlagen." },
        { status: 500 }
      );
    }

    // 10. Insert audit log entries (non-blocking; we don't fail the save if audit fails)
    if (auditEntries.length > 0) {
      const { error: auditError } = await adminClient
        .from("order_edits")
        .insert(auditEntries);

      if (auditError) {
        console.error("Error inserting audit entries:", auditError.message);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        orderId,
        updatedAt: updated.updated_at as string,
      },
    });
  } catch (error) {
    console.error("Unexpected error in PATCH /api/orders/[orderId]/review:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * Builds audit log entries by doing a simple top-level comparison of the reviewed data.
 * For MVP, we track the full order JSON change rather than per-field diffs.
 */
function buildAuditEntries(
  orderId: string,
  tenantId: string,
  userId: string,
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown>
) {
  // If there's no old data, this is the first save - log the entire reviewed data
  if (!oldData) {
    return [
      {
        order_id: orderId,
        tenant_id: tenantId,
        user_id: userId,
        field_path: "reviewed_data",
        old_value: null,
        new_value: newData,
      },
    ];
  }

  // Compare at the order level for key fields
  const entries: Array<{
    order_id: string;
    tenant_id: string;
    user_id: string;
    field_path: string;
    old_value: unknown;
    new_value: unknown;
  }> = [];

  const oldOrder = (oldData as { order?: Record<string, unknown> }).order ?? {};
  const newOrder = (newData as { order?: Record<string, unknown> }).order ?? {};

  // Track changes to top-level order fields
  const fieldsToTrack = [
    "order_number",
    "order_date",
    "total_amount",
    "currency",
    "notes",
    "line_items",
    "delivery_address",
    "billing_address",
  ];

  for (const field of fieldsToTrack) {
    const oldVal = JSON.stringify(oldOrder[field] ?? null);
    const newVal = JSON.stringify(newOrder[field] ?? null);

    if (oldVal !== newVal) {
      entries.push({
        order_id: orderId,
        tenant_id: tenantId,
        user_id: userId,
        field_path: `order.${field}`,
        old_value: oldOrder[field] ?? null,
        new_value: newOrder[field] ?? null,
      });
    }
  }

  return entries;
}
