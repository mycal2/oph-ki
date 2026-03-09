import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import { createTenantSchema } from "@/lib/validations";
import type { TenantAdminListItem, Tenant } from "@/lib/types";

/**
 * GET /api/admin/tenants
 *
 * Returns all tenants with usage statistics (order count, last upload).
 * Platform admin only.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { adminClient } = auth;

    // Fetch all tenants (OPH-16: trial dates, OPH-29: erp_config_id)
    const { data: tenants, error: tenantsError } = await adminClient
      .from("tenants")
      .select("id, name, slug, status, erp_type, contact_email, created_at, trial_started_at, trial_expires_at, allowed_email_domains, erp_config_id")
      .order("name", { ascending: true })
      .limit(1000);

    if (tenantsError) {
      console.error("Error fetching tenants:", tenantsError.message);
      return NextResponse.json(
        { success: false, error: "Mandanten konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    // Get order stats per tenant via RPC (efficient GROUP BY aggregation)
    const statsByTenant = new Map<string, { count: number; lastMonth: number; lastUploadAt: string | null }>();

    const { data: rpcStats, error: rpcError } = await adminClient.rpc("get_tenant_order_stats");

    if (!rpcError && Array.isArray(rpcStats)) {
      for (const row of rpcStats as { tenant_id: string; order_count: number; orders_last_month: number; last_upload_at: string | null }[]) {
        statsByTenant.set(row.tenant_id, {
          count: row.order_count,
          lastMonth: row.orders_last_month,
          lastUploadAt: row.last_upload_at,
        });
      }
    }

    // OPH-29: Fetch ERP config names for tenants that have one assigned
    const configIds = [...new Set(
      (tenants ?? [])
        .map((t) => t.erp_config_id as string | null)
        .filter((id): id is string => !!id)
    )];

    const configNameMap = new Map<string, string>();
    if (configIds.length > 0) {
      const { data: configs } = await adminClient
        .from("erp_configs")
        .select("id, name")
        .in("id", configIds);
      for (const c of configs ?? []) {
        configNameMap.set(c.id as string, c.name as string);
      }
    }

    const result: TenantAdminListItem[] = (tenants ?? []).map((t) => {
      const stats = statsByTenant.get(t.id as string);
      const erpConfigId = (t.erp_config_id as string) ?? null;
      return {
        id: t.id as string,
        name: t.name as string,
        slug: t.slug as string,
        status: t.status as TenantAdminListItem["status"],
        erp_type: t.erp_type as TenantAdminListItem["erp_type"],
        contact_email: t.contact_email as string,
        order_count: stats?.count ?? 0,
        orders_last_month: stats?.lastMonth ?? 0,
        last_upload_at: stats?.lastUploadAt ?? null,
        created_at: t.created_at as string,
        // OPH-16: Trial period dates
        trial_started_at: (t.trial_started_at as string) ?? null,
        trial_expires_at: (t.trial_expires_at as string) ?? null,
        // OPH-17: Allowed email domains
        allowed_email_domains: (t.allowed_email_domains as string[]) ?? [],
        // OPH-29: ERP config assignment
        erp_config_id: erpConfigId,
        erp_config_name: erpConfigId ? (configNameMap.get(erpConfigId) ?? null) : null,
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error in GET /api/admin/tenants:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/tenants
 *
 * Creates a new tenant. Platform admin only.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitResponse = checkAdminRateLimit(user.id);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = createTenantSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // Check slug uniqueness
    const { data: existing } = await adminClient
      .from("tenants")
      .select("id")
      .eq("slug", input.slug)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Dieser Slug ist bereits vergeben." },
        { status: 409 }
      );
    }

    // Generate inbound email address from slug + configured domain
    const inboundDomain = process.env.INBOUND_EMAIL_DOMAIN;
    const inboundEmailAddress = inboundDomain
      ? `${input.slug}@${inboundDomain}`
      : null;

    // OPH-16: Auto-set trial dates when creating a trial tenant
    const trialFields: Record<string, string> = {};
    if (input.status === "trial") {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);
      trialFields.trial_started_at = now.toISOString();
      trialFields.trial_expires_at = expiresAt.toISOString();
    }

    // Insert the tenant
    const { data: tenant, error: insertError } = await adminClient
      .from("tenants")
      .insert({
        name: input.name,
        slug: input.slug,
        contact_email: input.contact_email,
        erp_type: input.erp_type,
        status: input.status,
        allowed_email_domains: input.allowed_email_domains,
        ...(inboundEmailAddress ? { inbound_email_address: inboundEmailAddress } : {}),
        ...trialFields,
      })
      .select()
      .single();

    if (insertError || !tenant) {
      console.error("Failed to create tenant:", insertError?.message);
      return NextResponse.json(
        { success: false, error: "Mandant konnte nicht erstellt werden." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, data: tenant as unknown as Tenant },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in POST /api/admin/tenants:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
