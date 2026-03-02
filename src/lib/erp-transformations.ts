/**
 * OPH-9: ERP transformation engine.
 *
 * Applies transformation pipelines to field values during export.
 * Also provides Handlebars-based XML template rendering.
 */

import Handlebars from "handlebars";
import { format as formatDate, parseISO } from "date-fns";
import type {
  ErpTransformationStep,
  ErpColumnMappingExtended,
  CanonicalLineItem,
  CanonicalOrderData,
  ExportFormat,
} from "@/lib/types";
import {
  escapeCsvField,
  escapeXml,
  getLineItemValue,
  getOrderFieldValue,
} from "@/lib/export-utils";

// Register Handlebars helpers once at module level (BUG-006 fix)
Handlebars.registerHelper("escapeXml", (val: unknown) =>
  new Handlebars.SafeString(escapeXml(String(val ?? "")))
);

/**
 * Applies a single transformation step to a string value.
 */
export function applyTransformation(value: string, step: ErpTransformationStep): string {
  switch (step.type) {
    case "to_uppercase":
      return value.toUpperCase();

    case "to_lowercase":
      return value.toLowerCase();

    case "trim":
      return value.trim();

    case "round": {
      const n = parseInt(step.param ?? "0", 10);
      const num = parseFloat(value);
      if (isNaN(num)) return value;
      return num.toFixed(isNaN(n) ? 0 : n);
    }

    case "multiply": {
      const factor = parseFloat(step.param ?? "1");
      const base = parseFloat(value);
      if (isNaN(factor) || isNaN(base)) return value;
      return String(base * factor);
    }

    case "date_format": {
      const pattern = step.param ?? "yyyy-MM-dd";
      if (!value) return value;
      try {
        const date = parseISO(value);
        return formatDate(date, pattern);
      } catch {
        return value;
      }
    }

    case "default": {
      if (!value || value.trim() === "") {
        return step.param ?? "";
      }
      return value;
    }

    default:
      return value;
  }
}

/**
 * Applies an ordered pipeline of transformations to a value.
 */
export function applyTransformations(value: string, steps: ErpTransformationStep[]): string {
  let result = value;
  for (const step of steps) {
    result = applyTransformation(result, step);
  }
  return result;
}

/**
 * Applies decimal separator formatting to a numeric string value.
 * If decimalSeparator is ",", replaces "." with ",".
 */
function formatDecimal(value: string, decimalSeparator: string): string {
  if (decimalSeparator === ",") {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      return value.replace(".", ",");
    }
  }
  return value;
}

/**
 * Checks whether a source field is an order-level field (e.g. "order.order_number").
 */
function isOrderField(field: string): boolean {
  return field.startsWith("order.");
}

/**
 * Normalizes a source field path by stripping the items[] prefix.
 * e.g. "items[].article_number" → "article_number"
 * Order-level fields (e.g. "order.order_number") are left as-is.
 */
function normalizeSourceField(field: string): string {
  if (isOrderField(field)) return field;
  return field.replace(/^items\[\]\./, "");
}

/**
 * Normalizes a column mapping to ensure backward compatibility.
 * Old OPH-6 mappings may lack `transformations` and `required` fields.
 */
export function normalizeMapping(mapping: ErpColumnMappingExtended): ErpColumnMappingExtended {
  return {
    ...mapping,
    source_field: normalizeSourceField(mapping.source_field),
    transformations: mapping.transformations ?? [],
    required: mapping.required ?? false,
  };
}

/**
 * Gets a transformed value for a mapping, applying column-level transformations
 * and decimal separator formatting.
 *
 * Resolves both line-item fields (e.g. "article_number", "items[].quantity")
 * and order-level fields (e.g. "order.order_number", "order.dealer.name").
 */
export function getTransformedValue(
  item: CanonicalLineItem,
  mapping: ErpColumnMappingExtended,
  decimalSeparator: string,
  orderData?: CanonicalOrderData
): string {
  const normalized = normalizeMapping(mapping);
  let value: string;

  if (isOrderField(normalized.source_field) && orderData) {
    // Strip "order." prefix and resolve from order data
    const orderPath = normalized.source_field.replace(/^order\./, "");
    value = getOrderFieldValue(orderData.order, orderPath);
  } else if (isOrderField(normalized.source_field)) {
    // Order field requested but no orderData provided — return empty
    value = "";
  } else {
    value = getLineItemValue(item, normalized.source_field);
  }

  // Apply transformations pipeline
  if (normalized.transformations.length > 0) {
    value = applyTransformations(value, normalized.transformations);
  }

  // Apply decimal separator for numeric fields
  const numericFields = ["quantity", "unit_price", "total_price", "total_amount"];
  if (numericFields.includes(normalized.source_field.replace(/^order\./, ""))) {
    value = formatDecimal(value, decimalSeparator);
  }

  return value;
}

/**
 * Generates CSV content using the extended column mappings with transformations.
 */
export function generateCsvContent(
  orderData: CanonicalOrderData,
  mappings: ErpColumnMappingExtended[],
  separator: string,
  quoteChar: string,
  lineEnding: string,
  decimalSeparator: string
): string {
  const eol = lineEnding === "CRLF" ? "\r\n" : "\n";

  // Header row
  const headerLine = mappings
    .map((m) => escapeCsvField(m.target_column_name, separator, quoteChar))
    .join(separator);

  // Data rows
  const dataLines = orderData.order.line_items.map((item) =>
    mappings
      .map((m) =>
        escapeCsvField(getTransformedValue(item, m, decimalSeparator, orderData), separator, quoteChar)
      )
      .join(separator)
  );

  return [headerLine, ...dataLines].join(eol) + eol;
}

/**
 * Generates XML content using a Handlebars template.
 * If no template is provided, falls back to the default XML structure.
 */
export function generateXmlContent(
  orderData: CanonicalOrderData,
  xmlTemplate: string | null,
  mappings: ErpColumnMappingExtended[],
  decimalSeparator: string
): { content: string; warnings: string[] } {
  const warnings: string[] = [];

  if (xmlTemplate) {
    // Handlebars-based XML rendering
    try {
      const template = Handlebars.compile(xmlTemplate, { strict: false });

      const context = {
        order: orderData.order,
        extraction_metadata: orderData.extraction_metadata,
      };

      return { content: template(context), warnings };
    } catch (err) {
      warnings.push(
        `Handlebars-Fehler: ${err instanceof Error ? err.message : String(err)}`
      );
      // Fall through to default XML
    }
  }

  // Default XML structure (same as OPH-6 but with transformations)
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
    for (const mapping of mappings) {
      const value = getTransformedValue(item, mapping, decimalSeparator, orderData);
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

  return { content: xml, warnings };
}

/**
 * Validates required fields across all line items (and order-level fields).
 * Returns an array of human-readable error messages.
 */
export function validateRequiredFields(
  lineItems: CanonicalLineItem[],
  mappings: ErpColumnMappingExtended[],
  orderData?: CanonicalOrderData
): string[] {
  const requiredMappings = mappings.filter((m) => (m.required ?? false));
  if (requiredMappings.length === 0) return [];

  const errors: string[] = [];
  for (const mapping of requiredMappings) {
    const normalized = normalizeMapping(mapping);

    if (isOrderField(normalized.source_field) && orderData) {
      const orderPath = normalized.source_field.replace(/^order\./, "");
      const value = getOrderFieldValue(orderData.order, orderPath);
      if (!value || value.trim() === "") {
        errors.push(`"${mapping.target_column_name}" ist leer`);
      }
    } else if (!isOrderField(normalized.source_field)) {
      for (const item of lineItems) {
        const value = getLineItemValue(item, normalized.source_field);
        if (!value || value.trim() === "") {
          errors.push(
            `Pos. ${item.position}: "${mapping.target_column_name}" ist leer`
          );
        }
      }
    }
  }
  return errors;
}

/**
 * Validates a Handlebars template by attempting to compile it.
 * Returns null on success, or an error message on failure.
 */
export function validateHandlebarsTemplate(template: string): string | null {
  try {
    Handlebars.compile(template, { strict: false });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * Generates export content for any format using the extended config.
 */
export function generateExportContent(
  orderData: CanonicalOrderData,
  format: ExportFormat,
  mappings: ErpColumnMappingExtended[],
  options: {
    separator: string;
    quoteChar: string;
    lineEnding: string;
    decimalSeparator: string;
    xmlTemplate: string | null;
  }
): { content: string; contentType: string; warnings: string[] } {
  const warnings: string[] = [];

  switch (format) {
    case "csv": {
      const content = generateCsvContent(
        orderData,
        mappings,
        options.separator,
        options.quoteChar,
        options.lineEnding,
        options.decimalSeparator
      );
      return { content, contentType: "text/csv; charset=utf-8", warnings };
    }

    case "xml": {
      const result = generateXmlContent(
        orderData,
        options.xmlTemplate,
        mappings,
        options.decimalSeparator
      );
      return {
        content: result.content,
        contentType: "application/xml; charset=utf-8",
        warnings: result.warnings,
      };
    }

    case "json": {
      const content = JSON.stringify(orderData, null, 2);
      return { content, contentType: "application/json; charset=utf-8", warnings };
    }

    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}
