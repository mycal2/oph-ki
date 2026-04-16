import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import { erpConfigTestSchema } from "@/lib/validations";
import {
  generateExportContent,
  validateRequiredFields,
  isFixedValueMapping,
} from "@/lib/erp-transformations";
import { generateSplitCsvZip, interpolateFilename } from "@/lib/split-csv-export";
import type {
  CanonicalOrderData,
  ErpColumnMappingExtended,
  ErpConfigTestResult,
} from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/erp-configs/[configId]/test
 *
 * OPH-29: Tests an ERP config against sample data or an existing order.
 * Orders can come from any tenant assigned to this config.
 * Platform admin only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ configId: string }> }
): Promise<NextResponse> {
  try {
    const { configId } = await params;
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    if (!UUID_REGEX.test(configId)) {
      return NextResponse.json(
        { success: false, error: "Ungültige Konfigurations-ID." },
        { status: 400 }
      );
    }

    // Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Ungültiges JSON im Anfrage-Body." },
        { status: 400 }
      );
    }

    const parsed = erpConfigTestSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { mode, jsonInput, orderId, config } = parsed.data;

    // Get order data
    let orderData: CanonicalOrderData;

    if (mode === "json") {
      try {
        const raw = JSON.parse(jsonInput!);
        if (raw.order) {
          orderData = raw as CanonicalOrderData;
        } else {
          return NextResponse.json(
            { success: false, error: "JSON muss ein 'order'-Objekt enthalten." },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json(
          { success: false, error: "Ungültiges JSON." },
          { status: 400 }
        );
      }
    } else {
      // mode === "order" — fetch from database (no tenant restriction, admin-only)
      const { data: order, error: orderError } = await adminClient
        .from("orders")
        .select("id, tenant_id, reviewed_data, extracted_data")
        .eq("id", orderId!)
        .single();

      if (orderError || !order) {
        return NextResponse.json(
          { success: false, error: "Bestellung nicht gefunden." },
          { status: 404 }
        );
      }

      const raw = (order.reviewed_data ?? order.extracted_data) as CanonicalOrderData | null;
      if (!raw) {
        return NextResponse.json(
          { success: false, error: "Keine Bestelldaten vorhanden." },
          { status: 400 }
        );
      }

      orderData = raw;
    }

    // Ensure line_items array exists
    if (!orderData.order?.line_items) {
      orderData = {
        ...orderData,
        order: { ...orderData.order, line_items: [] },
      };
    }

    const mappings = (config.column_mappings ?? []) as ErpColumnMappingExtended[];
    const warnings: string[] = [];

    // Validate required fields
    const requiredErrors = validateRequiredFields(orderData.order.line_items, mappings, orderData);
    if (requiredErrors.length > 0) {
      warnings.push(...requiredErrors.map((e) => `Pflichtfeld: ${e}`));
    }

    // Check for unknown source fields
    const knownItemFields = new Set([
      "position", "article_number", "dealer_article_number", "description", "quantity",
      "unit", "unit_price", "total_price", "currency",
      "discount", "notes", "delivery_date", "ean", "supplier_sku",
    ]);
    const knownOrderFields = new Set([
      "order.order_number", "order.order_date", "order.currency",
      "order.total_amount", "order.notes", "order.email_subject",
      "order.dealer.name", "order.dealer.id",
      "order.sender.company_name", "order.sender.customer_number",
      "order.sender.email", "order.sender.phone",
      "order.sender.street", "order.sender.city",
      "order.sender.postal_code", "order.sender.country",
      "order.delivery_address.company", "order.delivery_address.street",
      "order.delivery_address.city", "order.delivery_address.postal_code",
      "order.delivery_address.country",
      "order.billing_address.company", "order.billing_address.street",
      "order.billing_address.city", "order.billing_address.postal_code",
      "order.billing_address.country",
    ]);
    for (const m of mappings) {
      // OPH-60: Skip fixed-value columns — they don't use source_field
      if (isFixedValueMapping(m)) continue;

      if (m.source_field.startsWith("order.")) {
        if (!knownOrderFields.has(m.source_field)) {
          warnings.push(`Unbekanntes Quellfeld: "${m.source_field}"`);
        }
      } else {
        const normalized = m.source_field.replace(/^items\[\]\./, "");
        if (!knownItemFields.has(normalized)) {
          warnings.push(`Unbekanntes Quellfeld: "${m.source_field}"`);
        }
      }
    }

    // Generate export content
    let output: string;

    if (config.format === "split_csv") {
      // OPH-58: Split CSV test — generate both CSVs and show as combined text
      const headerMappings = (config.header_column_mappings ?? []) as ErpColumnMappingExtended[];
      const filenameConfig = {
        headerFilenameTemplate: config.header_filename_template ?? null,
        linesFilenameTemplate: config.lines_filename_template ?? null,
        zipFilenameTemplate: config.zip_filename_template ?? null,
      };
      const { buffer } = await generateSplitCsvZip(
        orderData,
        headerMappings,
        mappings,
        {
          separator: config.separator,
          quoteChar: config.quote_char,
          lineEnding: config.line_ending,
          decimalSeparator: config.decimal_separator,
          emptyValuePlaceholder: config.empty_value_placeholder ?? "",
        },
        filenameConfig
      );
      // OPH-61: Show configured filenames in test output
      const outputMode = config.split_output_mode ?? "zip";
      const headerFn = interpolateFilename(config.header_filename_template, orderData, "Auftragskopf_{timestamp}");
      const linesFn = interpolateFilename(config.lines_filename_template, orderData, "Positionen_{timestamp}");
      const zipFn = interpolateFilename(config.zip_filename_template, orderData, "Export_{order_number}_{timestamp}");

      let fileInfo = `Auftragskopf: ${headerFn}.csv (${headerMappings.length} Spalten)\n`;
      fileInfo += `Positionen: ${linesFn}.csv (${mappings.length} Spalten, ${orderData.order.line_items.length} Zeilen)`;
      if (outputMode === "zip") {
        output = `[ZIP: ${zipFn}.zip - ${buffer.byteLength} Bytes]\n\n${fileInfo}`;
      } else {
        output = `[Zwei CSV-Dateien]\n\n${fileInfo}`;
      }
    } else {
      const { content, warnings: genWarnings } = generateExportContent(
        orderData,
        config.format,
        mappings,
        {
          separator: config.separator,
          quoteChar: config.quote_char,
          lineEnding: config.line_ending,
          decimalSeparator: config.decimal_separator,
          xmlTemplate: config.xml_template,
        }
      );
      output = content;
      warnings.push(...genWarnings);
    }

    const result: ErpConfigTestResult = {
      output,
      warnings,
      format: config.format,
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error in POST /api/admin/erp-configs/[configId]/test:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
