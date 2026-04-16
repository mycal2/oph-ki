import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata, ApiResponse } from "@/lib/types";

interface DealerOption {
  id: string;
  name: string;
}

/**
 * GET /api/orders/dealers
 *
 * Returns the distinct dealers (id + name) that have at least one order
 * within the caller's scope. Used to populate the dealer filter dropdown
 * on the orders list page (OPH-68).
 *
 * - tenant_admin: scoped automatically to their tenant.
 * - platform_admin: accepts optional ?tenantId=X to scope to a specific tenant;
 *   without it, returns all dealers that appear in any order.
 * - tenant_user: returns 403 (this filter is not available to them).
 *
 * Query params:
 *   - tenantId (optional, platform_admin only): filter dealers by tenant
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<DealerOption[]>>> {
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
    const role = appMetadata?.role;
    const tenantId = appMetadata?.tenant_id;
    const isPlatformAdmin = role === "platform_admin";
    const isTenantAdmin = role === "tenant_admin";

    // Only tenant_admin and platform_admin can access this endpoint
    if (!isPlatformAdmin && !isTenantAdmin) {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    if (!tenantId && !isPlatformAdmin) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    // 2. Parse optional tenantId query param (platform admin only)
    const url = new URL(request.url);
    const tenantIdFilter = isPlatformAdmin
      ? url.searchParams.get("tenantId")
      : null;

    const adminClient = createAdminClient();

    // 3. Query distinct dealer_ids from orders, scoped appropriately
    let ordersQuery = adminClient
      .from("orders")
      .select("dealer_id")
      .not("dealer_id", "is", null);

    if (tenantIdFilter) {
      // Platform admin filtering by specific tenant
      ordersQuery = ordersQuery.eq("tenant_id", tenantIdFilter);
    } else if (!isPlatformAdmin && tenantId) {
      // Tenant admin scoped to own tenant
      ordersQuery = ordersQuery.eq("tenant_id", tenantId);
    }

    const { data: orderRows, error: ordersError } = await ordersQuery;

    if (ordersError) {
      console.error("Error fetching dealer IDs from orders:", ordersError.message);
      return NextResponse.json(
        { success: false, error: "Händler konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    // Extract unique dealer IDs
    const dealerIds = [
      ...new Set(
        (orderRows ?? [])
          .map((row) => row.dealer_id as string)
          .filter(Boolean)
      ),
    ];

    if (dealerIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    // 4. Fetch dealer names for these IDs
    const { data: dealers, error: dealersError } = await adminClient
      .from("dealers")
      .select("id, name")
      .in("id", dealerIds)
      .order("name", { ascending: true });

    if (dealersError) {
      console.error("Error fetching dealer names:", dealersError.message);
      return NextResponse.json(
        { success: false, error: "Händler konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    const options: DealerOption[] = (dealers ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
    }));

    return NextResponse.json({
      success: true,
      data: options,
    });
  } catch (error) {
    console.error("Unexpected error in GET /api/orders/dealers:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
