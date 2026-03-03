import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata, ApiResponse, OrderDashboardStats } from "@/lib/types";

/**
 * GET /api/orders/stats
 *
 * Returns dashboard aggregate stats for the current user's tenant.
 * Platform admins see stats across all tenants.
 */
export async function GET(): Promise<
  NextResponse<ApiResponse<OrderDashboardStats>>
> {
  try {
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
    const isPlatformAdmin = appMetadata?.role === "platform_admin";

    if (!tenantId && !isPlatformAdmin) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();

    // Date boundaries
    const now = new Date();

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Monday of current week
    const weekStart = new Date(now);
    const day = weekStart.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday = 0 offset
    weekStart.setDate(weekStart.getDate() - diff);
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // 7 days ago for error rate
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Tenant scoping: pass tenantId directly (null for platform admins)
    const scopedTenantId = !isPlatformAdmin && tenantId ? tenantId : null;

    // Run all queries in parallel
    const [todayRes, weekRes, monthRes, openRes, errorRes, totalLast7Res] =
      await Promise.all([
        // Today's orders
        buildCountQuery(
          adminClient,
          scopedTenantId,
          todayStart.toISOString(),
          null,
          null
        ),
        // This week's orders
        buildCountQuery(
          adminClient,
          scopedTenantId,
          weekStart.toISOString(),
          null,
          null
        ),
        // This month's orders
        buildCountQuery(
          adminClient,
          scopedTenantId,
          monthStart.toISOString(),
          null,
          null
        ),
        // Open orders (not exported and not error)
        buildOpenOrdersCount(adminClient, scopedTenantId),
        // Error orders last 7 days
        buildCountQuery(
          adminClient,
          scopedTenantId,
          sevenDaysAgo.toISOString(),
          null,
          "error"
        ),
        // Total orders last 7 days (for error rate denominator)
        buildCountQuery(
          adminClient,
          scopedTenantId,
          sevenDaysAgo.toISOString(),
          null,
          null
        ),
      ]);

    const totalLast7 = totalLast7Res ?? 0;
    const errorCount = errorRes ?? 0;
    const errorRate =
      totalLast7 > 0 ? (errorCount / totalLast7) * 100 : 0;

    const stats: OrderDashboardStats = {
      today: todayRes ?? 0,
      thisWeek: weekRes ?? 0,
      thisMonth: monthRes ?? 0,
      openOrders: openRes ?? 0,
      errorRate7Days: Math.round(errorRate * 10) / 10,
    };

    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error("Unexpected error in GET /api/orders/stats:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

async function buildCountQuery(
  client: ReturnType<typeof createAdminClient>,
  tenantId: string | null,
  dateFrom: string | null,
  dateTo: string | null,
  status: string | null
): Promise<number | null> {
  let query = client
    .from("orders")
    .select("id", { count: "exact", head: true });

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }
  if (dateFrom) {
    query = query.gte("created_at", dateFrom);
  }
  if (dateTo) {
    query = query.lte("created_at", dateTo);
  }
  if (status) {
    query = query.eq("status", status);
  }

  const { count } = await query;
  return count;
}

async function buildOpenOrdersCount(
  client: ReturnType<typeof createAdminClient>,
  tenantId: string | null
): Promise<number | null> {
  let query = client
    .from("orders")
    .select("id", { count: "exact", head: true })
    .not("status", "in", "(exported,error)");

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { count } = await query;
  return count;
}
