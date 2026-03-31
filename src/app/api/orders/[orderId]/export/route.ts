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
import { generateSplitCsvZip, generateSplitCsvSeparate } from "@/lib/split-csv-export";
import type { SplitCsvFilenameConfig } from "@/lib/split-csv-export";
import { sendPlatformErrorNotification } from "@/lib/postmark";
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
        { success: false, error: "Ungültige Bestellungs-ID." },
        { status: 400 }
      );
    }

    const formatResult = exportFormatSchema.safeParse(rawFormat);
    if (!formatResult.success) {
      return NextResponse.json(
        { success: false, error: "Ungültiges Format. Erlaubt: csv, xml, json, split_csv" },
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

    // OPH-16: Trial tenants cannot export to ERP
    if (appMetadata?.tenant_status === "trial") {
      return NextResponse.json(
        { success: false, error: "ERP-Export ist während der Testphase nicht verfügbar." },
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
    const fallbackMode = (erpConfig?.fallback_mode as string) ?? "block";

    // OPH-9 AC-3: Enforce fallback mode
    if (usingDefaultConfig && fallbackMode === "block") {
      return NextResponse.json(
        {
          success: false,
          error: "Kein ERP-Mapping konfiguriert für diesen Mandanten.",
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
    const emptyValuePlaceholder = (erpConfig?.empty_value_placeholder as string) ?? "";

    // OPH-9 AC-8: Validate required fields before export
    const missingFields = validateRequiredFields(orderData.order.line_items, columnMappings, orderData);
    if (missingFields.length > 0) {
      const fieldList = missingFields.slice(0, 10).join(", ");
      const more = missingFields.length > 10 ? ` (und ${missingFields.length - 10} weitere)` : "";
      return NextResponse.json(
        {
          success: false,
          error: `Pflichtfelder fehlen: ${fieldList}${more}. Bitte in der Bestellprüfung korrigieren.`,
        },
        { status: 400 }
      );
    }

    // OPH-58: Split CSV generates a ZIP with two CSV files
    if (effectiveFormat === "split_csv") {
      const headerMappings = (erpConfig?.header_column_mappings as ErpColumnMappingExtended[]) ?? [];

      if (headerMappings.length === 0) {
        return NextResponse.json(
          { success: false, error: "Keine Auftragskopf-Spalten konfiguriert für Split-CSV-Export." },
          { status: 400 }
        );
      }

      // Validate required fields in header mappings too
      const headerMissing = validateRequiredFields(orderData.order.line_items, headerMappings, orderData);
      if (headerMissing.length > 0) {
        const fieldList = headerMissing.slice(0, 10).join(", ");
        return NextResponse.json(
          { success: false, error: `Pflichtfelder im Auftragskopf fehlen: ${fieldList}.` },
          { status: 400 }
        );
      }

      // OPH-61: Build filename configuration from ERP config
      const filenameConfig: SplitCsvFilenameConfig = {
        headerFilenameTemplate: (erpConfig?.header_filename_template as string) ?? null,
        linesFilenameTemplate: (erpConfig?.lines_filename_template as string) ?? null,
        zipFilenameTemplate: (erpConfig?.zip_filename_template as string) ?? null,
      };

      const splitOutputMode = (erpConfig?.split_output_mode as string) ?? "zip";
      const splitCsvOptions = { separator, quoteChar, lineEnding, decimalSeparator, emptyValuePlaceholder };

      // OPH-61: Handle "separate" mode — return the requested file (header or lines)
      if (splitOutputMode === "separate") {
        const fileType = request.nextUrl.searchParams.get("file") ?? "header";
        const { headerFile, linesFile } = generateSplitCsvSeparate(
          orderData, headerMappings, columnMappings, splitCsvOptions, filenameConfig
        );

        const file = fileType === "lines" ? linesFile : headerFile;

        // Update order status + log on first file download (header)
        if (fileType !== "lines") {
          const now = new Date().toISOString();
          await adminClient.from("orders").update({ status: "exported", last_exported_at: now }).eq("id", orderId);
          await adminClient.from("export_logs").insert({
            order_id: orderId, tenant_id: effectiveTenantId, user_id: user.id,
            format: "split_csv", filename: `${headerFile.filename} + ${linesFile.filename}`, exported_at: now,
          });
          if (order.status !== "exported") {
            await adminClient.from("order_edits").insert({
              order_id: orderId, tenant_id: effectiveTenantId, user_id: user.id,
              field_path: "status", old_value: JSON.stringify(order.status), new_value: JSON.stringify("exported"),
            });
          }
        }

        const headers = new Headers();
        headers.set("Content-Type", "text/csv; charset=utf-8");
        headers.set("Content-Disposition", contentDisposition(file.filename));
        headers.set("Cache-Control", "no-store");
        headers.set("X-Content-Type-Options", "nosniff");

        return new NextResponse(file.content, { status: 200, headers });
      }

      // Default: ZIP mode
      const { buffer, filename: zipFilename } = await generateSplitCsvZip(
        orderData, headerMappings, columnMappings, splitCsvOptions, filenameConfig
      );

      // Update order status + log (same as single-file path)
      const now = new Date().toISOString();
      await adminClient.from("orders").update({ status: "exported", last_exported_at: now }).eq("id", orderId);
      await adminClient.from("export_logs").insert({
        order_id: orderId, tenant_id: effectiveTenantId, user_id: user.id,
        format: "split_csv", filename: zipFilename, exported_at: now,
      });
      if (order.status !== "exported") {
        await adminClient.from("order_edits").insert({
          order_id: orderId, tenant_id: effectiveTenantId, user_id: user.id,
          field_path: "status", old_value: JSON.stringify(order.status), new_value: JSON.stringify("exported"),
        });
      }

      const headers = new Headers();
      headers.set("Content-Type", "application/zip");
      headers.set("Content-Disposition", contentDisposition(zipFilename));
      headers.set("Cache-Control", "no-store");
      headers.set("X-Content-Type-Options", "nosniff");

      return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
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

    // --- OPH-24: Send platform admin error notification ---
    const platformApiToken = process.env.POSTMARK_SERVER_API_TOKEN;
    if (platformApiToken) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
      const errorMsg = error instanceof Error ? error.message : "Unbekannter Export-Fehler.";

      try {
        const notifyAdminClient = createAdminClient();

        // Try to resolve tenant info from the orderId in the URL
        const { orderId: errorOrderId } = await params;
        let errorTenantName: string | null = null;
        let errorTenantSlug: string | null = null;

        if (UUID_REGEX.test(errorOrderId)) {
          const { data: errorOrder } = await notifyAdminClient
            .from("orders")
            .select("tenant_id")
            .eq("id", errorOrderId)
            .single();

          if (errorOrder?.tenant_id) {
            const { data: errorTenant } = await notifyAdminClient
              .from("tenants")
              .select("name, slug")
              .eq("id", errorOrder.tenant_id as string)
              .single();

            errorTenantName = (errorTenant?.name as string) ?? null;
            errorTenantSlug = (errorTenant?.slug as string) ?? null;
          }
        }

        await sendPlatformErrorNotification({
          serverApiToken: platformApiToken,
          adminClient: notifyAdminClient,
          errorType: "ERP-Export fehlgeschlagen",
          tenantName: errorTenantName,
          tenantSlug: errorTenantSlug,
          orderId: UUID_REGEX.test(errorOrderId) ? errorOrderId : null,
          errorMessage: errorMsg,
          siteUrl,
        });
      } catch (notifyErr) {
        console.error("Failed to send platform error notification:", notifyErr);
      }
    }

    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
