import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exportFormatSchema } from "@/lib/validations";
import type {
  AppMetadata,
  ExportFormat,
  ErpColumnMapping,
  CanonicalOrderData,
  CanonicalLineItem,
} from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 * Escapes a CSV field value according to the configured quote character.
 */
function escapeCsvField(value: string, separator: string, quoteChar: string): string {
  if (
    value.includes(separator) ||
    value.includes(quoteChar) ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    const escaped = value.replace(
      new RegExp(quoteChar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      quoteChar + quoteChar
    );
    return `${quoteChar}${escaped}${quoteChar}`;
  }
  return value;
}

/**
 * Generates a filename for the export.
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
 * Maps encoding name to content-type charset.
 */
function getCharset(encoding: string): string {
  switch (encoding.toUpperCase()) {
    case "ISO-8859-1":
      return "iso-8859-1";
    case "WINDOWS-1252":
      return "windows-1252";
    default:
      return "utf-8";
  }
}

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
 * GET /api/orders/[orderId]/export?format=csv
 *
 * Generates the export file, streams it as a download response,
 * updates order status to "exported", and logs the export.
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

    // 6. Get tenant info for filename
    const effectiveTenantId = order.tenant_id as string;
    const { data: tenant } = await adminClient
      .from("tenants")
      .select("slug")
      .eq("id", effectiveTenantId)
      .single();

    const tenantSlug = (tenant?.slug as string) ?? "export";

    // 7. Get ERP config
    const { data: erpConfig } = await adminClient
      .from("erp_configs")
      .select("*")
      .eq("tenant_id", effectiveTenantId)
      .eq("format", format)
      .limit(1)
      .maybeSingle();

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

    const separator = (erpConfig?.separator as string) ?? ";";
    const quoteChar = (erpConfig?.quote_char as string) ?? '"';
    const encoding = (erpConfig?.encoding as string) ?? "UTF-8";
    const filename = generateFilename(tenantSlug, orderData.order.order_number, format);
    const charset = getCharset(encoding);

    let content: string;
    let contentType: string;

    // 8. Generate file content
    if (format === "csv") {
      const headerLine = columnMappings
        .map((m) => escapeCsvField(m.target_column_name, separator, quoteChar))
        .join(separator);

      const dataLines = orderData.order.line_items.map((item) =>
        columnMappings
          .map((m) => escapeCsvField(getLineItemValue(item, m.source_field), separator, quoteChar))
          .join(separator)
      );

      content = [headerLine, ...dataLines].join("\r\n") + "\r\n";
      contentType = `text/csv; charset=${charset}`;
    } else if (format === "json") {
      content = JSON.stringify(orderData, null, 2);
      contentType = `application/json; charset=${charset}`;
    } else if (format === "xml") {
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<order>\n`;
      xml += `  <order_number>${escapeXml(orderData.order.order_number ?? "")}</order_number>\n`;
      xml += `  <order_date>${escapeXml(orderData.order.order_date ?? "")}</order_date>\n`;

      if (orderData.order.dealer.name) {
        xml += `  <dealer>${escapeXml(orderData.order.dealer.name)}</dealer>\n`;
      }

      if (orderData.order.delivery_address) {
        const addr = orderData.order.delivery_address;
        xml += "  <delivery_address>\n";
        xml += `    <company>${escapeXml(addr.company ?? "")}</company>\n`;
        xml += `    <street>${escapeXml(addr.street ?? "")}</street>\n`;
        xml += `    <city>${escapeXml(addr.city ?? "")}</city>\n`;
        xml += `    <postal_code>${escapeXml(addr.postal_code ?? "")}</postal_code>\n`;
        xml += `    <country>${escapeXml(addr.country ?? "")}</country>\n`;
        xml += "  </delivery_address>\n";
      }

      xml += "  <line_items>\n";
      for (const item of orderData.order.line_items) {
        xml += "    <item>\n";
        for (const mapping of columnMappings) {
          const value = getLineItemValue(item, mapping.source_field);
          xml += `      <${mapping.target_column_name}>${escapeXml(value)}</${mapping.target_column_name}>\n`;
        }
        xml += "    </item>\n";
      }
      xml += "  </line_items>\n";
      xml += `  <total_amount>${escapeXml(String(orderData.order.total_amount ?? ""))}</total_amount>\n`;
      xml += `  <currency>${escapeXml(orderData.order.currency ?? "")}</currency>\n`;
      if (orderData.order.notes) {
        xml += `  <notes>${escapeXml(orderData.order.notes)}</notes>\n`;
      }
      xml += "</order>\n";

      content = xml;
      contentType = `application/xml; charset=utf-8`;
    } else {
      return NextResponse.json(
        { success: false, error: "Unbekanntes Format." },
        { status: 400 }
      );
    }

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
      format,
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
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");

    return new NextResponse(content, { status: 200, headers });
  } catch (error) {
    console.error("Error in GET /api/orders/[orderId]/export:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
