/**
 * OPH-47: AI Customer Number Matching during Extraction.
 * OPH-65: Tolerant customer number matching (whitespace, hyphens, leading zeros).
 *
 * Server-side utility that matches extracted sender information against the
 * tenant's customer catalog to find or verify the correct Kundennummer.
 *
 * Mirrors the OPH-40 article matching pattern.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonicalSender } from "@/lib/types";
import { normalizeArticleKey } from "@/lib/article-matching";

/** Shape of a customer catalog row loaded from the database. */
interface CustomerCatalogEntry {
  customer_number: string;
  company_name: string;
  email: string | null;
  phone: string | null;
  keywords: string | null;
}

/** Result of customer matching, to be merged into the sender. */
export interface CustomerMatchResult {
  customer_number: string;
  customer_number_source: NonNullable<CanonicalSender["customer_number_source"]>;
  customer_number_match_reason: string;
}

/**
 * Normalize text for comparison: lowercase, collapse whitespace, strip punctuation.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract only digits from a string (for phone number normalization).
 */
function digitsOnly(text: string): string {
  return text.replace(/\D/g, "");
}

/**
 * Split comma-separated keywords into individual trimmed, lowercased entries.
 */
function parseKeywords(keywords: string | null): string[] {
  if (!keywords) return [];
  return keywords
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);
}

/**
 * Calculate text similarity using bigram overlap (Dice coefficient).
 * Returns a score between 0 and 1.
 * Same algorithm as article-matching.ts (OPH-40).
 */
function textSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);

  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < na.length - 1; i++) {
    const bigram = na.substring(i, i + 2);
    bigramsA.set(bigram, (bigramsA.get(bigram) ?? 0) + 1);
  }

  const bigramsB = new Map<string, number>();
  for (let i = 0; i < nb.length - 1; i++) {
    const bigram = nb.substring(i, i + 2);
    bigramsB.set(bigram, (bigramsB.get(bigram) ?? 0) + 1);
  }

  let intersection = 0;
  for (const [bigram, countA] of bigramsA) {
    const countB = bigramsB.get(bigram) ?? 0;
    intersection += Math.min(countA, countB);
  }

  const totalBigrams = (na.length - 1) + (nb.length - 1);
  return (2 * intersection) / totalBigrams;
}

/** Minimum Dice coefficient for fuzzy company name matching. */
const FUZZY_NAME_THRESHOLD = 0.70;

/**
 * Match extracted sender information against the tenant's customer catalog.
 *
 * Priority cascade (first match wins):
 *   1. Email exact match (confidence 0.97)
 *   2. Customer number exact match (confirm existing, source "catalog_exact")
 *   3. Keyword exact match vs. company_name (confidence 0.87)
 *   4. Fuzzy company name (Dice >= 0.70)
 *   5. Phone exact match, digits only (confidence 0.82)
 *
 * Returns the enriched sender with customer_number, source, and match reason.
 * If no match is found, sender is returned with source = "extracted" (if customer_number exists) or unchanged.
 */
export async function matchCustomerNumber(
  adminClient: SupabaseClient,
  sender: CanonicalSender | null,
  tenantId: string
): Promise<CanonicalSender | null> {
  // No sender info at all -> skip (EC-4)
  if (!sender) return sender;

  // Load entire customer catalog for this tenant (paginated to bypass PostgREST row limit)
  const PAGE_SIZE = 1000;
  let catalog: Record<string, unknown>[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: page, error } = await adminClient
      .from("customer_catalog")
      .select("customer_number, company_name, email, phone, keywords")
      .eq("tenant_id", tenantId)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("Error loading customer catalog for matching:", error.message);
      return sender.customer_number
        ? { ...sender, customer_number_source: "extracted" }
        : sender;
    }

    if (page && page.length > 0) {
      catalog = catalog.concat(page);
      offset += page.length;
      hasMore = page.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  // No catalog entries -> skip (EC-1)
  if (!catalog || catalog.length === 0) {
    return sender.customer_number
      ? { ...sender, customer_number_source: "extracted" }
      : sender;
  }

  const entries: CustomerCatalogEntry[] = catalog.map((row) => ({
    customer_number: row.customer_number as string,
    company_name: row.company_name as string,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    keywords: (row.keywords as string | null) ?? null,
  }));

  // --- Priority 1: Email exact match ---
  if (sender.email) {
    const senderEmailLower = sender.email.trim().toLowerCase();
    for (const entry of entries) {
      if (entry.email && entry.email.trim().toLowerCase() === senderEmailLower) {
        return {
          ...sender,
          customer_number: entry.customer_number,
          customer_number_source: "catalog_email",
          customer_number_match_reason: `Katalog-Treffer (E-Mail): ${entry.company_name}`,
        };
      }
    }
  }

  // --- Priority 2: Customer number exact match ---
  if (sender.customer_number) {
    const senderCustLower = sender.customer_number.trim().toLowerCase();
    for (const entry of entries) {
      if (entry.customer_number.trim().toLowerCase() === senderCustLower) {
        return {
          ...sender,
          customer_number_source: "catalog_exact",
          customer_number_match_reason: `Katalog-Treffer (Kundennummer): ${entry.company_name}`,
        };
      }
    }

    // --- OPH-65: Normalized customer number match ---
    // Strip whitespace, hyphens, and leading zeros (always on for customer numbers).
    // e.g. extracted "00108606" matches catalog "108606".
    const senderCustNormalized = normalizeArticleKey(sender.customer_number, true);
    if (senderCustNormalized.length > 0) {
      const normalizedHits: CustomerCatalogEntry[] = [];
      for (const entry of entries) {
        const entryNormalized = normalizeArticleKey(entry.customer_number, true);
        if (entryNormalized === senderCustNormalized) {
          normalizedHits.push(entry);
        }
      }

      if (normalizedHits.length === 1) {
        return {
          ...sender,
          customer_number: normalizedHits[0].customer_number,
          customer_number_source: "catalog_normalized",
          customer_number_match_reason: `Normalisiert: ${sender.customer_number} → ${normalizedHits[0].customer_number} (${normalizedHits[0].company_name})`,
        };
      } else if (normalizedHits.length > 1) {
        // Multiple collisions — ambiguous, skip normalized match
        console.warn(
          `OPH-65: Normalized customer number collision: "${sender.customer_number}" ` +
          `normalizes to "${senderCustNormalized}" which matches ${normalizedHits.length} catalog entries. Skipping.`
        );
      }
    }
  }

  // --- Priority 3: Keyword exact match vs. company_name ---
  if (sender.company_name) {
    const senderCompanyLower = sender.company_name.trim().toLowerCase();
    for (const entry of entries) {
      const entryKeywords = parseKeywords(entry.keywords);
      for (const kw of entryKeywords) {
        if (kw === senderCompanyLower) {
          return {
            ...sender,
            customer_number: entry.customer_number,
            customer_number_source: "catalog_keyword",
            customer_number_match_reason: `Katalog-Treffer (Suchbegriff '${kw}'): ${entry.company_name}`,
          };
        }
      }
    }
  }

  // --- Priority 4: Fuzzy company name match (Dice coefficient) ---
  if (sender.company_name) {
    let bestMatch: { entry: CustomerCatalogEntry; score: number } | null = null;

    for (const entry of entries) {
      const score = textSimilarity(sender.company_name, entry.company_name);
      if (score >= FUZZY_NAME_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { entry, score };
      }
    }

    if (bestMatch) {
      return {
        ...sender,
        customer_number: bestMatch.entry.customer_number,
        customer_number_source: "catalog_fuzzy_name",
        customer_number_match_reason: `Katalog-Treffer (Firmenname ${Math.round(bestMatch.score * 100)}%): ${bestMatch.entry.company_name}`,
      };
    }
  }

  // --- Priority 5: Phone exact match (digits only) ---
  if (sender.phone) {
    const senderPhoneDigits = digitsOnly(sender.phone);
    if (senderPhoneDigits.length >= 5) {
      for (const entry of entries) {
        if (entry.phone) {
          const entryPhoneDigits = digitsOnly(entry.phone);
          if (entryPhoneDigits.length >= 5 && senderPhoneDigits === entryPhoneDigits) {
            return {
              ...sender,
              customer_number: entry.customer_number,
              customer_number_source: "catalog_phone",
              customer_number_match_reason: `Katalog-Treffer (Telefon): ${entry.company_name}`,
            };
          }
        }
      }
    }
  }

  // --- No match found ---
  if (sender.customer_number) {
    return { ...sender, customer_number_source: "extracted" };
  }

  return sender;
}
