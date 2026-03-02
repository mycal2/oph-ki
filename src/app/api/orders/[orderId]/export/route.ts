import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exportFormatSchema } from "@/lib/validations";
import {
  generateFilename,
  contentDisposition,
  MAX_LINE_ITEMS,
} from "@/lib/export-utils";
import {
  generateExportContent,
  validateRequiredFields,
} from "@/lib/erp-transformations";
import type {
  AppMetadata,
  ExportFormat,
  ErpColumnMappingExtended,
  CanonicalOrderData,
} from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Default column mappings used when fallback_mode is "fallback_csv"
 * or for backward-compatible tenants without an OPH-9 config.
 */
const DEFAULT_COLUMN_MAPPINGS: ErpColumnMappingExtended[] = [
  { source_field: "position", target_column_name: "Pos", required: false, transformations: [] },
  { source_field: "article_number", target_column_name: "Artikelnummer", required: false, transformations: [] },
  { source_field: "description", target_column_name: "Beschreibung", required: false, transformations: [] },
  { source_field: "quantity", target_column_name: "Menge", required: false, transformations: [] },
  { source_field: "unit", target_column_name: "Einheit", required: false, transformations: [] },
  { source_field: "unit_price", target_column_name: "Einzelpreis", required: false, transformations: [] },
  { source_field: "total_price", target_column_name: "Gesamtpreis", required: false, transformations: [] },
  { source_field: "currency", target_column_name: "Waehrung", required: false, transformations: [] },
];

/**
 * GET /api/orders/[orderId]/export?format=csv
 *
 * Generates the export file, streams it as a download response,
 * updates order status to "exported", and logs the export.
 *
 * OPH-9: Now uses the transformation engine and respects fallback_mode.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse> {
  try {
    const { orderId } = await params;
    const rawFormat = request.nextUrl.searchParams.get("format") ?? "csv";

    // 1. Validate inputs
    if (!UUID_REGEX.test(orderId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Bestellungs-ID." },
        { status: 400 }
      );
    }

    const formatResult = exportFormatSchema.safeParse(rawFormat);
    if (!formatResult.success) {
      return NextResponse.json(
        { success: false, error: "Ungueltiges Format. Erlaubt: csv, xml, json" },
        { status: 400 }
      );
    }
    const format: ExportFormat = formatResult.data;

    // 2. Authenticate
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

    // 3. Fetch the order
    let orderQuery = adminClient
      .from("orders")
      .select("id, tenant_id, status, reviewed_data, extracted_data")
      .eq("id", orderId);

    if (!isPlatformAdmin && tenantId) {
      orderQuery = orderQuery.eq("tenant_id", tenantId);
    }

    const { data: order, error: orderError } = await orderQuery.single();

    if (orderError || !order) {
      return NextResponse.json(
        { success: false, error: "Bestellung nicht gefunden." },
        { status: 404 }
      );
    }

    // 4. Check order status
    if (!["approved", "exported"].includes(order.status as string)) {
      return NextResponse.json(
        {
          success: false,
          error: "Export ist nur fuer freigegebene Bestellungen moeglich.",
        },
        { status: 400 }
      );
    }

    // 5. Get order data
    const orderData = (order.reviewed_data ?? order.extracted_data) as CanonicalOrderData | null;

    if (!orderData) {
      return NextResponse.json(
        { success: false, error: "Keine Bestelldaten vorhanden." },
        { status: 400 }
      );
    }

    if (orderData.order.line_items.length > MAX_LINE_ITEMS) {
      return NextResponse.json(
        {
          success: false,
          error: `Zu viele Positionen (${orderData.order.line_items.length}). Maximal ${MAX_LINE_ITEMS} Positionen pro Export.`,
        },
        { status: 400 }
      );
    }

    // 6. Get tenant info for filename
    const effectiveTenantId = order.tenant_id as string;
    const { data: tenant } = await adminClient
      .from("tenants")
      .select("slug")
      .eq("id", effectiveTenantId)
      .single();

    const tenantSlug = (tenant?.slug as string) ?? "export";

    // 7. Get ERP config (OPH-9: one config per tenant, format stored in config)
    const { data: erpConfig } = await adminClient
      .from("erp_configs")
      .select("*")
      .eq("tenant_id", effectiveTenantId)
      .maybeSingle();

    const usingDefaultConfig = !erpConfig;
    const fallbackMode = (erpConfig?.fallback_mode as string) ?? "block";

    // OPH-9 AC-3: Enforce fallback mode
    if (usingDefaultConfig && fallbackMode === "block") {
      return NextResponse.json(
        {
          success: false,
          error: "Kein ERP-Mapping konfiguriert fuer diesen Mandanten.",
        },
        { status: 409 }
      );
    }

    // Determine effective format: use config's format if available, else the requested format
    const effectiveFormat: ExportFormat = erpConfig
      ? (erpConfig.format as ExportFormat)
      : format;

    // Build extended mappings
    const columnMappings: ErpColumnMappingExtended[] = erpConfig
      ? (erpConfig.column_mappings as ErpColumnMappingExtended[])
      : DEFAULT_COLUMN_MAPPINGS;

    const separator = (erpConfig?.separator as string) ?? ";";
    const quoteChar = (erpConfig?.quote_char as string) ?? '"';
    const lineEnding = (erpConfig?.line_ending as string) ?? "CRLF";
    const decimalSeparator = (erpConfig?.decimal_separator as string) ?? ".";
    const xmlTemplate = (erpConfig?.xml_template as string) ?? null;

    // OPH-9 AC-8: Validate required fields before export
    const missingFields = validateRequiredFields(orderData.order.line_items, columnMappings);
    if (missingFields.length > 0) {
      const fieldList = missingFields.slice(0, 10).join(", ");
      const more = missingFields.length > 10 ? ` (und ${missingFields.length - 10} weitere)` : "";
      return NextResponse.json(
        {
          success: false,
          error: `Pflichtfelder fehlen: ${fieldList}${more}. Bitte in der Bestellpruefung korrigieren.`,
        },
        { status: 400 }
      );
    }

    const filename = generateFilename(tenantSlug, orderData.order.order_number, effectiveFormat);

    // 8. Generate file content using transformation engine
    const { content, contentType } = generateExportContent(
      orderData,
      effectiveFormat,
      columnMappings,
      {
        separator,
        quoteChar,
        lineEnding,
        decimalSeparator,
        xmlTemplate,
      }
    );

    // 9. Update order status to "exported" and set last_exported_at
    const now = new Date().toISOString();
    const { error: statusError } = await adminClient
      .from("orders")
      .update({
        status: "exported",
        last_exported_at: now,
      })
      .eq("id", orderId);

    if (statusError) {
      console.error("Failed to update order status to exported:", statusError.message);
    }

    // 10. Log the export
    const { error: logError } = await adminClient.from("export_logs").insert({
      order_id: orderId,
      tenant_id: effectiveTenantId,
      user_id: user.id,
      format: effectiveFormat,
      filename,
      exported_at: now,
    });

    if (logError) {
      console.error("Failed to insert export log:", logError.message);
    }

    // 11. Audit log entry
    if (order.status !== "exported") {
      const { error: auditError } = await adminClient.from("order_edits").insert({
        order_id: orderId,
        tenant_id: effectiveTenantId,
        user_id: user.id,
        field_path: "status",
        old_value: JSON.stringify(order.status),
        new_value: JSON.stringify("exported"),
      });

      if (auditError) {
        console.error("Failed to insert audit log:", auditError.message);
      }
    }

    // 12. Stream the file as a download response
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Content-Disposition", contentDisposition(filename));
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    if (usingDefaultConfig) {
      headers.set("X-Export-Default-Config", "true");
    }

    return new NextResponse(content, { status: 200, headers });
  } catch (error) {
    console.error("Error in GET /api/orders/[orderId]/export:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
