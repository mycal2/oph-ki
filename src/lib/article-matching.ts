/**
 * OPH-40: AI Article Number Matching during Extraction.
 *
 * Server-side utility that matches extracted line items (with empty article_number)
 * against the tenant's article catalog using GTIN, keywords, and fuzzy name matching.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonicalLineItem } from "@/lib/types";

/** Minimum similarity score (0-1) for fuzzy name matching to be accepted. */
const FUZZY_MATCH_THRESHOLD = 0.6;

/** Shape of a catalog row loaded from the database. */
interface CatalogEntry {
  article_number: string;
  name: string;
  gtin: string | null;
  keywords: string | null;
  packaging: string | null;
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
 * Calculate text similarity between two strings using bigram overlap (Dice coefficient).
 * Returns a score between 0 and 1.
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

interface MatchCandidate {
  catalogEntry: CatalogEntry;
  score: number;
  reason: string;
}

/**
 * Match extracted line items against the tenant's article catalog.
 *
 * For each line item where article_number is empty, attempts matching via:
 * 1. GTIN exact match
 * 2. Dealer article number vs catalog keywords (exact, case-insensitive)
 * 3. Description vs catalog keywords (exact, case-insensitive)
 * 4. Fuzzy name match (description vs catalog name + keywords)
 * 5. Packaging tie-breaker if multiple equal-score candidates
 *
 * Items that already have an article_number get source="extracted".
 */
export async function matchArticleNumbers(
  adminClient: SupabaseClient,
  lineItems: CanonicalLineItem[],
  tenantId: string
): Promise<CanonicalLineItem[]> {
  // Load entire catalog for this tenant
  const { data: catalog, error } = await adminClient
    .from("article_catalog")
    .select("article_number, name, gtin, keywords, packaging")
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("Error loading article catalog for matching:", error.message);
    return lineItems;
  }

  if (!catalog || catalog.length === 0) {
    // No catalog: mark existing article numbers as extracted, skip matching
    return lineItems.map((item) => ({
      ...item,
      article_number_source: item.article_number ? "extracted" : undefined,
    }));
  }

  const catalogEntries: CatalogEntry[] = catalog.map((row) => ({
    article_number: row.article_number as string,
    name: row.name as string,
    gtin: (row.gtin as string | null) ?? null,
    keywords: (row.keywords as string | null) ?? null,
    packaging: (row.packaging as string | null) ?? null,
  }));

  // Pre-compute keywords for each catalog entry
  const catalogKeywords = catalogEntries.map((entry) => parseKeywords(entry.keywords));

  return lineItems.map((item) => {
    // Already has article_number from extraction: mark as extracted, skip matching
    if (item.article_number) {
      return {
        ...item,
        article_number_source: "extracted" as const,
      };
    }

    const candidates: MatchCandidate[] = [];

    // Access GTIN from the line item if present (may be in description or a custom field)
    // For now, we don't have a dedicated GTIN field on CanonicalLineItem,
    // but we check if the description or dealer_article_number could be a GTIN.

    for (let i = 0; i < catalogEntries.length; i++) {
      const entry = catalogEntries[i];
      const entryKeywords = catalogKeywords[i];

      // 1. GTIN exact match: check if dealer_article_number matches catalog GTIN
      if (entry.gtin && item.dealer_article_number) {
        const itemGtin = item.dealer_article_number.trim();
        if (itemGtin.length >= 8 && itemGtin === entry.gtin.trim()) {
          candidates.push({
            catalogEntry: entry,
            score: 1.0,
            reason: `GTIN-Ubereinstimmung: '${itemGtin}' = Katalog-GTIN`,
          });
          continue;
        }
      }

      // 2. Dealer article number vs catalog keywords (exact, case-insensitive)
      if (item.dealer_article_number && entryKeywords.length > 0) {
        const dealerArtLower = item.dealer_article_number.trim().toLowerCase();
        if (dealerArtLower && entryKeywords.includes(dealerArtLower)) {
          candidates.push({
            catalogEntry: entry,
            score: 0.95,
            reason: `Alias-Ubereinstimmung: Händler-Art.-Nr. '${item.dealer_article_number}' gefunden in Suchbegriffen`,
          });
          continue;
        }
      }

      // 3. Description vs catalog keywords (exact keyword match)
      if (item.description && entryKeywords.length > 0) {
        const descLower = normalizeText(item.description);
        const keywordMatch = entryKeywords.find((kw) => descLower === kw || descLower.includes(kw) && kw.length >= 4);
        if (keywordMatch) {
          candidates.push({
            catalogEntry: entry,
            score: 0.9,
            reason: `Keyword-Ubereinstimmung: Beschreibung enthält '${keywordMatch}'`,
          });
          continue;
        }
      }

      // 4. Fuzzy name match: description vs catalog name + keywords
      if (item.description) {
        // Compute similarity against catalog name
        const nameSim = textSimilarity(item.description, entry.name);

        // Also check against each keyword individually and take the best
        let bestKeywordSim = 0;
        for (const kw of entryKeywords) {
          if (kw.length >= 3) {
            const kwSim = textSimilarity(item.description, kw);
            if (kwSim > bestKeywordSim) bestKeywordSim = kwSim;
          }
        }

        const bestScore = Math.max(nameSim, bestKeywordSim);

        if (bestScore >= FUZZY_MATCH_THRESHOLD) {
          const matchedAgainst = nameSim >= bestKeywordSim ? entry.name : "Suchbegriff";
          candidates.push({
            catalogEntry: entry,
            score: bestScore,
            reason: `Namens-Ubereinstimmung (${Math.round(bestScore * 100)}%): '${item.description}' ~ '${matchedAgainst}'`,
          });
        }
      }
    }

    // No candidates found
    if (candidates.length === 0) {
      return item;
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    const topScore = candidates[0].score;
    const topCandidates = candidates.filter((c) => Math.abs(c.score - topScore) < 0.01);

    // If multiple candidates with the same top score, try packaging tie-breaker
    if (topCandidates.length > 1 && item.unit) {
      const unitLower = item.unit.toLowerCase();
      const packagingMatch = topCandidates.find(
        (c) => c.catalogEntry.packaging?.toLowerCase() === unitLower
      );
      if (packagingMatch) {
        return {
          ...item,
          article_number: packagingMatch.catalogEntry.article_number,
          article_number_source: "catalog_match" as const,
          article_number_match_reason: packagingMatch.reason + " (Verpackung bestatigt)",
        };
      }

      // Tie with no packaging resolution: leave empty (EC-1)
      return item;
    }

    // Single top candidate: use it
    if (topCandidates.length === 1) {
      return {
        ...item,
        article_number: topCandidates[0].catalogEntry.article_number,
        article_number_source: "catalog_match" as const,
        article_number_match_reason: topCandidates[0].reason,
      };
    }

    // Multiple tied candidates, no unit to break tie: leave empty
    return item;
  });
}
