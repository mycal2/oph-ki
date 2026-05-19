import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AppMetadata,
  ApiResponse,
  DiscountImportResult,
} from "@/lib/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hard cap so we never report more than this many error strings. */
const MAX_ERROR_LIST = 100;

/** Header label lookups (case-insensitive, trimmed). */
const ID_HEADERS = new Set(["id", "uuid", "datensatz-id", "record id"]);
const RATE_HEADERS = new Set([
  "discount rate (%)",
  "discount rate",
  "rate",
  "rabattsatz (%)",
  "rabattsatz",
  "rabatt (%)",
  "rabatt",
]);
const ARTICLE_NUMBER_HEADERS = new Set([
  "article number",
  "article no",
  "article no.",
  "art.nr",
  "art.nr.",
  "artikelnummer",
  "art-nr.",
  "art-nr",
]);
const RRP_HEADERS = new Set([
  "rrp",
  "rrp (€)",
  "rrp (eur)",
  "uvp",
  "uvp (€)",
  "uvp (eur)",
]);

interface TenantFlagRow {
  id: string;
  price_lookup_enabled: boolean | null;
}

interface CustomerRow {
  id: string;
  tenant_id: string;
}

/**
 * OPH-107: Discount Rate Excel Import.
 *
 * POST /api/customers/[id]/discounts/import
 *
 * Multipart form upload (field: "file"). Reads the XLSX and applies UPDATEs
 * on `customer_article_discounts.discount_rate` for rows that have:
 *   - a valid UUID in the "ID" column AND
 *   - a numeric rate in the "Discount Rate" column (0–100, max 2 decimals)
 *
 * All other columns are ignored — the user is free to edit, sort, or hide
 * them in Excel without breaking the round-trip. New override records cannot
 * be created via import; that flow happens in the UI (OPH-106).
 *
 * Tenant scoping: rows are UPDATEd with a WHERE clause that requires both the
 * record ID and `tenant_id` to match — IDs from foreign tenants fall through
 * as "Datensatz nicht gefunden".
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<DiscountImportResult>>> {
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

    // Customer ownership / effective-tenant resolution.
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

    if (role !== "platform_admin" && customer.tenant_id !== callerTenantId) {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung fuer diesen Kunden." },
        { status: 403 }
      );
    }

    const tenantId = customer.tenant_id;

    // Feature-flag (OPH-104) gate.
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

    // Parse multipart form.
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Ungueltige FormData. Bitte eine Datei hochladen.",
        },
        { status: 400 }
      );
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: "Keine Datei hochgeladen. Feld 'file' ist erforderlich.",
        },
        { status: 400 }
      );
    }

    // XLSX only.
    const filename = file.name.toLowerCase();
    if (!filename.endsWith(".xlsx")) {
      return NextResponse.json(
        {
          success: false,
          error: "Nur Excel-Dateien (.xlsx) sind erlaubt.",
        },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "Datei ist zu gross. Maximum: 10 MB." },
        { status: 400 }
      );
    }

    // Read + parse.
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: "buffer" });
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "Datei konnte nicht gelesen werden. Bitte eine gueltige .xlsx-Datei hochladen.",
        },
        { status: 400 }
      );
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json(
        {
          success: false,
          error: "Datei enthaelt keine Tabellenblaetter.",
        },
        { status: 400 }
      );
    }
    const sheet = workbook.Sheets[sheetName];
    const rawData: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
    }) as unknown[][];

    if (rawData.length < 2) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Datei muss mindestens eine Kopfzeile und eine Datenzeile enthalten.",
        },
        { status: 400 }
      );
    }

    // Locate the ID, Discount Rate, Article Number, and RRP columns by header.
    const rawHeaders = rawData[0].map((h) => String(h ?? "").trim());
    let idCol = -1;
    let rateCol = -1;
    let articleNumberCol = -1;
    let rrpCol = -1;
    for (let i = 0; i < rawHeaders.length; i++) {
      const norm = rawHeaders[i].toLowerCase();
      if (idCol === -1 && ID_HEADERS.has(norm)) idCol = i;
      if (rateCol === -1 && RATE_HEADERS.has(norm)) rateCol = i;
      if (articleNumberCol === -1 && ARTICLE_NUMBER_HEADERS.has(norm))
        articleNumberCol = i;
      if (rrpCol === -1 && RRP_HEADERS.has(norm)) rrpCol = i;
    }

    const missingCols: string[] = [];
    if (idCol === -1) missingCols.push("ID");
    if (rateCol === -1) missingCols.push("Discount Rate (%)");
    if (missingCols.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Pflichtspalten nicht gefunden: ${missingCols.join(", ")}.`,
        },
        { status: 400 }
      );
    }

    // Load the customer's default discount rate. Rows without an ID whose rate
    // matches the default get skipped (the user kept the row at the default,
    // so no override is needed).
    const { data: defaultRow, error: defaultErr } = await adminClient
      .from("customer_default_discounts")
      .select("discount_rate")
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId)
      .maybeSingle<{ discount_rate: number | string | null }>();

    if (defaultErr) {
      console.error(
        "Error loading customer default discount for import:",
        defaultErr.message
      );
      return NextResponse.json(
        {
          success: false,
          error: "Standardrabatt konnte nicht geladen werden.",
        },
        { status: 500 }
      );
    }

    const defaultRateRaw = defaultRow?.discount_rate ?? null;
    const customerDefaultRate =
      defaultRateRaw === null
        ? null
        : typeof defaultRateRaw === "number"
        ? defaultRateRaw
        : Number(defaultRateRaw);

    // Walk the body rows, partition into (id, rate) updates / inserts / skips / errors.
    let updated = 0;
    let inserted = 0;
    let skipped = 0;
    let totalErrors = 0;
    let rrpChangesIgnored = 0;
    const errors: string[] = [];

    // OPH-110: Collect (article_number → file_rrp) pairs for RRP-change
    // detection. RRP edits in the discount sheet are intentionally ignored
    // (master-data lives in the article catalog), but we count them so the
    // import dialog can surface a clear notice.
    const fileRrpByArticleNumber = new Map<string, number>();

    interface UpdatePlan {
      rowIndex: number; // 1-based Excel row (header is row 1)
      id: string;
      rate: number;
    }
    interface InsertPlan {
      rowIndex: number;
      articleNumber: string;
      rate: number;
    }
    const updatePlans: UpdatePlan[] = [];
    const insertPlans: InsertPlan[] = [];

    for (let i = 1; i < rawData.length; i++) {
      const excelRow = i + 1; // 1-based, matches Excel UI
      const cols = rawData[i];
      const rawId = String(cols[idCol] ?? "").trim();
      const rawRate = cols[rateCol];
      const rawArticleNumber =
        articleNumberCol >= 0
          ? String(cols[articleNumberCol] ?? "").trim()
          : "";

      // OPH-110: Capture file RRP (if present + numeric) so we can compare
      // against the catalog after the loop and report ignored RRP edits.
      if (rrpCol >= 0 && rawArticleNumber.length > 0) {
        const rrpRaw = cols[rrpCol];
        const rrpNum =
          typeof rrpRaw === "number"
            ? rrpRaw
            : typeof rrpRaw === "string" && rrpRaw.trim().length > 0
            ? Number(rrpRaw.replace(",", ".").replace(/\s+/g, ""))
            : null;
        if (rrpNum !== null && Number.isFinite(rrpNum)) {
          fileRrpByArticleNumber.set(rawArticleNumber, rrpNum);
        }
      }

      // BUG-3: Excel cells formatted as "15%" store the underlying value
      // as 0.15. Detect percentage formatting via the cell's `.z` style and
      // rescale to the 0-100 percent domain before parsing.
      const rateCellAddr = XLSX.utils.encode_cell({ r: i, c: rateCol });
      const rateCell = sheet[rateCellAddr] as { v?: unknown; z?: string } | undefined;
      const isPercentFormatted =
        typeof rateCell?.z === "string" && rateCell.z.includes("%");
      const rateInput =
        isPercentFormatted && typeof rawRate === "number"
          ? rawRate * 100
          : rawRate;

      const parsedRate = parseRate(rateInput);

      // Case A: row has an ID → existing override, UPDATE flow.
      if (rawId.length > 0) {
        if (!UUID_REGEX.test(rawId)) {
          totalErrors++;
          addError(errors, `Zeile ${excelRow}: Ungueltige ID.`);
          continue;
        }
        if (parsedRate === "blank") {
          skipped++;
          continue;
        }
        if (parsedRate === "invalid") {
          totalErrors++;
          addError(errors, `Zeile ${excelRow}: Ungueltiger Rabattsatz.`);
          continue;
        }
        updatePlans.push({ rowIndex: excelRow, id: rawId, rate: parsedRate });
        continue;
      }

      // Case B: no ID → potential INSERT.
      // Skip silently when rate is blank (no rate, no override needed).
      if (parsedRate === "blank") {
        skipped++;
        continue;
      }
      if (parsedRate === "invalid") {
        totalErrors++;
        addError(errors, `Zeile ${excelRow}: Ungueltiger Rabattsatz.`);
        continue;
      }
      // Without an article_number we cannot resolve the target article.
      if (rawArticleNumber.length === 0) {
        // No article number column or empty cell — silently skip rather than
        // erroring (legacy files without the column should keep working).
        skipped++;
        continue;
      }
      // If the rate equals the customer default, the user kept the row at the
      // default; no override needed.
      if (
        customerDefaultRate !== null &&
        Math.abs(parsedRate - customerDefaultRate) < 1e-6
      ) {
        skipped++;
        continue;
      }

      insertPlans.push({
        rowIndex: excelRow,
        articleNumber: rawArticleNumber,
        rate: parsedRate,
      });
    }

    // If nothing to update or insert, still fall through to the RRP-change
    // detection block below so the user sees the "RRP edits ignored" notice
    // even when the only edits in the file were RRP changes.

    const nowIso = new Date().toISOString();

    // --- UPDATES (existing overrides identified by record ID) ---
    if (updatePlans.length > 0) {
      const planIds = updatePlans.map((p) => p.id);
      const { data: existingRows, error: lookupError } = await adminClient
        .from("customer_article_discounts")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("customer_id", customerId)
        .in("id", planIds);

      if (lookupError) {
        console.error(
          "Error looking up existing discount overrides for import:",
          lookupError.message
        );
        return NextResponse.json(
          {
            success: false,
            error: "Datenbankfehler beim Pruefen der Datensaetze.",
          },
          { status: 500 }
        );
      }

      const validIdSet = new Set<string>(
        (existingRows ?? []).map((r) => (r as { id: string }).id)
      );

      for (const plan of updatePlans) {
        if (!validIdSet.has(plan.id)) {
          totalErrors++;
          addError(
            errors,
            `Zeile ${plan.rowIndex}: Datensatz nicht gefunden.`
          );
          continue;
        }

        const { error: updateError } = await adminClient
          .from("customer_article_discounts")
          .update({
            discount_rate: plan.rate,
            updated_at: nowIso,
          })
          .eq("id", plan.id)
          .eq("tenant_id", tenantId)
          .eq("customer_id", customerId);

        if (updateError) {
          console.error(
            `Error updating discount override id=${plan.id}:`,
            updateError.message
          );
          totalErrors++;
          addError(
            errors,
            `Zeile ${plan.rowIndex}: Update fehlgeschlagen.`
          );
          continue;
        }

        updated++;
      }
    }

    // --- INSERTS (new overrides resolved by Article Number) ---
    if (insertPlans.length > 0) {
      const distinctNumbers = Array.from(
        new Set(insertPlans.map((p) => p.articleNumber))
      );
      const { data: articleRows, error: articleErr } = await adminClient
        .from("article_catalog")
        .select("id, article_number")
        .eq("tenant_id", tenantId)
        .in("article_number", distinctNumbers);

      if (articleErr) {
        console.error(
          "Error looking up articles for discount import insert:",
          articleErr.message
        );
        return NextResponse.json(
          {
            success: false,
            error: "Datenbankfehler beim Pruefen der Artikel.",
          },
          { status: 500 }
        );
      }

      const articleIdByNumber = new Map<string, string>();
      for (const row of (articleRows ?? []) as {
        id: string;
        article_number: string;
      }[]) {
        articleIdByNumber.set(row.article_number, row.id);
      }

      // Upsert one row at a time. The (tenant_id, customer_id, article_id)
      // tuple is constrained unique by migration 054, so concurrent uploads
      // collapse cleanly to the latest write.
      for (const plan of insertPlans) {
        const articleId = articleIdByNumber.get(plan.articleNumber);
        if (!articleId) {
          totalErrors++;
          addError(
            errors,
            `Zeile ${plan.rowIndex}: Artikel "${plan.articleNumber}" nicht gefunden.`
          );
          continue;
        }

        const { error: upsertError } = await adminClient
          .from("customer_article_discounts")
          .upsert(
            {
              tenant_id: tenantId,
              customer_id: customerId,
              article_id: articleId,
              discount_rate: plan.rate,
              updated_at: nowIso,
            },
            { onConflict: "tenant_id,customer_id,article_id" }
          );

        if (upsertError) {
          console.error(
            `Error inserting discount override for article ${plan.articleNumber}:`,
            upsertError.message
          );
          totalErrors++;
          addError(
            errors,
            `Zeile ${plan.rowIndex}: Anlegen fehlgeschlagen.`
          );
          continue;
        }

        inserted++;
      }
    }

    // --- RRP CHANGE DETECTION (read-only — RRP must be edited in article catalog) ---
    if (fileRrpByArticleNumber.size > 0) {
      const numbers = Array.from(fileRrpByArticleNumber.keys());
      const { data: catalogRows, error: catalogErr } = await adminClient
        .from("article_catalog")
        .select("article_number, rrp")
        .eq("tenant_id", tenantId)
        .in("article_number", numbers);

      if (catalogErr) {
        console.error(
          "Error comparing RRP against catalog (non-fatal):",
          catalogErr.message
        );
      } else {
        for (const row of (catalogRows ?? []) as {
          article_number: string;
          rrp: number | string | null;
        }[]) {
          const fileRrp = fileRrpByArticleNumber.get(row.article_number);
          if (fileRrp === undefined) continue;
          const currentRrp =
            row.rrp === null
              ? null
              : typeof row.rrp === "number"
              ? row.rrp
              : Number(row.rrp);
          if (currentRrp === null || !Number.isFinite(currentRrp)) {
            // Article currently has no RRP, file provided one — treat as ignored edit.
            rrpChangesIgnored++;
          } else if (Math.abs(fileRrp - currentRrp) > 1e-4) {
            rrpChangesIgnored++;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        updated,
        inserted,
        skipped,
        errors,
        total_errors: totalErrors,
        rrp_changes_ignored: rrpChangesIgnored,
      },
    });
  } catch (error) {
    console.error(
      "Unexpected error in POST /api/customers/[id]/discounts/import:",
      error
    );
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * Appends an error to the bounded error list. Once the cap is reached, a
 * single "+N weitere Fehler" line is kept up-to-date at the end.
 */
function addError(errors: string[], message: string): void {
  // Count current "+N weitere Fehler" line if present.
  const tail = errors[errors.length - 1];
  const overflowMatch = tail?.match(/^\+(\d+) weitere Fehler\.$/);

  if (overflowMatch) {
    const n = parseInt(overflowMatch[1], 10) + 1;
    errors[errors.length - 1] = `+${n} weitere Fehler.`;
    return;
  }

  if (errors.length < MAX_ERROR_LIST) {
    errors.push(message);
    return;
  }

  errors.push("+1 weitere Fehler.");
}

/**
 * Parses a discount rate cell value.
 * Returns:
 *   - "blank"   when the cell is empty / whitespace-only
 *   - "invalid" when the cell is non-numeric, negative, > 100, or has more
 *               than two decimals
 *   - the numeric rate (rounded to 2 decimals) when valid
 *
 * Accepts both "15.5", "15,5", 15.5 (Excel numeric), and "15,5 %" type
 * shapes — we strip whitespace, optional trailing %, and comma decimals.
 */
function parseRate(value: unknown): number | "blank" | "invalid" {
  if (value === null || value === undefined) return "blank";

  // Excel returns numbers as JS numbers when the cell type is numeric.
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "invalid";
    if (value < 0 || value > 100) return "invalid";
    // Allow tiny floating-point noise but reject genuinely >2 decimals.
    const rounded = Math.round(value * 100) / 100;
    if (Math.abs(rounded - value) > 1e-6) return "invalid";
    return rounded;
  }

  const raw = String(value).trim();
  if (raw.length === 0) return "blank";

  // Strip optional trailing percent sign and inner whitespace.
  let cleaned = raw.replace(/\s+/g, "");
  if (cleaned.endsWith("%")) {
    cleaned = cleaned.slice(0, -1);
  }
  cleaned = cleaned.replace(",", ".");

  if (cleaned.length === 0) return "blank";

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return "invalid";
  if (parsed < 0 || parsed > 100) return "invalid";

  const rounded = Math.round(parsed * 100) / 100;
  if (Math.abs(rounded - parsed) > 1e-6) return "invalid";
  return rounded;
}
