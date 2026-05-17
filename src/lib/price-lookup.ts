/**
 * OPH-108: Price Lookup in AI Extraction.
 *
 * After AI extraction has matched article numbers (OPH-40) and the customer
 * number (OPH-47), this helper resolves the discounted price per line item by
 * looking up:
 *   1. An explicit `customer_article_discounts` override for (tenant, customer, article)
 *   2. A `customer_default_discounts` fallback for (tenant, customer)
 *   3. Article RRP (OPH-105) — required for the discount math
 *
 * The function is intentionally pure after its 3 batched SELECTs so it stays
 * within the < 500ms acceptance budget regardless of line-item count.
 *
 * Failure modes per line item:
 *   - customer_not_identified  — the order's sender has no matched customer_number
 *   - article_not_matched      — line item lacks an article_number after OPH-40
 *   - article_not_in_catalog   — article_number does not exist in article_catalog
 *   - article_missing_rrp      — article found but rrp is NULL
 *   - no_discount_rate         — no per-product override AND no customer default
 *
 * If any line item fails, the caller (extract route) sets the order to
 * `clarification` status and writes a structured Klärung note listing each
 * unresolved item. Items that *did* resolve still have their `discounted_price`
 * populated in the JSON so partial work is preserved.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonicalLineItem, CanonicalOrderData, PriceLookupReason } from "@/lib/types";

/** Maximum length of the clarification_note column (DB constraint, OPH-93). */
const CLARIFICATION_NOTE_MAX_LENGTH = 500;

/** Number of decimal places kept in the stored discounted_price. */
const PRICE_DECIMAL_PLACES = 4;

/** A single line item that failed to resolve a discounted price. */
export interface UnresolvedLineItem {
  position: number;
  article_number: string | null;
  reason: PriceLookupReason;
}

/** Input to {@link priceLookupForOrder}. */
export interface PriceLookupInput {
  tenantId: string;
  /** Canonical extracted data — must already have article matching + customer matching applied. */
  extractedData: CanonicalOrderData;
  /** Service-role Supabase client (RLS bypassed; we filter explicitly by tenant_id). */
  adminClient: SupabaseClient;
}

/** Output of {@link priceLookupForOrder}. */
export interface PriceLookupResult {
  /** Extracted data with `discounted_price` + `price_lookup_reason` added to every line item. */
  extractedData: CanonicalOrderData;
  /** True iff every line item resolved successfully. */
  allResolved: boolean;
  /** List of items that did not resolve (empty when allResolved=true). */
  unresolvedItems: UnresolvedLineItem[];
  /** Pre-formatted German Klärung note (≤ 500 chars) ready to drop into orders.clarification_note. */
  clarificationNote: string | null;
}

/** Round to 4 decimal places without floating-point noise. */
function roundPrice(value: number): number {
  const factor = 10 ** PRICE_DECIMAL_PLACES;
  return Math.round(value * factor) / factor;
}

/**
 * Build a German Klärung note listing every unresolved line item.
 * Caps the result at 500 chars (DB constraint) — overflow becomes "…und N weitere".
 */
function buildClarificationNote(unresolved: UnresolvedLineItem[]): string {
  if (unresolved.length === 0) return "";

  const header = "Preisermittlung unvollständig:";

  /** Per-reason German label for the note. */
  const reasonText: Record<PriceLookupReason, string> = {
    ok: "",
    customer_not_identified: "Kunde nicht identifiziert.",
    article_not_matched: "Keine Artikelnummer ermittelt.",
    article_not_in_catalog: "Artikel nicht im Katalog gefunden.",
    article_missing_rrp: "Artikel hat keinen UVP.",
    no_discount_rate: "Kein Rabattsatz für diesen Kunden hinterlegt.",
  };

  const lines: string[] = [];
  for (const item of unresolved) {
    const reasonLabel = reasonText[item.reason] || "Unbekannter Fehler.";
    if (item.article_number) {
      lines.push(`- Position ${item.position}, Art.Nr. ${item.article_number}: ${reasonLabel}`);
    } else {
      lines.push(`- Position ${item.position}: ${reasonLabel}`);
    }
  }

  // Try the full note first; if it exceeds the cap, trim lines and append "…und N weitere"
  let note = `${header}\n${lines.join("\n")}`;
  if (note.length <= CLARIFICATION_NOTE_MAX_LENGTH) return note;

  // Truncate: keep as many lines as fit, then append "…und N weitere"
  const ellipsis = (count: number) => `\n…und ${count} weitere`;
  for (let kept = lines.length - 1; kept >= 1; kept--) {
    const tail = ellipsis(lines.length - kept);
    const candidate = `${header}\n${lines.slice(0, kept).join("\n")}${tail}`;
    if (candidate.length <= CLARIFICATION_NOTE_MAX_LENGTH) {
      return candidate;
    }
  }

  // Pathological case: even one line + header exceeds 500 chars. Hard-truncate.
  return note.slice(0, CLARIFICATION_NOTE_MAX_LENGTH - 1) + "…";
}

/**
 * Compute discounted prices for every line item in the extracted order data.
 *
 * Strategy: batch 3 SELECTs (article catalog by article_number, override
 * discounts by customer, default discount for customer), then resolve every
 * line item in memory. Total queries are constant regardless of line count.
 *
 * The function is non-destructive: line items are returned as new objects,
 * the input is never mutated.
 */
export async function priceLookupForOrder(input: PriceLookupInput): Promise<PriceLookupResult> {
  const { tenantId, extractedData, adminClient } = input;
  const lineItems = extractedData.order.line_items ?? [];
  const customerNumber = extractedData.order.sender?.customer_number ?? null;

  // --- Resolve customer_id (single SELECT) ---
  // The sender carries the matched customer_number (string) after OPH-47.
  // We need the UUID id for discount-table lookups.
  let customerId: string | null = null;
  if (customerNumber) {
    const { data: customerRow, error: customerErr } = await adminClient
      .from("customer_catalog")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("customer_number", customerNumber)
      .maybeSingle();

    if (customerErr) {
      console.error("Price lookup: error fetching customer_catalog:", customerErr.message);
    } else if (customerRow) {
      customerId = customerRow.id as string;
    }
  }

  // --- Resolve article rows for every line item (batched SELECT) ---
  // Collect distinct, non-empty article numbers (case-insensitive lookup uses raw value;
  // article_number is stored case-preserving in catalog, comparison is exact).
  const articleNumbersToLookup = Array.from(
    new Set(
      lineItems
        .map((item) => item.article_number?.trim())
        .filter((n): n is string => !!n && n.length > 0)
    )
  );

  /** Map of article_number → { id, rrp } for fast per-line lookup. */
  const articleByNumber = new Map<string, { id: string; rrp: number | null }>();
  if (articleNumbersToLookup.length > 0) {
    const { data: articleRows, error: articleErr } = await adminClient
      .from("article_catalog")
      .select("id, article_number, rrp")
      .eq("tenant_id", tenantId)
      .in("article_number", articleNumbersToLookup);

    if (articleErr) {
      console.error("Price lookup: error fetching article_catalog:", articleErr.message);
    } else if (articleRows) {
      for (const row of articleRows) {
        // Supabase returns NUMERIC as string; coerce safely. Treat
        // null/undefined/empty/non-finite as "no RRP".
        const rawRrp = row.rrp as number | string | null | undefined;
        let rrp: number | null = null;
        if (rawRrp !== null && rawRrp !== undefined && rawRrp !== "") {
          const n = typeof rawRrp === "number" ? rawRrp : Number(rawRrp);
          if (Number.isFinite(n)) rrp = n;
        }
        articleByNumber.set(row.article_number as string, {
          id: row.id as string,
          rrp,
        });
      }
    }
  }

  // --- Resolve per-article overrides for this customer (batched SELECT) ---
  /** Map of article_id → discount_rate (percent). */
  const overrideByArticleId = new Map<string, number>();
  if (customerId && articleByNumber.size > 0) {
    const articleIds = Array.from(articleByNumber.values()).map((a) => a.id);
    const { data: overrideRows, error: overrideErr } = await adminClient
      .from("customer_article_discounts")
      .select("article_id, discount_rate")
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId)
      .in("article_id", articleIds);

    if (overrideErr) {
      console.error("Price lookup: error fetching customer_article_discounts:", overrideErr.message);
    } else if (overrideRows) {
      for (const row of overrideRows) {
        overrideByArticleId.set(row.article_id as string, Number(row.discount_rate));
      }
    }
  }

  // --- Resolve customer default (single SELECT) ---
  let defaultRate: number | null = null;
  if (customerId) {
    const { data: defaultRow, error: defaultErr } = await adminClient
      .from("customer_default_discounts")
      .select("discount_rate")
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId)
      .maybeSingle();

    if (defaultErr) {
      console.error("Price lookup: error fetching customer_default_discounts:", defaultErr.message);
    } else if (defaultRow) {
      defaultRate = Number(defaultRow.discount_rate);
    }
  }

  // --- Resolve every line item in memory ---
  const unresolvedItems: UnresolvedLineItem[] = [];
  const enrichedItems: CanonicalLineItem[] = lineItems.map((item, idx) => {
    const position = item.position ?? idx + 1;
    const articleNumber = item.article_number?.trim() || null;

    // (1) No customer match -> every line is unresolvable
    if (!customerId) {
      unresolvedItems.push({
        position,
        article_number: articleNumber,
        reason: "customer_not_identified",
      });
      return {
        ...item,
        discounted_price: null,
        price_lookup_reason: "customer_not_identified",
      };
    }

    // (2) No article number on this line
    if (!articleNumber) {
      unresolvedItems.push({ position, article_number: null, reason: "article_not_matched" });
      return {
        ...item,
        discounted_price: null,
        price_lookup_reason: "article_not_matched",
      };
    }

    // (3) Article number not in catalog
    const article = articleByNumber.get(articleNumber);
    if (!article) {
      unresolvedItems.push({
        position,
        article_number: articleNumber,
        reason: "article_not_in_catalog",
      });
      return {
        ...item,
        discounted_price: null,
        price_lookup_reason: "article_not_in_catalog",
      };
    }

    // (4) Article has no RRP — required for the math
    if (article.rrp === null) {
      unresolvedItems.push({
        position,
        article_number: articleNumber,
        reason: "article_missing_rrp",
      });
      return {
        ...item,
        discounted_price: null,
        price_lookup_reason: "article_missing_rrp",
      };
    }

    // (5) Look up discount rate: override -> default -> none
    const overrideRate = overrideByArticleId.get(article.id);
    const effectiveRate = overrideRate ?? defaultRate;

    if (effectiveRate === null || effectiveRate === undefined) {
      unresolvedItems.push({
        position,
        article_number: articleNumber,
        reason: "no_discount_rate",
      });
      return {
        ...item,
        discounted_price: null,
        price_lookup_reason: "no_discount_rate",
      };
    }

    // Success: compute discounted price.
    // discounted_price = RRP × (1 − rate / 100)
    // RRP may be 0 (valid, free product) — result is 0.
    // Rate may be 0 (valid, no discount) — result is RRP.
    const discounted = roundPrice(article.rrp * (1 - effectiveRate / 100));

    return {
      ...item,
      discounted_price: discounted,
      price_lookup_reason: "ok",
    };
  });

  const allResolved = unresolvedItems.length === 0;
  const clarificationNote = allResolved ? null : buildClarificationNote(unresolvedItems);

  return {
    extractedData: {
      ...extractedData,
      order: {
        ...extractedData.order,
        line_items: enrichedItems,
      },
    },
    allResolved,
    unresolvedItems,
    clarificationNote,
  };
}
