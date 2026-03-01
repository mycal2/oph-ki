/**
 * Shared utility functions for ERP export (used by export and preview routes).
 */
import type { CanonicalLineItem, ExportFormat } from "@/lib/types";

/**
 * Maximum number of line items allowed in a single export.
 * Prevents timeouts on very large orders (spec: max 10s transformation time).
 */
export const MAX_LINE_ITEMS = 10_000;

/**
 * Extracts a value from a line item by source field name.
 */
export function getLineItemValue(item: CanonicalLineItem, field: string): string {
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
export function escapeCsvField(value: string, separator: string, quoteChar: string): string {
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
 * Generates a sanitized filename for the export.
 * Pattern: {tenant_slug}_{order_number}_{date}.{format}
 */
export function generateFilename(
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
 * Escapes XML special characters in a string.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Encodes a filename for use in Content-Disposition header per RFC 5987.
 * Returns both the ASCII fallback and the UTF-8 encoded version.
 */
export function contentDisposition(filename: string): string {
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`;
}
