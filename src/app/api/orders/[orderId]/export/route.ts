import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exportFormatSchema } from "@/lib/validations";
import {
  getLineItemValue,
  escapeCsvField,
  generateFilename,
  escapeXml,
  contentDisposition,
  MAX_LINE_ITEMS,
} from "@/lib/export-utils";
import type {
  AppMetadata,
  ExportFormat,
  ErpColumnMapping,
  CanonicalOrderData,
} from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Default column mappings used when no tenant ERP config exists.
 */
const DEFAULT_COLUMN_MAPPINGS: ErpColumnMapping[] = [
  { source_field: "position", target_column_name: "Pos" },
  { source_field: "article_number", target_column_name: "Artikelnummer" },
  { source_field: "description", target_column_name: "Beschreibung" },
  { source_field: "quantity", target_column_name: "Menge" },
  { source_field: "unit", target_column_name: "Einheit" },
  { source_field: "unit_price", target_column_name: "Einzelpreis" },
  { source_field: "total_price", target_column_name: "Gesamtpreis" },
  { source_field: "currency", target_column_name: "Waehrung" },
];

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

    // 5a. BUG-011: Check line item count to prevent transformation timeout
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

    // 7. Get ERP config
    const { data: erpConfig } = await adminClient
      .from("erp_configs")
      .select("*")
      .eq("tenant_id", effectiveTenantId)
      .eq("format", format)
      .limit(1)
      .maybeSingle();

    // BUG-007: Track whether we're using default config
    const usingDefaultConfig = !erpConfig;

    const columnMappings: ErpColumnMapping[] = erpConfig
      ? (erpConfig.column_mappings as ErpColumnMapping[])
      : DEFAULT_COLUMN_MAPPINGS;

    const separator = (erpConfig?.separator as string) ?? ";";
    const quoteChar = (erpConfig?.quote_char as string) ?? '"';

    // BUG-008: Validate required fields before export
    const requiredMappings = columnMappings.filter((m) => m.required);
    if (requiredMappings.length > 0) {
      const missingFields: string[] = [];
      for (const mapping of requiredMappings) {
        for (const item of orderData.order.line_items) {
          const value = getLineItemValue(item, mapping.source_field);
          if (!value) {
            missingFields.push(
              `Pos. ${item.position}: "${mapping.target_column_name}" ist leer`
            );
          }
        }
      }
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
    }

    const filename = generateFilename(tenantSlug, orderData.order.order_number, format);

    let content: string;
    let contentType: string;

    // 8. Generate file content
    // BUG-004: Always use UTF-8 encoding (Next.js outputs UTF-8 natively)
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
      contentType = "text/csv; charset=utf-8";
    } else if (format === "json") {
      content = JSON.stringify(orderData, null, 2);
      contentType = "application/json; charset=utf-8";
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
      contentType = "application/xml; charset=utf-8";
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
    // BUG-012: RFC 5987 filename encoding for browser compatibility
    headers.set("Content-Disposition", contentDisposition(filename));
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    // BUG-007: Inform caller if default config was used
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
