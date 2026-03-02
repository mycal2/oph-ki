import { NextResponse } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import type { ErpConfigListItem } from "@/lib/types";

/**
 * GET /api/admin/erp-configs
 *
 * Lists all tenants with their active ERP config summary.
 * Platform admin only.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    // Fetch all tenants
    const { data: tenants, error: tenantsError } = await adminClient
      .from("tenants")
      .select("id, name, status, erp_type")
      .order("name", { ascending: true })
      .limit(1000);

    if (tenantsError) {
      console.error("Error fetching tenants:", tenantsError.message);
      return NextResponse.json(
        { success: false, error: "Mandanten konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    // Fetch all ERP configs
    const { data: configs } = await adminClient
      .from("erp_configs")
      .select("id, tenant_id, format, fallback_mode, updated_at")
      .limit(1000);

    // Fetch version counts per config
    const configIds = (configs ?? []).map((c) => c.id as string);
    const versionCounts = new Map<string, number>();

    if (configIds.length > 0) {
      const { data: versions } = await adminClient
        .from("erp_config_versions")
        .select("erp_config_id")
        .in("erp_config_id", configIds);

      if (versions) {
        for (const v of versions) {
          const cid = v.erp_config_id as string;
          versionCounts.set(cid, (versionCounts.get(cid) ?? 0) + 1);
        }
      }
    }

    // Build config lookup by tenant_id
    const configByTenant = new Map<string, typeof configs extends (infer T)[] | null ? T : never>();
    for (const config of configs ?? []) {
      configByTenant.set(config.tenant_id as string, config);
    }

    // Build result
    const result: ErpConfigListItem[] = (tenants ?? []).map((t) => {
      const config = configByTenant.get(t.id as string);
      return {
        tenant_id: t.id as string,
        tenant_name: t.name as string,
        tenant_status: t.status as ErpConfigListItem["tenant_status"],
        erp_type: t.erp_type as ErpConfigListItem["erp_type"],
        has_config: !!config,
        format: (config?.format as ErpConfigListItem["format"]) ?? null,
        fallback_mode: (config?.fallback_mode as ErpConfigListItem["fallback_mode"]) ?? null,
        version_count: config ? (versionCounts.get(config.id as string) ?? 0) : 0,
        last_updated: config ? (config.updated_at as string) : null,
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error in GET /api/admin/erp-configs:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
