import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exportFormatSchema } from "@/lib/validations";
import {
  generateFilename,
  MAX_LINE_ITEMS,
} from "@/lib/export-utils";
import {
  generateExportContent,
  getTransformedValue,
} from "@/lib/erp-transformations";
import { calculateConfidenceScore } from "@/lib/confidence-score";
import type {
  AppMetadata,
  ApiResponse,
  ExportPreviewResponse,
  ExportFormat,
  ErpColumnMappingExtended,
  CanonicalOrderData,
  ConfidenceScoreData,
  OutputFormatSchemaColumn,
} from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PREVIEW_ROWS = 10;

/**
 * Default column mappings for backward compatibility.
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
 * GET /api/orders/[orderId]/export/preview?format=csv
 *
 * Returns a preview of the export data (first 10 rows) as JSON.
 * OPH-9: Now uses the transformation engine.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse<ApiResponse<ExportPreviewResponse>>> {
  try {
    const { orderId } = await params;
    const rawFormat = request.nextUrl.searchParams.get("format") ?? "csv";

    // 1. Validate inputs
    if (!UUID_REGEX.test(orderId)) {
      return NextResponse.json(
        { success: false, error: "Ungültige Bestellungs-ID." },
        { status: 400 }
      );
    }

    const formatResult = exportFormatSchema.safeParse(rawFormat);
    if (!formatResult.success) {
      return NextResponse.json(
        { success: false, error: "Ungültiges Format. Erlaubt: csv, xml, json" },
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
          error: "Export ist nur für freigegebene Bestellungen möglich.",
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

    // 7. Get ERP config (OPH-29: resolve via tenant's erp_config_id)
    const { data: tenantConfig } = await adminClient
      .from("tenants")
      .select("erp_config_id")
      .eq("id", effectiveTenantId)
      .single();

    let erpConfig: Record<string, unknown> | null = null;
    if (tenantConfig?.erp_config_id) {
      const { data } = await adminClient
        .from("erp_configs")
        .select("*")
        .eq("id", tenantConfig.erp_config_id as string)
        .maybeSingle();
      erpConfig = data;
    }

    const usingDefaultConfig = !erpConfig;

    const columnMappings: ErpColumnMappingExtended[] = erpConfig
      ? (erpConfig.column_mappings as ErpColumnMappingExtended[])
      : DEFAULT_COLUMN_MAPPINGS;

    const separator = (erpConfig?.separator as string) ?? ";";
    const quoteChar = (erpConfig?.quote_char as string) ?? '"';
    const lineEnding = (erpConfig?.line_ending as string) ?? "CRLF";
    const decimalSeparator = (erpConfig?.decimal_separator as string) ?? ".";
    const xmlTemplate = (erpConfig?.xml_template as string) ?? null;
    const effectiveFormat: ExportFormat = erpConfig
      ? (erpConfig.format as ExportFormat)
      : format;
    const tenantDefaultFormat = erpConfig
      ? (erpConfig.format as ExportFormat)
      : undefined;

    const filename = generateFilename(tenantSlug, orderData.order.order_number, effectiveFormat);
    const lineItems = orderData.order.line_items;
    const totalRows = lineItems.length;
    const previewItems = lineItems.slice(0, MAX_PREVIEW_ROWS);

    // OPH-28: Calculate confidence score if output format is configured
    // OPH-29: Look up output format via erp_config_id (fallback to tenant_id)
    let confidenceScore: ConfidenceScoreData | undefined;
    try {
      const { data: outputFormat } = tenantConfig?.erp_config_id
        ? await adminClient
            .from("tenant_output_formats")
            .select("detected_schema")
            .eq("erp_config_id", tenantConfig.erp_config_id as string)
            .maybeSingle()
        : await adminClient
            .from("tenant_output_formats")
            .select("detected_schema")
            .eq("tenant_id", effectiveTenantId)
            .maybeSingle();

      if (outputFormat?.detected_schema) {
        confidenceScore = calculateConfidenceScore(
          orderData,
          outputFormat.detected_schema as OutputFormatSchemaColumn[],
          erpConfig ? (erpConfig.column_mappings as ErpColumnMappingExtended[]) : null
        );
      }
    } catch (scoreError) {
      console.error("Error calculating confidence score for preview:", scoreError);
    }

    // OPH-61: Include split output mode for split_csv configs
    const splitOutputMode = effectiveFormat === "split_csv"
      ? ((erpConfig?.split_output_mode as string) ?? "zip") as "zip" | "separate"
      : undefined;

    if (effectiveFormat === "csv") {
      const headers = columnMappings.map((m) => m.target_column_name);
      const rows = previewItems.map((item) =>
        columnMappings.map((m) => getTransformedValue(item, m, decimalSeparator, orderData))
      );

      return NextResponse.json({
        success: true,
        data: { format: effectiveFormat, headers, rows, totalRows, filename, usingDefaultConfig, tenantDefaultFormat, confidenceScore },
      });
    }

    if (effectiveFormat === "split_csv") {
      // Preview the lines (Positionen) CSV portion
      const headers = columnMappings.map((m) => m.target_column_name);
      const rows = previewItems.map((item) =>
        columnMappings.map((m) => getTransformedValue(item, m, decimalSeparator, orderData))
      );

      return NextResponse.json({
        success: true,
        data: { format: effectiveFormat, headers, rows, totalRows, filename, usingDefaultConfig, tenantDefaultFormat, confidenceScore, splitOutputMode },
      });
    }

    // For XML and JSON, generate full content then truncate for preview
    const { content: rawContent } = generateExportContent(
      orderData,
      effectiveFormat,
      columnMappings,
      { separator, quoteChar, lineEnding, decimalSeparator, xmlTemplate }
    );

    // Truncate for preview
    const lines = rawContent.split("\n");
    const previewContent = lines.slice(0, 80).join("\n") + (lines.length > 80 ? "\n..." : "");

    return NextResponse.json({
      success: true,
      data: {
        format: effectiveFormat,
        headers: [],
        rows: [],
        totalRows,
        filename,
        rawContent: previewContent,
        usingDefaultConfig,
        tenantDefaultFormat,
        confidenceScore,
        splitOutputMode,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Error in GET /api/orders/[orderId]/export/preview:", msg, error);
    return NextResponse.json(
      { success: false, error: `Interner Serverfehler: ${msg}` },
      { status: 500 }
    );
  }
}
