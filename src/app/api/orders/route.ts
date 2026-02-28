import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata, ApiResponse, OrderListItem } from "@/lib/types";

/**
 * GET /api/orders
 *
 * Returns a paginated list of orders for the current user's tenant.
 * Includes dealer name, file count, and primary filename.
 *
 * Query params:
 *   - limit  (default 50, max 100)
 *   - offset (default 0)
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<OrderListItem[]>>> {
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

    // 3. Parse pagination params
    const url = new URL(request.url);
    const limitParam = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const offsetParam = parseInt(url.searchParams.get("offset") ?? "0", 10);
    const limit = Math.min(Math.max(1, limitParam), 100);
    const offset = Math.max(0, offsetParam);

    const adminClient = createAdminClient();

    // 4. Fetch orders with dealer join and uploader name
    let query = adminClient
      .from("orders")
      .select(`
        id,
        status,
        created_at,
        dealer_id,
        recognition_method,
        recognition_confidence,
        extraction_status,
        dealers ( name ),
        uploader:user_profiles!orders_uploaded_by_fkey ( first_name, last_name )
      `)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (!isPlatformAdmin && tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data: orders, error: ordersError } = await query;

    if (ordersError) {
      console.error("Error fetching orders:", ordersError.message);
      return NextResponse.json(
        { success: false, error: "Bestellungen konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 5. Fetch file counts and primary filenames in one query
    const orderIds = orders.map((o) => o.id as string);
    const { data: files } = await adminClient
      .from("order_files")
      .select("order_id, original_filename, created_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: true });

    // Group files by order_id
    const filesByOrder = new Map<string, { count: number; primaryFilename: string | null }>();
    for (const f of files ?? []) {
      const orderId = f.order_id as string;
      const existing = filesByOrder.get(orderId);
      if (!existing) {
        filesByOrder.set(orderId, {
          count: 1,
          primaryFilename: f.original_filename as string,
        });
      } else {
        existing.count += 1;
      }
    }

    // 6. Map to OrderListItem
    const result: OrderListItem[] = orders.map((order) => {
      const rawDealer = order.dealers as unknown;
      const dealerData = Array.isArray(rawDealer)
        ? (rawDealer[0] as { name: string } | undefined) ?? null
        : (rawDealer as { name: string } | null);

      const rawUploader = order.uploader as unknown;
      const uploaderData = Array.isArray(rawUploader)
        ? (rawUploader[0] as { first_name: string; last_name: string } | undefined) ?? null
        : (rawUploader as { first_name: string; last_name: string } | null);

      const fileInfo = filesByOrder.get(order.id as string);

      return {
        id: order.id as string,
        status: order.status as OrderListItem["status"],
        created_at: order.created_at as string,
        uploaded_by_name: uploaderData
          ? `${uploaderData.first_name} ${uploaderData.last_name}`.trim()
          : null,
        dealer_name: dealerData?.name ?? null,
        recognition_method: (order.recognition_method as OrderListItem["recognition_method"]) ?? "none",
        recognition_confidence: (order.recognition_confidence as number) ?? 0,
        file_count: fileInfo?.count ?? 0,
        primary_filename: fileInfo?.primaryFilename ?? null,
        extraction_status: (order.extraction_status as OrderListItem["extraction_status"]) ?? null,
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Unexpected error in GET /api/orders:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
