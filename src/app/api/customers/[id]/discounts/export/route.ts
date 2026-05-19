import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata } from "@/lib/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FETCH_PAGE_SIZE = 1000;

interface TenantFlagRow {
  id: string;
  price_lookup_enabled: boolean | null;
}

interface CustomerRow {
  id: string;
  tenant_id: string;
  // Migration 033 made customer_number nullable (auto-created dealer-linked
  // customers can lack one). Treat as optional and degrade gracefully.
  customer_number: string | null;
  company_name: string;
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
  id: string;
  article_id: string;
  discount_rate: number | string;
}

/**
 * OPH-107: Discount Rate Excel Export.
 *
 * GET /api/customers/[id]/discounts/export
 *
 * Streams an .xlsx file with one row per article in the tenant's catalog:
 *
 *   | ID | Article Number | Product Name | Customer Name | RRP (EUR) | Discount Rate (%) |
 *
 * - "ID" is the UUID of the `customer_article_discounts` record for that
 *   (customer, article) pair; blank when the row uses the customer default.
 * - "RRP" is blank when not set on the article.
 * - "Discount Rate" is the effective rate (override → default → blank).
 *
 * The "ID" + "Discount Rate" columns are the only columns the matching
 * import endpoint reads back; users can freely edit/sort/hide other columns.
 *
 * Auth: tenant_admin or platform_admin. Tenant scope follows the customer's
 * tenant (platform admins may export across tenants).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

    const role = appMetadata?.role;
    if (role !== "tenant_admin" && role !== "platform_admin") {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const callerTenantId = appMetadata?.tenant_id;
    if (!callerTenantId) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();

    // Resolve effective tenant from the customer (platform admins may operate
    // across tenants).
    const { data: customer, error: customerError } = await adminClient
      .from("customer_catalog")
      .select("id, tenant_id, customer_number, company_name")
      .eq("id", customerId)
      .single<CustomerRow>();

    if (customerError || !customer) {
      return NextResponse.json(
        { success: false, error: "Kunde nicht gefunden." },
        { status: 404 }
      );
    }

    if (role !== "platform_admin" && customer.tenant_id !== callerTenantId) {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung fuer diesen Kunden." },
        { status: 403 }
      );
    }

    const tenantId = customer.tenant_id;

    // Feature flag (OPH-104) — against the customer's tenant.
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
          error:
            "Price-Lookup-Modul ist fuer diesen Mandanten nicht aktiviert.",
        },
        { status: 403 }
      );
    }

    // 1. Paginated fetch of ALL articles for this tenant (PostgREST caps at
    //    1000 per request; tenants may have a few thousand articles).
    const articles: ArticleRow[] = [];
    {
      let offset = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await adminClient
          .from("article_catalog")
          .select("id, article_number, name, rrp")
          .eq("tenant_id", tenantId)
          .order("article_number", { ascending: true })
          .range(offset, offset + FETCH_PAGE_SIZE - 1);

        if (error) {
          console.error(
            "Error exporting articles for discount sheet:",
            error.message
          );
          return NextResponse.json(
            { success: false, error: "Export fehlgeschlagen." },
            { status: 500 }
          );
        }

        if (!data || data.length === 0) break;
        articles.push(...(data as ArticleRow[]));
        if (data.length < FETCH_PAGE_SIZE) break;
        offset += FETCH_PAGE_SIZE;
      }
    }

    // 2. Customer default rate (single row or none).
    const { data: defaultRow, error: defaultError } = await adminClient
      .from("customer_default_discounts")
      .select("discount_rate")
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId)
      .maybeSingle<DefaultRow>();

    if (defaultError) {
      console.error(
        "Error fetching default discount for export:",
        defaultError.message
      );
      return NextResponse.json(
        {
          success: false,
          error: "Standardrabatt konnte nicht geladen werden.",
        },
        { status: 500 }
      );
    }

    const defaultRate = toNumberOrNull(defaultRow?.discount_rate ?? null);

    // 3. All overrides for this (tenant, customer) — bounded by the tenant's
    //    catalog size, so a single fetch is fine.
    const { data: overrideData, error: overridesError } = await adminClient
      .from("customer_article_discounts")
      .select("id, article_id, discount_rate")
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId);

    if (overridesError) {
      console.error(
        "Error fetching article overrides for export:",
        overridesError.message
      );
      return NextResponse.json(
        { success: false, error: "Overrides konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    const overrideMap = new Map<
      string,
      { id: string; rate: number | null }
    >();
    for (const row of (overrideData ?? []) as OverrideRow[]) {
      overrideMap.set(row.article_id, {
        id: row.id,
        rate: toNumberOrNull(row.discount_rate),
      });
    }

    // 4. Build the worksheet rows.
    const header = [
      "ID",
      "Article Number",
      "Product Name",
      "Customer Name",
      "RRP (€)",
      "Discount Rate (%)",
    ];

    type SheetRow = [
      string,
      string,
      string,
      string,
      number | string,
      number | string
    ];

    const rows: SheetRow[] = articles.map((article) => {
      const override = overrideMap.get(article.id);
      let effectiveRate: number | null = null;
      let rowId = "";

      if (override && override.rate !== null) {
        effectiveRate = override.rate;
        rowId = override.id;
      } else if (defaultRate !== null) {
        effectiveRate = defaultRate;
      }

      const rrp = toNumberOrNull(article.rrp);

      return [
        rowId,
        escapeForXlsx(article.article_number),
        escapeForXlsx(article.name),
        escapeForXlsx(customer.company_name),
        rrp === null ? "" : rrp,
        effectiveRate === null ? "" : effectiveRate,
      ];
    });

    // 5. Build the XLSX file.
    const wsData: (string | number)[][] = [header, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Apply column widths sized to the longest content.
    const colWidths = header.map((h, i) => {
      let maxLen = h.length;
      for (const r of rows) {
        const cell = r[i];
        const cellStr = cell === "" || cell === null ? "" : String(cell);
        if (cellStr.length > maxLen) maxLen = cellStr.length;
      }
      // Clamp width: min 10, max 48 (so UUIDs fit comfortably).
      return { wch: Math.min(Math.max(maxLen + 2, 10), 48) };
    });
    ws["!cols"] = colWidths;

    // Apply number formatting on the numeric columns (RRP = column E, rate = F).
    // SheetJS lets us set `z` per cell; we iterate body rows only.
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const sheetRow = rowIdx + 1; // +1 to skip header
      const rrpCellRef = XLSX.utils.encode_cell({ r: sheetRow, c: 4 });
      const rateCellRef = XLSX.utils.encode_cell({ r: sheetRow, c: 5 });

      const rrpCell = ws[rrpCellRef];
      if (rrpCell && typeof rrpCell.v === "number") {
        rrpCell.t = "n";
        rrpCell.z = "0.00";
      }

      const rateCell = ws[rateCellRef];
      if (rateCell && typeof rateCell.v === "number") {
        rateCell.t = "n";
        rateCell.z = "0.00";
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rabatte");

    const xlsxBuffer = XLSX.write(wb, {
      bookType: "xlsx",
      type: "buffer",
    }) as Buffer;

    // Sanitize the customer number for filename safety. customer_number may
    // be null (migration 033) — fall back to the customer's UUID.
    const rawNumber =
      typeof customer.customer_number === "string" &&
      customer.customer_number.trim().length > 0
        ? customer.customer_number
        : customer.id;
    const safeCustomerNumber =
      rawNumber.replace(/[^a-zA-Z0-9_.-]/g, "_") || "customer";
    const filename = `${safeCustomerNumber}_discount_rates.xlsx`;

    return new NextResponse(new Uint8Array(xlsxBuffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(
      "Unexpected error in GET /api/customers/[id]/discounts/export:",
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
 * Returns null for null/blank/non-finite values.
 */
function toNumberOrNull(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = value.toString().trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Prevent CSV/XLSX formula injection. Cells starting with `=`, `+`, `-`, `@`,
 * tab, or carriage return can be executed as formulas by Excel when opened.
 * Prefixing with a single quote forces Excel to treat the cell as literal text
 * (the quote is not displayed in the cell).
 */
function escapeForXlsx(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.length === 0) return s;
  const first = s.charAt(0);
  if (first === "=" || first === "+" || first === "-" || first === "@" || first === "\t" || first === "\r") {
    return `'${s}`;
  }
  return s;
}
