import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import { erpConfigTestSchema } from "@/lib/validations";
import {
  generateExportContent,
  validateRequiredFields,
} from "@/lib/erp-transformations";
import type {
  CanonicalOrderData,
  ErpColumnMappingExtended,
  ErpConfigTestResult,
} from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/erp-configs/[tenantId]/test
 *
 * Tests an ERP config against sample data or an existing order.
 * Returns the generated export content and any warnings.
 * Platform admin only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
): Promise<NextResponse> {
  try {
    const { tenantId } = await params;
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    if (!UUID_REGEX.test(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Mandanten-ID." },
        { status: 400 }
      );
    }

    // Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Ungueltiges JSON im Anfrage-Body." },
        { status: 400 }
      );
    }

    const parsed = erpConfigTestSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungueltige Eingabe.";
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
        // Accept both { order: {...}, extraction_metadata: {...} } and bare { order: {...} }
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
          { success: false, error: "Ungueltiges JSON." },
          { status: 400 }
        );
      }
    } else {
      // mode === "order" — fetch from database
      const { data: order, error: orderError } = await adminClient
        .from("orders")
        .select("id, tenant_id, reviewed_data, extracted_data")
        .eq("id", orderId!)
        .eq("tenant_id", tenantId)
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
    const requiredErrors = validateRequiredFields(orderData.order.line_items, mappings);
    if (requiredErrors.length > 0) {
      warnings.push(...requiredErrors.map((e) => `Pflichtfeld: ${e}`));
    }

    // Check for unknown source fields (normalize items[]. prefix first)
    const knownFields = new Set([
      "position", "article_number", "description", "quantity",
      "unit", "unit_price", "total_price", "currency",
      "discount", "notes", "delivery_date", "ean", "supplier_sku",
    ]);
    for (const m of mappings) {
      const normalized = m.source_field.replace(/^items\[\]\./, "");
      if (!knownFields.has(normalized)) {
        warnings.push(`Unbekanntes Quellfeld: "${m.source_field}"`);
      }
    }

    // Generate export content
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

    warnings.push(...genWarnings);

    const result: ErpConfigTestResult = {
      output: content,
      warnings,
      format: config.format,
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error in POST /api/admin/erp-configs/[tenantId]/test:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
