import type { SupabaseClient } from "@supabase/supabase-js";
import type { DealerDataMapping, CanonicalOrderData } from "@/lib/types";

/**
 * Fetches all applicable mappings for a dealer, merging global and tenant-specific
 * entries. Tenant-specific entries take priority over global ones for the same
 * (mapping_type, dealer_value) key.
 */
export async function getMappingsForDealer(
  adminClient: SupabaseClient,
  dealerId: string,
  tenantId: string
): Promise<DealerDataMapping[]> {
  const { data, error } = await adminClient
    .from("dealer_data_mappings")
    .select("*")
    .eq("dealer_id", dealerId)
    .eq("active", true)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .order("mapping_type")
    .order("dealer_value");

  if (error) {
    console.error("Error fetching dealer mappings:", error.message);
    return [];
  }

  // Apply priority: tenant-specific wins over global for same (mapping_type, dealer_value)
  const seen = new Map<string, DealerDataMapping>();
  for (const mapping of (data ?? []) as DealerDataMapping[]) {
    const key = `${mapping.mapping_type}|${mapping.dealer_value.toLowerCase().trim()}`;
    const existing = seen.get(key);
    // Tenant-specific (tenant_id != null) wins over global (tenant_id == null)
    if (!existing || (mapping.tenant_id && !existing.tenant_id)) {
      seen.set(key, mapping);
    }
  }

  return Array.from(seen.values());
}

/**
 * Applies dealer data mappings to extracted order data:
 * - article_number: replaces dealer article numbers with ERP article numbers
 * - unit_conversion: multiplies quantity by conversion_factor, replaces unit
 *
 * Returns the transformed data and a list of unmapped article numbers.
 */
export function applyMappings(
  extractedData: CanonicalOrderData,
  mappings: DealerDataMapping[]
): { data: CanonicalOrderData; unmappedArticles: string[] } {
  const articleMappings = new Map<string, DealerDataMapping>();
  const unitMappings = new Map<string, DealerDataMapping>();

  for (const m of mappings) {
    const key = m.dealer_value.toLowerCase().trim();
    if (m.mapping_type === "article_number") {
      articleMappings.set(key, m);
    } else if (m.mapping_type === "unit_conversion") {
      unitMappings.set(key, m);
    }
  }

  const unmappedArticles: string[] = [];
  const updatedLineItems = extractedData.order.line_items.map((item) => {
    const updated = { ...item };

    // Article number mapping
    if (item.article_number) {
      const articleKey = item.article_number.toLowerCase().trim();
      const articleMapping = articleMappings.get(articleKey);
      if (articleMapping) {
        updated.article_number = articleMapping.erp_value;
      } else {
        unmappedArticles.push(item.article_number);
      }
    }

    // Unit conversion
    if (item.unit) {
      const unitKey = item.unit.toLowerCase().trim();
      const unitMapping = unitMappings.get(unitKey);
      if (unitMapping) {
        updated.unit = unitMapping.erp_value;
        if (unitMapping.conversion_factor && item.quantity) {
          updated.quantity = Math.round(item.quantity * unitMapping.conversion_factor);
          // Recalculate total_price if unit_price exists
          if (updated.unit_price !== null) {
            updated.total_price = updated.quantity * updated.unit_price;
          }
        }
      }
    }

    return updated;
  });

  return {
    data: {
      ...extractedData,
      order: {
        ...extractedData.order,
        line_items: updatedLineItems,
      },
    },
    unmappedArticles,
  };
}

/**
 * Formats dealer data mappings as context text for the Claude extraction prompt.
 */
export function formatMappingsForPrompt(mappings: DealerDataMapping[]): string {
  const articles = mappings.filter((m) => m.mapping_type === "article_number");
  const units = mappings.filter((m) => m.mapping_type === "unit_conversion");
  const fields = mappings.filter((m) => m.mapping_type === "field_label");

  const sections: string[] = [];

  if (articles.length > 0) {
    sections.push(
      "## Known Article Number Mappings\n" +
        articles
          .map((m) => `Dealer article "${m.dealer_value}" = ERP article "${m.erp_value}"`)
          .join("\n")
    );
  }

  if (units.length > 0) {
    sections.push(
      "## Known Unit Conversions\n" +
        units
          .map(
            (m) =>
              `"${m.dealer_value}" = ${m.conversion_factor ?? 1} x "${m.erp_value}"`
          )
          .join("\n")
    );
  }

  if (fields.length > 0) {
    sections.push(
      "## Known Field Label Mappings\n" +
        fields
          .map((m) => `"${m.dealer_value}" means "${m.erp_value}"`)
          .join("\n")
    );
  }

  return sections.join("\n\n");
}
