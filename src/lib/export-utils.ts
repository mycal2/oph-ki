/**
 * Shared utility functions for ERP export (used by export and preview routes).
 */
import type { CanonicalLineItem, CanonicalOrder, ExportFormat } from "@/lib/types";

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
    case "dealer_article_number":
      return item.dealer_article_number ?? "";
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
 * Resolves a value from the order-level data by dot-path.
 * Handles paths like "order_number", "dealer.name", "sender.company_name",
 * "delivery_address.company", "billing_address.street", etc.
 */
export function getOrderFieldValue(order: CanonicalOrder, fieldPath: string): string {
  const parts = fieldPath.split(".");

  if (parts.length === 1) {
    switch (parts[0]) {
      case "order_number": return order.order_number ?? "";
      case "order_date": return order.order_date ?? "";
      case "currency": return order.currency ?? "";
      case "total_amount": return order.total_amount !== null ? String(order.total_amount) : "";
      case "notes": return order.notes ?? "";
      case "email_subject": return order.email_subject ?? "";
      default: return "";
    }
  }

  if (parts.length === 2) {
    const [parent, child] = parts;
    switch (parent) {
      case "dealer":
        if (child === "name") return order.dealer?.name ?? "";
        if (child === "id") return order.dealer?.id ?? "";
        return "";
      case "sender": {
        if (!order.sender) return "";
        const val = (order.sender as unknown as Record<string, unknown>)[child];
        return val !== null && val !== undefined ? String(val) : "";
      }
      case "delivery_address": {
        if (!order.delivery_address) return "";
        const val = (order.delivery_address as unknown as Record<string, unknown>)[child];
        return val !== null && val !== undefined ? String(val) : "";
      }
      case "billing_address": {
        if (!order.billing_address) return "";
        const val = (order.billing_address as unknown as Record<string, unknown>)[child];
        return val !== null && val !== undefined ? String(val) : "";
      }
      default:
        return "";
    }
  }

  return "";
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
