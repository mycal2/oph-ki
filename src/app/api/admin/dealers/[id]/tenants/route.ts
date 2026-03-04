import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse } from "@/lib/admin-auth";
import type { ApiResponse, DealerTenantUsage } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/dealers/[id]/tenants
 *
 * Returns which tenants have orders assigned to this dealer,
 * including order count and last order date per tenant.
 * Platform admin only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<DealerTenantUsage[]>>> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Haendler-ID." },
        { status: 400 }
      );
    }

    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth as unknown as NextResponse<ApiResponse<DealerTenantUsage[]>>;
    const { adminClient } = auth;

    // Query orders grouped by tenant for this dealer
    const { data, error } = await adminClient.rpc("get_dealer_tenant_usage", {
      p_dealer_id: id,
    });

    if (error) {
      // Fallback: direct query if RPC doesn't exist yet
      if (error.code === "42883") {
        const { data: fallbackData, error: fallbackError } = await adminClient
          .from("orders")
          .select("tenant_id, tenants!inner(name), created_at")
          .eq("dealer_id", id)
          .order("created_at", { ascending: false })
          .limit(1000);

        if (fallbackError) {
          console.error("Error fetching dealer tenant usage:", fallbackError.message);
          return NextResponse.json(
            { success: false, error: "Mandanten-Nutzung konnte nicht geladen werden." },
            { status: 500 }
          );
        }

        // Aggregate in JS
        const tenantMap = new Map<string, { tenant_name: string; order_count: number; last_order_at: string | null }>();
        for (const row of fallbackData ?? []) {
          const tenantId = row.tenant_id as string;
          const tenantObj = row.tenants as unknown as { name: string };
          const tenantName = tenantObj?.name ?? "Unbekannt";
          const createdAt = row.created_at as string;

          const existing = tenantMap.get(tenantId);
          if (existing) {
            existing.order_count += 1;
            if (!existing.last_order_at || createdAt > existing.last_order_at) {
              existing.last_order_at = createdAt;
            }
          } else {
            tenantMap.set(tenantId, {
              tenant_name: tenantName,
              order_count: 1,
              last_order_at: createdAt,
            });
          }
        }

        const result: DealerTenantUsage[] = Array.from(tenantMap.entries())
          .map(([tenant_id, info]) => ({
            tenant_id,
            tenant_name: info.tenant_name,
            order_count: info.order_count,
            last_order_at: info.last_order_at,
          }))
          .sort((a, b) => b.order_count - a.order_count);

        return NextResponse.json({ success: true, data: result });
      }

      console.error("Error fetching dealer tenant usage:", error.message);
      return NextResponse.json(
        { success: false, error: "Mandanten-Nutzung konnte nicht geladen werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: (data ?? []) as DealerTenantUsage[],
    });
  } catch (error) {
    console.error("Error in GET /api/admin/dealers/[id]/tenants:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
