/**
 * OPH-58: Split Multi-File ERP Export
 * Generates two CSV files (Auftragskopf + Positionen) and packages them in a ZIP.
 */
import JSZip from "jszip";
import { escapeCsvField } from "@/lib/export-utils";
import { getTransformedValue, isFixedValueMapping } from "@/lib/erp-transformations";
import type {
  CanonicalOrderData,
  ErpColumnMappingExtended,
} from "@/lib/types";

interface SplitCsvOptions {
  separator: string;
  quoteChar: string;
  lineEnding: string;
  decimalSeparator: string;
  emptyValuePlaceholder: string;
}

/**
 * Builds a single CSV row from column mappings, using the empty placeholder
 * for fields that resolve to an empty string.
 */
function buildCsvRow(
  mappings: ErpColumnMappingExtended[],
  resolveValue: (mapping: ErpColumnMappingExtended) => string,
  options: SplitCsvOptions
): string {
  return mappings
    .map((m) => {
      const raw = resolveValue(m);
      // OPH-60: Fixed-value columns always output their value as-is (even if empty)
      const value = isFixedValueMapping(m) ? raw : (raw === "" ? options.emptyValuePlaceholder : raw);
      return escapeCsvField(value, options.separator, options.quoteChar);
    })
    .join(options.separator);
}

/**
 * Generates the Auftragskopf CSV (1 header row + 1 data row).
 */
function generateHeaderCsv(
  orderData: CanonicalOrderData,
  headerMappings: ErpColumnMappingExtended[],
  options: SplitCsvOptions
): string {
  const eol = options.lineEnding === "CRLF" ? "\r\n" : "\n";

  // Column header row
  const headerLine = headerMappings
    .map((m) => escapeCsvField(m.target_column_name, options.separator, options.quoteChar))
    .join(options.separator);

  // Data row — use the first line item as a dummy to call getTransformedValue,
  // but header mappings should only use order-level fields.
  const dummyItem = orderData.order.line_items[0] ?? {
    position: 0,
    article_number: "",
    description: "",
    quantity: 0,
    unit: null,
    unit_price: null,
    total_price: null,
    currency: null,
    dealer_article_number: null,
  };

  const dataLine = buildCsvRow(
    headerMappings,
    (m) => getTransformedValue(dummyItem, m, options.decimalSeparator, orderData),
    options
  );

  return headerLine + eol + dataLine + eol;
}

/**
 * Generates the Positionen CSV (1 header row + N data rows, one per line item).
 */
function generateLinesCsv(
  orderData: CanonicalOrderData,
  linesMappings: ErpColumnMappingExtended[],
  options: SplitCsvOptions
): string {
  const eol = options.lineEnding === "CRLF" ? "\r\n" : "\n";

  // Column header row
  const headerLine = linesMappings
    .map((m) => escapeCsvField(m.target_column_name, options.separator, options.quoteChar))
    .join(options.separator);

  // Data rows
  const dataLines = orderData.order.line_items.map((item) =>
    buildCsvRow(
      linesMappings,
      (m) => getTransformedValue(item, m, options.decimalSeparator, orderData),
      options
    )
  );

  return [headerLine, ...dataLines].join(eol) + eol;
}

/**
 * Generates a timestamp string in the format YYYYMMDDHHMI (e.g. "202603250815").
 */
function getTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    String(now.getFullYear()) +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes())
  );
}

/** OPH-61: Filename configuration for split CSV export. */
export interface SplitCsvFilenameConfig {
  headerFilenameTemplate: string | null;
  linesFilenameTemplate: string | null;
  zipFilenameTemplate: string | null;
}

/** Characters not allowed in filenames. */
const UNSAFE_FILENAME_CHARS = /[/\\:*?"<>|]/g;

/**
 * OPH-61: Interpolates a filename template with order data variables.
 *
 * Supported variables:
 * - {order_number} — the extracted order number
 * - {timestamp} — current datetime in YYYYMMDDHHMI format
 * - {customer_number} — sender.customer_number
 * - {order_date} — order date in YYYYMMDD format
 *
 * Returns the fallback if template is empty/null.
 */
export function interpolateFilename(
  template: string | null | undefined,
  orderData: CanonicalOrderData,
  fallback: string
): string {
  const tpl = template?.trim();
  if (!tpl) return fallback;

  const timestamp = getTimestamp();
  const orderNumber = orderData.order.order_number ?? "";
  const customerNumber = orderData.order.sender?.customer_number ?? "";

  let orderDate = "";
  if (orderData.order.order_date) {
    // Try to format as YYYYMMDD
    const raw = orderData.order.order_date;
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      orderDate = String(parsed.getFullYear()) + pad(parsed.getMonth() + 1) + pad(parsed.getDate());
    }
  }

  const result = tpl
    .replace(/\{order_number\}/g, orderNumber)
    .replace(/\{timestamp\}/g, timestamp)
    .replace(/\{customer_number\}/g, customerNumber)
    .replace(/\{order_date\}/g, orderDate);

  // Strip filesystem-unsafe characters
  return result.replace(UNSAFE_FILENAME_CHARS, "");
}

/**
 * Generates a ZIP archive containing both Auftragskopf and Positionen CSV files.
 *
 * OPH-61: Now accepts optional filename configuration for custom naming.
 *
 * @returns Buffer of the ZIP file and suggested filename.
 */
export async function generateSplitCsvZip(
  orderData: CanonicalOrderData,
  headerMappings: ErpColumnMappingExtended[],
  linesMappings: ErpColumnMappingExtended[],
  options: SplitCsvOptions,
  filenameConfig?: SplitCsvFilenameConfig
): Promise<{ buffer: Buffer; filename: string }> {
  const timestamp = getTimestamp();

  const headerCsv = generateHeaderCsv(orderData, headerMappings, options);
  const linesCsv = generateLinesCsv(orderData, linesMappings, options);

  const defaultHeaderName = `Auftragskopf_${timestamp}`;
  const defaultLinesName = `Positionen_${timestamp}`;
  const orderNumber = (orderData.order.order_number ?? "export").replace(/[^a-z0-9-]/gi, "_");
  const defaultZipName = `Export_${orderNumber}_${timestamp}`;

  const headerFilename = interpolateFilename(filenameConfig?.headerFilenameTemplate, orderData, defaultHeaderName);
  const linesFilename = interpolateFilename(filenameConfig?.linesFilenameTemplate, orderData, defaultLinesName);
  const zipFilename = interpolateFilename(filenameConfig?.zipFilenameTemplate, orderData, defaultZipName);

  const zip = new JSZip();
  zip.file(`${headerFilename}.csv`, headerCsv);
  zip.file(`${linesFilename}.csv`, linesCsv);

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return { buffer: Buffer.from(buffer), filename: `${zipFilename}.zip` };
}

/**
 * OPH-61: Generates two separate CSV files (not zipped) for "separate" output mode.
 *
 * @returns Two CSV file objects with content and filename.
 */
export function generateSplitCsvSeparate(
  orderData: CanonicalOrderData,
  headerMappings: ErpColumnMappingExtended[],
  linesMappings: ErpColumnMappingExtended[],
  options: SplitCsvOptions,
  filenameConfig?: SplitCsvFilenameConfig
): { headerFile: { content: string; filename: string }; linesFile: { content: string; filename: string } } {
  const timestamp = getTimestamp();

  const headerCsv = generateHeaderCsv(orderData, headerMappings, options);
  const linesCsv = generateLinesCsv(orderData, linesMappings, options);

  const defaultHeaderName = `Auftragskopf_${timestamp}`;
  const defaultLinesName = `Positionen_${timestamp}`;

  const headerFilename = interpolateFilename(filenameConfig?.headerFilenameTemplate, orderData, defaultHeaderName);
  const linesFilename = interpolateFilename(filenameConfig?.linesFilenameTemplate, orderData, defaultLinesName);

  return {
    headerFile: { content: headerCsv, filename: `${headerFilename}.csv` },
    linesFile: { content: linesCsv, filename: `${linesFilename}.csv` },
  };
}
