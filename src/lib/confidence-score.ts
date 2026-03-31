/**
 * OPH-28: Confidence Score Calculator
 *
 * Calculates how well extracted order data matches the tenant's
 * configured output format. The score is the percentage of required
 * output columns that have corresponding non-empty values in the
 * extracted data (via ERP field mapping).
 */

import { normalizeMapping, getTransformedValue, isFixedValueMapping } from "@/lib/erp-transformations";
import type {
  CanonicalOrderData,
  OutputFormatSchemaColumn,
  ErpColumnMappingExtended,
  ConfidenceScoreData,
} from "@/lib/types";

/**
 * Calculate the confidence score for an order against a tenant's output format.
 *
 * @param orderData - The extracted (or reviewed) order data
 * @param outputSchema - The detected schema from the sample output format
 * @param erpMappings - The tenant's ERP column mappings (null if not configured)
 * @returns Confidence score data
 */
export function calculateConfidenceScore(
  orderData: CanonicalOrderData | null,
  outputSchema: OutputFormatSchemaColumn[],
  erpMappings: ErpColumnMappingExtended[] | null
): ConfidenceScoreData {
  // No ERP mapping configured — cannot calculate score
  if (!erpMappings || erpMappings.length === 0) {
    return {
      score: null,
      missing_columns: [],
      total_required: outputSchema.filter((c) => c.is_required).length,
      filled_required: 0,
      mapping_not_configured: true,
    };
  }

  // No order data — score is 0
  if (!orderData) {
    const requiredColumns = outputSchema.filter((c) => c.is_required);
    return {
      score: 0,
      missing_columns: requiredColumns.slice(0, 5).map((c) => c.column_name),
      total_required: requiredColumns.length,
      filled_required: 0,
      mapping_not_configured: false,
    };
  }

  const requiredOutputColumns = outputSchema.filter((c) => c.is_required);

  if (requiredOutputColumns.length === 0) {
    return {
      score: 100,
      missing_columns: [],
      total_required: 0,
      filled_required: 0,
      mapping_not_configured: false,
    };
  }

  // Build a lookup: target_column_name → mapping
  const mappingByTarget = new Map<string, ErpColumnMappingExtended>();
  for (const mapping of erpMappings) {
    const normalized = normalizeMapping(mapping);
    mappingByTarget.set(normalized.target_column_name, normalized);
  }

  // Check each required output column
  const missingColumns: string[] = [];
  let filledCount = 0;

  const lineItems = orderData.order.line_items;
  const firstItem = lineItems[0] ?? null;

  for (const col of requiredOutputColumns) {
    const mapping = mappingByTarget.get(col.column_name);

    if (!mapping) {
      // No mapping exists for this output column — missing
      missingColumns.push(col.column_name);
      continue;
    }

    // OPH-60: Fixed-value columns are always considered "filled"
    if (isFixedValueMapping(mapping)) {
      filledCount++;
      continue;
    }

    // Check if any line item has a non-empty value for this mapping
    const hasValue = checkMappingHasValue(mapping, orderData, firstItem, lineItems);

    if (hasValue) {
      filledCount++;
    } else {
      missingColumns.push(col.column_name);
    }
  }

  const score = Math.round((filledCount / requiredOutputColumns.length) * 100);

  return {
    score,
    missing_columns: missingColumns.slice(0, 5),
    total_required: requiredOutputColumns.length,
    filled_required: filledCount,
    mapping_not_configured: false,
  };
}

/**
 * Check if a mapping produces a non-empty value from the order data.
 * For order-level fields, checks once. For line-item fields, checks
 * the first item (representative — if the first item has it, most likely others do too).
 */
function checkMappingHasValue(
  mapping: ErpColumnMappingExtended,
  orderData: CanonicalOrderData,
  firstItem: import("@/lib/types").CanonicalLineItem | null,
  lineItems: import("@/lib/types").CanonicalLineItem[]
): boolean {
  const isOrderLevel = mapping.source_field.startsWith("order.");

  if (isOrderLevel) {
    // Check order-level field using a dummy line item
    const dummyItem = firstItem ?? {
      position: 0,
      article_number: null,
      dealer_article_number: null,
      description: "",
      quantity: 0,
      unit: null,
      unit_price: null,
      total_price: null,
      currency: null,
    };
    const value = getTransformedValue(dummyItem, mapping, ".", orderData);
    return value !== "" && value !== "null" && value !== "undefined";
  }

  // Line-item field — check if ANY item has a non-empty value
  if (lineItems.length === 0) return false;

  for (const item of lineItems) {
    const value = getTransformedValue(item, mapping, ".", orderData);
    if (value !== "" && value !== "null" && value !== "undefined") {
      return true;
    }
  }

  return false;
}
