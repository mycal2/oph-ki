import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AppMetadata,
  ApiResponse,
  SalesforceOrderDetailResponse,
  CanonicalOrderData,
  OrderStatus,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// GET /api/sf/orders/[orderId] — Single order detail for the current sales rep
// ---------------------------------------------------------------------------

/**
 * OPH-81: Returns full order detail for a specific order.
 *
 * Verifies the order belongs to the requesting user (no cross-user access)
 * and was submitted via the Salesforce App.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse<ApiResponse<SalesforceOrderDetailResponse>>> {
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

    if (appMetadata?.role !== "sales_rep") {
      return NextResponse.json(
        { success: false, error: "Nur Aussendienst-Mitarbeiter koennen Bestellungen einsehen." },
        { status: 403 }
      );
    }

    const tenantId = appMetadata?.tenant_id;
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    // 3. Fetch the order — ensure it belongs to this user and tenant
    const adminClient = createAdminClient();
    const { data: order, error: queryError } = await adminClient
      .from("orders")
      .select("id, status, created_at, extracted_data, dealer_id")
      .eq("id", orderId)
      .eq("tenant_id", tenantId)
      .eq("uploaded_by", user.id)
      .eq("source", "salesforce_app")
      .single();

    if (queryError || !order) {
      return NextResponse.json(
        { success: false, error: "Bestellung nicht gefunden." },
        { status: 404 }
      );
    }

    // 4. Extract data from the canonical order format
    const data = order.extracted_data as CanonicalOrderData | null;
    const dealerName =
      data?.order?.dealer?.name ??
      data?.order?.sender?.company_name ??
      null;
    const customerNumber = data?.order?.sender?.customer_number ?? null;
    const senderCompanyName = data?.order?.sender?.company_name ?? null;

    const lineItems = (data?.order?.line_items ?? []).map((item) => ({
      position: item.position,
      articleNumber: item.article_number,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
    }));

    const deliveryAddress = data?.order?.delivery_address ?? null;
    const notes = data?.order?.notes ?? null;

    return NextResponse.json({
      success: true,
      data: {
        id: order.id as string,
        status: order.status as OrderStatus,
        createdAt: order.created_at as string,
        dealerName,
        customerNumber,
        lineItems,
        deliveryAddress,
        notes,
        senderCompanyName,
      },
    });
  } catch (error) {
    console.error("Unexpected error in GET /api/sf/orders/[orderId]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
