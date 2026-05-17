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

    // Locate the ID and Discount Rate columns by header.
    const rawHeaders = rawData[0].map((h) => String(h ?? "").trim());
    let idCol = -1;
    let rateCol = -1;
    for (let i = 0; i < rawHeaders.length; i++) {
      const norm = rawHeaders[i].toLowerCase();
      if (idCol === -1 && ID_HEADERS.has(norm)) idCol = i;
      if (rateCol === -1 && RATE_HEADERS.has(norm)) rateCol = i;
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

    // Walk the body rows, partition into (id, rate) updates / skips / errors.
    let updated = 0;
    let skipped = 0;
    let totalErrors = 0;
    const errors: string[] = [];

    interface UpdatePlan {
      rowIndex: number; // 1-based Excel row (header is row 1)
      id: string;
      rate: number;
    }
    const plans: UpdatePlan[] = [];

    for (let i = 1; i < rawData.length; i++) {
      const excelRow = i + 1; // 1-based, matches Excel UI
      const cols = rawData[i];
      const rawId = String(cols[idCol] ?? "").trim();
      const rawRate = cols[rateCol];

      if (rawId.length === 0) {
        skipped++;
        continue;
      }
      if (!UUID_REGEX.test(rawId)) {
        totalErrors++;
        addError(errors, `Zeile ${excelRow}: Ungueltige ID.`);
        continue;
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
      if (parsedRate === "blank") {
        skipped++;
        continue;
      }
      if (parsedRate === "invalid") {
        totalErrors++;
        addError(errors, `Zeile ${excelRow}: Ungueltiger Rabattsatz.`);
        continue;
      }

      plans.push({ rowIndex: excelRow, id: rawId, rate: parsedRate });
    }

    // If nothing to update, return early.
    if (plans.length === 0) {
      return NextResponse.json({
        success: true,
        data: { updated, skipped, errors, total_errors: totalErrors },
      });
    }

    // Confirm which IDs actually exist in THIS tenant for THIS customer.
    // Tenant scoping is enforced here: IDs from other tenants will simply not
    // appear in the result set.
    const planIds = plans.map((p) => p.id);
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

    // Now do the actual UPDATEs (one per row to stay simple; max sizes are
    // realistic single-customer scales — a few thousand at most).
    const nowIso = new Date().toISOString();

    for (const plan of plans) {
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

    return NextResponse.json({
      success: true,
      data: {
        updated,
        skipped,
        errors,
        total_errors: totalErrors,
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
