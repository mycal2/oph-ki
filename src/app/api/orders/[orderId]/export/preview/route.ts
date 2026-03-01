import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exportFormatSchema } from "@/lib/validations";
import type {
  AppMetadata,
  ApiResponse,
  ExportPreviewResponse,
  ExportFormat,
  ErpColumnMapping,
  CanonicalOrderData,
  CanonicalLineItem,
} from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PREVIEW_ROWS = 10;

/**
 * Escapes XML special characters in a string.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Extracts a value from a line item by source field name.
 */
function getLineItemValue(item: CanonicalLineItem, field: string): string {
  switch (field) {
    case "position":
      return String(item.position);
    case "article_number":
      return item.article_number ?? "";
    case "description":
      return item.description;
    case "quantity":
      return String(item.quantity);
    case "unit":
      return item.unit ?? "";
    case "unit_price":
      return item.unit_price !== null ? String(item.unit_price) : "";
    case "total_price":
      return item.total_price !== null ? String(item.total_price) : "";
    case "currency":
      return item.currency ?? "";
    default:
      return "";
  }
}

/**
 * Generates a filename for the export.
 * Pattern: {tenant_slug}_{order_number}_{date}.{format}
 */
function generateFilename(
  tenantSlug: string,
  orderNumber: string | null,
  format: ExportFormat
): string {
  const slug = tenantSlug.replace(/[^a-z0-9-]/gi, "_");
  const number = (orderNumber ?? "unbekannt").replace(/[^a-z0-9-]/gi, "_");
  const date = new Date().toISOString().slice(0, 10);
  return `${slug}_${number}_${date}.${format}`;
}

/**
 * GET /api/orders/[orderId]/export/preview?format=csv
 *
 * Returns a preview of the export data (first 10 rows) as JSON.
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

    // 5. Get order data (reviewed_data first, fallback to extracted_data)
    const orderData = (order.reviewed_data ?? order.extracted_data) as CanonicalOrderData | null;

    if (!orderData) {
      return NextResponse.json(
        { success: false, error: "Keine Bestelldaten vorhanden." },
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

    // 7. Get ERP config for the tenant
    const { data: erpConfig } = await adminClient
      .from("erp_configs")
      .select("*")
      .eq("tenant_id", effectiveTenantId)
      .eq("format", format)
      .limit(1)
      .maybeSingle();

    // If no config, use a default mapping
    const columnMappings: ErpColumnMapping[] = erpConfig
      ? (erpConfig.column_mappings as ErpColumnMapping[])
      : [
          { source_field: "position", target_column_name: "Pos" },
          { source_field: "article_number", target_column_name: "Artikelnummer" },
          { source_field: "description", target_column_name: "Beschreibung" },
          { source_field: "quantity", target_column_name: "Menge" },
          { source_field: "unit", target_column_name: "Einheit" },
          { source_field: "unit_price", target_column_name: "Einzelpreis" },
          { source_field: "total_price", target_column_name: "Gesamtpreis" },
          { source_field: "currency", target_column_name: "Waehrung" },
        ];

    const filename = generateFilename(tenantSlug, orderData.order.order_number, format);
    const lineItems = orderData.order.line_items;
    const totalRows = lineItems.length;
    const previewItems = lineItems.slice(0, MAX_PREVIEW_ROWS);

    if (format === "csv") {
      const headers = columnMappings.map((m) => m.target_column_name);
      const rows = previewItems.map((item) =>
        columnMappings.map((m) => getLineItemValue(item, m.source_field))
      );

      return NextResponse.json({
        success: true,
        data: { format, headers, rows, totalRows, filename },
      });
    }

    if (format === "json") {
      const jsonContent = JSON.stringify(orderData, null, 2);
      // Show first ~50 lines for preview
      const lines = jsonContent.split("\n");
      const previewContent = lines.slice(0, 50).join("\n") + (lines.length > 50 ? "\n..." : "");

      return NextResponse.json({
        success: true,
        data: {
          format,
          headers: [],
          rows: [],
          totalRows,
          filename,
          rawContent: previewContent,
        },
      });
    }

    if (format === "xml") {
      // Generate a simple XML preview with proper escaping
      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<order>\n';
      xml += `  <order_number>${escapeXml(orderData.order.order_number ?? "")}</order_number>\n`;
      xml += `  <order_date>${escapeXml(orderData.order.order_date ?? "")}</order_date>\n`;
      xml += "  <line_items>\n";
      for (const item of previewItems) {
        xml += "    <item>\n";
        for (const mapping of columnMappings) {
          const value = getLineItemValue(item, mapping.source_field);
          xml += `      <${mapping.target_column_name}>${escapeXml(value)}</${mapping.target_column_name}>\n`;
        }
        xml += "    </item>\n";
      }
      if (totalRows > MAX_PREVIEW_ROWS) {
        xml += `    <!-- ... ${totalRows - MAX_PREVIEW_ROWS} weitere Positionen -->\n`;
      }
      xml += "  </line_items>\n";
      xml += `  <total_amount>${escapeXml(String(orderData.order.total_amount ?? ""))}</total_amount>\n`;
      xml += `  <currency>${escapeXml(orderData.order.currency ?? "")}</currency>\n`;
      xml += "</order>";

      return NextResponse.json({
        success: true,
        data: {
          format,
          headers: [],
          rows: [],
          totalRows,
          filename,
          rawContent: xml,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: "Unbekanntes Format." },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error in GET /api/orders/[orderId]/export/preview:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
