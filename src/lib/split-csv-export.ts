/**
 * OPH-58: Split Multi-File ERP Export
 * Generates two CSV files (Auftragskopf + Positionen) and packages them in a ZIP.
 */
import JSZip from "jszip";
import { escapeCsvField } from "@/lib/export-utils";
import { getTransformedValue } from "@/lib/erp-transformations";
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
      const value = raw === "" ? options.emptyValuePlaceholder : raw;
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

/**
 * Generates a ZIP archive containing both Auftragskopf and Positionen CSV files.
 *
 * @returns Buffer of the ZIP file and suggested filename.
 */
export async function generateSplitCsvZip(
  orderData: CanonicalOrderData,
  headerMappings: ErpColumnMappingExtended[],
  linesMappings: ErpColumnMappingExtended[],
  options: SplitCsvOptions
): Promise<{ buffer: Buffer; filename: string }> {
  const timestamp = getTimestamp();

  const headerCsv = generateHeaderCsv(orderData, headerMappings, options);
  const linesCsv = generateLinesCsv(orderData, linesMappings, options);

  const zip = new JSZip();
  zip.file(`Auftragskopf_${timestamp}.csv`, headerCsv);
  zip.file(`Positionen_${timestamp}.csv`, linesCsv);

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const orderNumber = (orderData.order.order_number ?? "export").replace(/[^a-z0-9-]/gi, "_");
  const filename = `Export_${orderNumber}_${timestamp}.zip`;

  return { buffer: Buffer.from(buffer), filename };
}
