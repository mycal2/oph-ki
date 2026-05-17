import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setDiscountRateSchema } from "@/lib/validations";
import type { AppMetadata, ApiResponse } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * OPH-106: Customer-level default discount rate.
 *
 *   PUT    /api/customers/[id]/discount-default   { rate: number }   — upsert
 *   DELETE /api/customers/[id]/discount-default                       — remove
 *
 * Both endpoints require:
 *   - authenticated user with active tenant + active account
 *   - role in (tenant_admin, platform_admin)
 *   - the customer belongs to the caller's tenant
 *   - the tenant has `price_lookup_enabled = true`
 *
 * The default rate is stored separately from per-article overrides and is
 * applied via COALESCE at view/extraction time (see GET discount-table and
 * OPH-108). Deleting it does NOT touch existing overrides.
 */

interface TenantFlagRow {
  id: string;
  price_lookup_enabled: boolean | null;
}

interface CustomerRow {
  id: string;
  tenant_id: string;
}

async function authoriseDiscountWrite(
  customerId: string
): Promise<
  | { ok: true; tenantId: string }
  | { ok: false; response: NextResponse<ApiResponse> }
> {
  if (!UUID_REGEX.test(customerId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Ungueltige Kunden-ID." },
        { status: 400 }
      ),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Nicht authentifiziert." },
        { status: 401 }
      ),
    };
  }

  const appMetadata = user.app_metadata as AppMetadata | undefined;

  if (appMetadata?.user_status === "inactive") {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Ihr Konto ist deaktiviert." },
        { status: 403 }
      ),
    };
  }

  if (appMetadata?.tenant_status === "inactive") {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Ihr Mandant ist deaktiviert." },
        { status: 403 }
      ),
    };
  }

  const role = appMetadata?.role;
  if (role !== "tenant_admin" && role !== "platform_admin") {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Keine Berechtigung." },
        { status: 403 }
      ),
    };
  }

  const callerTenantId = appMetadata?.tenant_id;
  if (!callerTenantId) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      ),
    };
  }

  const adminClient = createAdminClient();

  // Resolve effective tenant from the customer (platform admins may operate
  // across tenants for OPH-106 discount management).
  const { data: customer, error: customerError } = await adminClient
    .from("customer_catalog")
    .select("id, tenant_id")
    .eq("id", customerId)
    .single<CustomerRow>();

  if (customerError || !customer) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Kunde nicht gefunden." },
        { status: 404 }
      ),
    };
  }

  if (role !== "platform_admin" && customer.tenant_id !== callerTenantId) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Keine Berechtigung fuer diesen Kunden." },
        { status: 403 }
      ),
    };
  }

  const tenantId = customer.tenant_id;

  // Feature flag check (OPH-104) — against the customer's tenant.
  const { data: tenant, error: tenantError } = await adminClient
    .from("tenants")
    .select("id, price_lookup_enabled")
    .eq("id", tenantId)
    .single<TenantFlagRow>();

  if (tenantError || !tenant) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Mandant nicht gefunden." },
        { status: 404 }
      ),
    };
  }

  if (tenant.price_lookup_enabled !== true) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Price-Lookup-Modul ist fuer diesen Mandanten nicht aktiviert.",
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, tenantId };
}

/**
 * PUT /api/customers/[id]/discount-default
 * Upserts the customer-level default discount rate.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id: customerId } = await params;

    const auth = await authoriseDiscountWrite(customerId);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => null);
    const parsed = setDiscountRateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Ungueltige Eingabe.",
        },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Round to two decimals before persisting (defensive against floating-point drift).
    const rate = Math.round(parsed.data.rate * 100) / 100;

    const { error: upsertError } = await adminClient
      .from("customer_default_discounts")
      .upsert(
        {
          tenant_id: auth.tenantId,
          customer_id: customerId,
          discount_rate: rate,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,customer_id" }
      );

    if (upsertError) {
      console.error(
        "Error upserting customer default discount:",
        upsertError.message
      );
      return NextResponse.json(
        { success: false, error: "Standardrabatt konnte nicht gespeichert werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      "Unexpected error in PUT /api/customers/[id]/discount-default:",
      error
    );
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/customers/[id]/discount-default
 * Removes the customer-level default discount rate (no-op if not set).
 * Per-article overrides are NOT affected.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id: customerId } = await params;

    const auth = await authoriseDiscountWrite(customerId);
    if (!auth.ok) return auth.response;

    const adminClient = createAdminClient();

    const { error: deleteError } = await adminClient
      .from("customer_default_discounts")
      .delete()
      .eq("tenant_id", auth.tenantId)
      .eq("customer_id", customerId);

    if (deleteError) {
      console.error(
        "Error deleting customer default discount:",
        deleteError.message
      );
      return NextResponse.json(
        { success: false, error: "Standardrabatt konnte nicht entfernt werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      "Unexpected error in DELETE /api/customers/[id]/discount-default:",
      error
    );
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
