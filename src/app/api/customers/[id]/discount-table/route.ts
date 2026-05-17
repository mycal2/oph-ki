import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AppMetadata,
  ApiResponse,
  CustomerDiscountTableResponse,
  CustomerDiscountTableRow,
  DiscountSource,
} from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  article_number: string;
  name: string;
  rrp: number | string | null;
}

interface DefaultRow {
  discount_rate: number | string | null;
}

interface OverrideRow {
  article_id: string;
  discount_rate: number | string;
}

/**
 * OPH-106: Paginated discount table for a single customer.
 *
 * Returns one row per article in the tenant's catalog with the effective
 * discount rate resolved as:
 *   1. explicit per-article override (if exists)
 *   2. customer-level default rate (if set)
 *   3. null (display "—")
 *
 * The page is over articles, not overrides, so newly-added catalog rows
 * automatically appear here with the default applied — no backfill needed.
 *
 * Read access requires only an authenticated tenant member; writes go through
 * the discount-default and article-discounts routes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<CustomerDiscountTableResponse>>> {
  try {
    const { id: customerId } = await params;

    if (!UUID_REGEX.test(customerId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Kunden-ID." },
        { status: 400 }
      );
    }

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

    const callerTenantId = appMetadata?.tenant_id;
    const callerRole = appMetadata?.role;
    if (!callerTenantId) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
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
      return NextResponse.json(
        { success: false, error: "Kunde nicht gefunden." },
        { status: 404 }
      );
    }

    if (callerRole !== "platform_admin" && customer.tenant_id !== callerTenantId) {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung fuer diesen Kunden." },
        { status: 403 }
      );
    }

    const tenantId = customer.tenant_id;

    // Feature flag (OPH-104) — checked against the customer's tenant.
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("id, price_lookup_enabled")
      .eq("id", tenantId)
      .single<TenantFlagRow>();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { success: false, error: "Mandant nicht gefunden." },
        { status: 404 }
      );
    }

    if (tenant.price_lookup_enabled !== true) {
      return NextResponse.json(
        {
          success: false,
          error: "Price-Lookup-Modul ist fuer diesen Mandanten nicht aktiviert.",
        },
        { status: 403 }
      );
    }

    // Parse pagination + search.
    const url = new URL(request.url);
    const pageParam = parseInt(url.searchParams.get("page") ?? "1", 10);
    const pageSizeParam = parseInt(url.searchParams.get("pageSize") ?? "50", 10);
    const page = Math.max(1, Number.isFinite(pageParam) ? pageParam : 1);
    const pageSize = Math.min(
      Math.max(1, Number.isFinite(pageSizeParam) ? pageSizeParam : 50),
      200
    );
    const offset = (page - 1) * pageSize;
    const search = url.searchParams.get("search")?.trim() ?? "";

    // 1. Paginated articles list (anchor of the table).
    let articleQuery = adminClient
      .from("article_catalog")
      .select("id, article_number, name, rrp", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("article_number", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (search.length > 0) {
      const escaped = search.replace(/%/g, "\\%").replace(/_/g, "\\_");
      articleQuery = articleQuery.or(
        [
          `article_number.ilike.%${escaped}%`,
          `name.ilike.%${escaped}%`,
        ].join(",")
      );
    }

    const {
      data: articles,
      count: articlesCount,
      error: articlesError,
    } = await articleQuery;

    if (articlesError) {
      console.error(
        "Error fetching articles for discount table:",
        articlesError.message
      );
      return NextResponse.json(
        { success: false, error: "Artikel konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    const articleRows = (articles ?? []) as ArticleRow[];

    // 2. Customer default rate (single row or none).
    const { data: defaultRow, error: defaultError } = await adminClient
      .from("customer_default_discounts")
      .select("discount_rate")
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId)
      .maybeSingle<DefaultRow>();

    if (defaultError) {
      console.error(
        "Error fetching default discount:",
        defaultError.message
      );
      return NextResponse.json(
        { success: false, error: "Standardrabatt konnte nicht geladen werden." },
        { status: 500 }
      );
    }

    const defaultRate = toNumberOrNull(defaultRow?.discount_rate ?? null);

    // 3. Overrides for the articles on this page only (bounded by pageSize).
    const articleIds = articleRows.map((a) => a.id);

    let overrideMap = new Map<string, number>();
    if (articleIds.length > 0) {
      const { data: overrides, error: overridesError } = await adminClient
        .from("customer_article_discounts")
        .select("article_id, discount_rate")
        .eq("tenant_id", tenantId)
        .eq("customer_id", customerId)
        .in("article_id", articleIds);

      if (overridesError) {
        console.error(
          "Error fetching article overrides:",
          overridesError.message
        );
        return NextResponse.json(
          { success: false, error: "Overrides konnten nicht geladen werden." },
          { status: 500 }
        );
      }

      overrideMap = new Map(
        ((overrides ?? []) as OverrideRow[])
          .map((row): [string, number | null] => [
            row.article_id,
            toNumberOrNull(row.discount_rate),
          ])
          .filter((entry): entry is [string, number] => entry[1] !== null)
      );
    }

    // 4. Merge into table rows.
    const rows: CustomerDiscountTableRow[] = articleRows.map((article) => {
      const override = overrideMap.get(article.id);
      let source: DiscountSource;
      let effective_rate: number | null;

      if (override !== undefined) {
        source = "override";
        effective_rate = override;
      } else if (defaultRate !== null) {
        source = "default";
        effective_rate = defaultRate;
      } else {
        source = "none";
        effective_rate = null;
      }

      const rrp = toNumberOrNull(article.rrp);
      let discounted_price: number | null = null;
      if (rrp !== null && effective_rate !== null) {
        discounted_price =
          Math.round(rrp * (1 - effective_rate / 100) * 10000) / 10000;
      }

      return {
        article_id: article.id,
        article_number: article.article_number,
        article_name: article.name,
        rrp,
        effective_rate,
        source,
        discounted_price,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        rows,
        total: articlesCount ?? 0,
        page,
        pageSize,
        default_rate: defaultRate,
      },
    });
  } catch (error) {
    console.error(
      "Unexpected error in GET /api/customers/[id]/discount-table:",
      error
    );
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * Parses Supabase's NUMERIC return type to a JS number.
 *
 * Supabase returns NUMERIC columns as either string or number depending on
 * the client and PG version, so we normalise both. Returns null for
 * null/undefined/blank/non-finite values.
 */
function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = value.toString().trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
