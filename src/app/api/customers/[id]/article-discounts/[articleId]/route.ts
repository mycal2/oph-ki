import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setDiscountRateSchema } from "@/lib/validations";
import type { AppMetadata, ApiResponse } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * OPH-106: Per-(customer, article) discount overrides.
 *
 *   PUT    /api/customers/[id]/article-discounts/[articleId]   { rate: number }
 *   DELETE /api/customers/[id]/article-discounts/[articleId]
 *
 * Same auth envelope as discount-default. Both customer and article must
 * belong to the caller's tenant.
 */

interface TenantFlagRow {
  id: string;
  price_lookup_enabled: boolean | null;
}

interface CustomerRow {
  id: string;
  tenant_id: string;
}

interface ArticleRow {
  id: string;
  tenant_id: string;
}

async function authoriseOverrideWrite(
  customerId: string,
  articleId: string
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
  if (!UUID_REGEX.test(articleId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Ungueltige Artikel-ID." },
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

  // Customer ownership — resolve effective tenant (platform admins may operate
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

  // Feature flag (OPH-104) — against the customer's tenant.
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

  // Article must belong to the same tenant as the customer.
  const { data: article, error: articleError } = await adminClient
    .from("article_catalog")
    .select("id, tenant_id")
    .eq("id", articleId)
    .single<ArticleRow>();

  if (articleError || !article) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Artikel nicht gefunden." },
        { status: 404 }
      ),
    };
  }

  if (article.tenant_id !== tenantId) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Keine Berechtigung fuer diesen Artikel." },
        { status: 403 }
      ),
    };
  }

  return { ok: true, tenantId };
}

/**
 * PUT /api/customers/[id]/article-discounts/[articleId]
 * Upserts an explicit per-article discount override for the customer.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; articleId: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id: customerId, articleId } = await params;

    const auth = await authoriseOverrideWrite(customerId, articleId);
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
    const rate = Math.round(parsed.data.rate * 100) / 100;

    const { error: upsertError } = await adminClient
      .from("customer_article_discounts")
      .upsert(
        {
          tenant_id: auth.tenantId,
          customer_id: customerId,
          article_id: articleId,
          discount_rate: rate,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,customer_id,article_id" }
      );

    if (upsertError) {
      console.error(
        "Error upserting article discount override:",
        upsertError.message
      );
      return NextResponse.json(
        { success: false, error: "Rabatt-Override konnte nicht gespeichert werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      "Unexpected error in PUT /api/customers/[id]/article-discounts/[articleId]:",
      error
    );
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/customers/[id]/article-discounts/[articleId]
 * Removes an explicit per-article override (the row reverts to the default
 * rate at the next lookup, or "—" if no default is set).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; articleId: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id: customerId, articleId } = await params;

    const auth = await authoriseOverrideWrite(customerId, articleId);
    if (!auth.ok) return auth.response;

    const adminClient = createAdminClient();

    const { error: deleteError } = await adminClient
      .from("customer_article_discounts")
      .delete()
      .eq("tenant_id", auth.tenantId)
      .eq("customer_id", customerId)
      .eq("article_id", articleId);

    if (deleteError) {
      console.error(
        "Error deleting article discount override:",
        deleteError.message
      );
      return NextResponse.json(
        { success: false, error: "Override konnte nicht entfernt werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      "Unexpected error in DELETE /api/customers/[id]/article-discounts/[articleId]:",
      error
    );
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
