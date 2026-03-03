import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AppMetadata,
  ApiResponse,
  OrderListItem,
  OrdersPageResponse,
} from "@/lib/types";

/**
 * GET /api/orders
 *
 * Returns a paginated list of orders for the current user's tenant.
 * Includes dealer name, file count, and primary filename.
 *
 * Query params:
 *   - page     (default 1)
 *   - pageSize (default 25, max 100)
 *   - status   (optional: filter by order status)
 *   - search   (optional: text search on dealer name / extracted order number)
 *   - dateFrom (optional: ISO date string, inclusive)
 *   - dateTo   (optional: ISO date string, inclusive)
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<OrdersPageResponse>>> {
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

    // 3. Parse query params
    const url = new URL(request.url);
    const pageParam = parseInt(url.searchParams.get("page") ?? "1", 10);
    const pageSizeParam = parseInt(
      url.searchParams.get("pageSize") ?? "25",
      10
    );
    const page = Math.max(1, pageParam);
    const pageSize = Math.min(Math.max(1, pageSizeParam), 100);
    const offset = (page - 1) * pageSize;

    const statusFilter = url.searchParams.get("status");
    const searchFilter = url.searchParams.get("search")?.trim() ?? "";
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");

    const adminClient = createAdminClient();

    // 4. Build the count query (for pagination total)
    let countQuery = adminClient
      .from("orders")
      .select("id", { count: "exact", head: true });

    if (!isPlatformAdmin && tenantId) {
      countQuery = countQuery.eq("tenant_id", tenantId);
    }
    if (statusFilter) {
      countQuery = countQuery.eq("status", statusFilter);
    }
    if (dateFrom) {
      countQuery = countQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
    }
    if (dateTo) {
      countQuery = countQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);
    }

    // 5. Build the data query with joins
    let dataQuery = adminClient
      .from("orders")
      .select(
        `
        id,
        status,
        created_at,
        dealer_id,
        recognition_method,
        recognition_confidence,
        extraction_status,
        extracted_data,
        dealers ( name ),
        uploader:user_profiles!orders_uploaded_by_fkey ( first_name, last_name ),
        tenants ( name )
      `
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (!isPlatformAdmin && tenantId) {
      dataQuery = dataQuery.eq("tenant_id", tenantId);
    }
    if (statusFilter) {
      dataQuery = dataQuery.eq("status", statusFilter);
    }
    if (dateFrom) {
      dataQuery = dataQuery.gte(
        "created_at",
        `${dateFrom}T00:00:00.000Z`
      );
    }
    if (dateTo) {
      dataQuery = dataQuery.lte(
        "created_at",
        `${dateTo}T23:59:59.999Z`
      );
    }

    // Run count and data queries in parallel
    const [countResult, dataResult] = await Promise.all([
      countQuery,
      dataQuery,
    ]);

    if (dataResult.error) {
      console.error("Error fetching orders:", dataResult.error.message);
      return NextResponse.json(
        {
          success: false,
          error: "Bestellungen konnten nicht geladen werden.",
        },
        { status: 500 }
      );
    }

    const total = countResult.count ?? 0;
    const orders = dataResult.data ?? [];

    if (orders.length === 0) {
      return NextResponse.json({
        success: true,
        data: { orders: [], total, page, pageSize },
      });
    }

    // 6. Fetch file counts and primary filenames in one query
    const orderIds = orders.map((o) => o.id as string);
    const { data: files } = await adminClient
      .from("order_files")
      .select("order_id, original_filename, created_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: true });

    // Group files by order_id
    const filesByOrder = new Map<
      string,
      { count: number; primaryFilename: string | null }
    >();
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

    // 7. Map to OrderListItem (with search filtering on dealer name / order number)
    let result: OrderListItem[] = orders.map((order) => {
      const rawDealer = order.dealers as unknown;
      const dealerData = Array.isArray(rawDealer)
        ? ((rawDealer[0] as { name: string } | undefined) ?? null)
        : (rawDealer as { name: string } | null);

      const rawUploader = order.uploader as unknown;
      const uploaderData = Array.isArray(rawUploader)
        ? ((rawUploader[0] as {
            first_name: string;
            last_name: string;
          } | undefined) ?? null)
        : (rawUploader as {
            first_name: string;
            last_name: string;
          } | null);

      // OPH-18: Extract tenant name from join
      const rawTenant = order.tenants as unknown;
      const tenantData = Array.isArray(rawTenant)
        ? ((rawTenant[0] as { name: string } | undefined) ?? null)
        : (rawTenant as { name: string } | null);

      const fileInfo = filesByOrder.get(order.id as string);

      return {
        id: order.id as string,
        status: order.status as OrderListItem["status"],
        created_at: order.created_at as string,
        uploaded_by_name: uploaderData
          ? `${uploaderData.first_name} ${uploaderData.last_name}`.trim()
          : null,
        dealer_name: dealerData?.name ?? null,
        recognition_method:
          (order.recognition_method as OrderListItem["recognition_method"]) ??
          "none",
        recognition_confidence:
          (order.recognition_confidence as number) ?? 0,
        file_count: fileInfo?.count ?? 0,
        primary_filename: fileInfo?.primaryFilename ?? null,
        extraction_status:
          (order.extraction_status as OrderListItem["extraction_status"]) ??
          null,
        tenant_name: isPlatformAdmin ? (tenantData?.name ?? null) : null,
        // Carry extracted order number for search
        _order_number: extractOrderNumber(order.extracted_data),
      };
    });

    // 8. Apply search filter (server-side, on dealer name and extracted order number)
    if (searchFilter) {
      const needle = searchFilter.toLowerCase();
      const beforeSearchCount = total;
      result = result.filter((o) => {
        const dealerMatch = o.dealer_name?.toLowerCase().includes(needle);
        const orderNumMatch =
          (o as OrderListItemInternal)._order_number
            ?.toLowerCase()
            .includes(needle);
        const fileMatch = o.primary_filename
          ?.toLowerCase()
          .includes(needle);
        return dealerMatch || orderNumMatch || fileMatch;
      });
      // Note: search filtering is done client-side on the page results
      // For accurate totals with search, we adjust the total
      // (This is approximate — exact search count would need a DB text search)
      if (result.length < orders.length) {
        // Adjust total proportionally (best effort without full-text search index)
        const ratio =
          orders.length > 0 ? result.length / orders.length : 0;
        return NextResponse.json({
          success: true,
          data: {
            orders: stripInternalFields(result),
            total: Math.round(beforeSearchCount * ratio),
            page,
            pageSize,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        orders: stripInternalFields(result),
        total,
        page,
        pageSize,
      },
    });
  } catch (error) {
    console.error("Unexpected error in GET /api/orders:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/** Internal type with _order_number for search. */
interface OrderListItemInternal extends OrderListItem {
  _order_number?: string | null;
}

/** Extract order number from extracted_data JSON. */
function extractOrderNumber(extractedData: unknown): string | null {
  if (!extractedData || typeof extractedData !== "object") return null;
  const data = extractedData as {
    order?: { order_number?: unknown };
  };
  const orderNum = data.order?.order_number;
  if (typeof orderNum === "string") return orderNum;
  if (typeof orderNum === "number") return String(orderNum);
  return null;
}

/** Strip internal fields before sending to client. */
function stripInternalFields(
  items: OrderListItemInternal[]
): OrderListItem[] {
  return items.map(({ _order_number: _, ...rest }) => rest);
}
