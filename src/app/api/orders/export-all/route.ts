import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata, ApiResponse } from "@/lib/types";

const MAX_EXPORT_ORDERS = 5000;

/**
 * GET /api/orders/export-all
 *
 * Exports all tenant orders as a JSON file download (DSGVO data portability).
 * Auth required: any authenticated user in an active tenant.
 * Returns a JSON file with Content-Disposition for browser download.
 */
export async function GET(): Promise<NextResponse<ApiResponse | Blob>> {
  try {
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
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();

    // 2. Fetch tenant slug for the filename
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("slug")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { success: false, error: "Mandant nicht gefunden." },
        { status: 404 }
      );
    }

    const tenantSlug = (tenant.slug as string) ?? "export";

    // 3. Query all orders for the tenant with extracted/reviewed data
    const { data: orders, error: ordersError } = await adminClient
      .from("orders")
      .select(
        "id, status, created_at, updated_at, extracted_data, reviewed_data, dealer_id, recognition_method"
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(MAX_EXPORT_ORDERS);

    if (ordersError) {
      console.error("Error fetching orders for export:", ordersError.message);
      return NextResponse.json(
        { success: false, error: "Bestellungen konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    // 4. Build the export payload
    const exportData = {
      exported_at: new Date().toISOString(),
      tenant_slug: tenantSlug,
      total_orders: (orders ?? []).length,
      orders: (orders ?? []).map((order) => ({
        id: order.id,
        status: order.status,
        created_at: order.created_at,
        updated_at: order.updated_at,
        dealer_id: order.dealer_id,
        recognition_method: order.recognition_method,
        extracted_data: order.extracted_data ?? null,
        reviewed_data: order.reviewed_data ?? null,
      })),
    };

    const jsonContent = JSON.stringify(exportData, null, 2);
    const date = new Date().toISOString().split("T")[0];
    const filename = `orders-export-${tenantSlug}-${date}.json`;

    // 5. Return as file download
    const headers = new Headers();
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");

    return new NextResponse(jsonContent, { status: 200, headers });
  } catch (error) {
    console.error("Error in GET /api/orders/export-all:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
