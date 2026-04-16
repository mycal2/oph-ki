/**
 * OPH-40: AI Article Number Matching during Extraction.
 * OPH-65: Tolerant Article Number Matching (whitespace, hyphens, optional leading zeros).
 *
 * Server-side utility that matches extracted line items (with empty article_number)
 * against the tenant's article catalog using GTIN, keywords, and fuzzy name matching.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonicalLineItem } from "@/lib/types";

/** Minimum similarity score (0-1) for fuzzy name matching to be accepted. */
const FUZZY_MATCH_THRESHOLD = 0.6;

/**
 * OPH-65: Normalize an article/customer number key for tolerant comparison.
 *
 * Steps:
 *   1. Lowercase + trim (existing behavior)
 *   2. Strip all whitespace and hyphens (universal — always applied)
 *   3. Optionally strip leading zeros from each digit run (per-dealer opt-in)
 *
 * The function is pure, O(n), and avoids regex allocations in hot loops.
 * Exported so customer-matching.ts can reuse it.
 *
 * @param value - The raw article/customer number string.
 * @param stripLeadingZeros - When true, "016" becomes "16". Default false.
 * @returns The normalized key for comparison.
 */
export function normalizeArticleKey(value: string, stripLeadingZeros = false): string {
  // Step 1: lowercase + trim
  let result = value.toLowerCase().trim();

  // Step 2: strip whitespace and hyphens
  // Using a single pass instead of two regex calls for performance in hot loops
  let cleaned = "";
  for (let i = 0; i < result.length; i++) {
    const ch = result[i];
    if (ch !== " " && ch !== "-" && ch !== "\t" && ch !== "\n" && ch !== "\r") {
      cleaned += ch;
    }
  }
  result = cleaned;

  // Step 3 (optional): strip leading zeros from each digit run
  // "801hp016" → "801hp16" (only the leading zeros within consecutive digit sequences)
  if (stripLeadingZeros && result.length > 0) {
    let stripped = "";
    let i = 0;
    while (i < result.length) {
      if (result[i] >= "0" && result[i] <= "9") {
        // We're at the start of a digit run — skip leading zeros
        while (i < result.length && result[i] === "0") {
          i++;
        }
        // Check if the entire digit run was zeros — keep at least one "0"
        if (i === result.length || result[i] < "0" || result[i] > "9") {
          // All zeros (or trailing zeros at end) — keep one zero
          stripped += "0";
        }
        // Now copy the remaining non-zero digits of this run
        while (i < result.length && result[i] >= "0" && result[i] <= "9") {
          stripped += result[i];
          i++;
        }
      } else {
        stripped += result[i];
        i++;
      }
    }
    result = stripped;
  }

  return result;
}

/** Shape of a catalog row loaded from the database. */
interface CatalogEntry {
  article_number: string;
  name: string;
  gtin: string | null;
  ref_no: string | null;
  keywords: string | null;
  packaging: string | null;
  size1: string | null;
  size2: string | null;
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

/** Options for article number matching (OPH-65). */
interface MatchArticleNumbersOptions {
  /**
   * Per-dealer flag: when true, leading zeros in digit runs are stripped
   * during normalized matching (e.g. "016" matches "16").
   * Default: false.
   */
  stripLeadingZeros?: boolean;
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
 * OPH-65: When an item already has an article_number, matching now uses:
 * 1. Exact match (lowercase + trim) — source = "extracted" (unchanged)
 * 2. Normalized match (strip whitespace/hyphens ± leading zeros) — source = "normalized_match"
 * 3. REF number / keyword match — source = "catalog_match"
 *
 * Items that already have an article_number get source="extracted".
 */
export async function matchArticleNumbers(
  adminClient: SupabaseClient,
  lineItems: CanonicalLineItem[],
  tenantId: string,
  options: MatchArticleNumbersOptions = {}
): Promise<CanonicalLineItem[]> {
  const { stripLeadingZeros = false } = options;
  // Load entire catalog for this tenant
  const { data: catalog, error } = await adminClient
    .from("article_catalog")
    .select("article_number, name, gtin, ref_no, keywords, packaging, size1, size2")
    .eq("tenant_id", tenantId)
    .limit(10000);

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
    ref_no: (row.ref_no as string | null) ?? null,
    keywords: (row.keywords as string | null) ?? null,
    packaging: (row.packaging as string | null) ?? null,
    size1: (row.size1 as string | null) ?? null,
    size2: (row.size2 as string | null) ?? null,
  }));

  // Pre-compute keywords for each catalog entry (including size1/size2 as extra keywords)
  const catalogKeywords = catalogEntries.map((entry) => {
    const kw = parseKeywords(entry.keywords);
    // Add size1/size2 as additional keywords for matching
    if (entry.size1) kw.push(entry.size1.trim().toLowerCase());
    if (entry.size2) kw.push(entry.size2.trim().toLowerCase());
    return kw;
  });

  // OPH-65: Pre-compute normalized keys for catalog entries (avoid re-computing per line item)
  const catalogNormalizedKeys = catalogEntries.map((entry) =>
    normalizeArticleKey(entry.article_number, stripLeadingZeros)
  );

  return lineItems.map((item) => {
    // Already has article_number from extraction: check if it matches a catalog entry
    // (the extracted "article number" might actually be a REF number or dealer code)
    if (item.article_number) {
      const extractedLower = item.article_number.trim().toLowerCase();

      for (let i = 0; i < catalogEntries.length; i++) {
        const entry = catalogEntries[i];
        const entryKeywords = catalogKeywords[i];

        // Exact article_number match: the extracted number IS the manufacturer article number
        if (extractedLower === entry.article_number.trim().toLowerCase()) {
          return {
            ...item,
            article_number_source: "extracted" as const,
          };
        }

        // REF number match: the extracted value matches a catalog ref_no
        // (e.g., Dentalair orders with Meisinger REF numbers instead of article numbers)
        if (entry.ref_no && extractedLower === entry.ref_no.trim().toLowerCase()) {
          return {
            ...item,
            article_number: entry.article_number,
            dealer_article_number: item.dealer_article_number || item.article_number,
            article_number_source: "catalog_match" as const,
            article_number_match_reason: `Ref.-Nr.-Übereinstimmung: Extrahierte Nr. '${item.article_number}' = Ref.-Nr. von '${entry.article_number}'`,
          };
        }

        // Exact keyword match: the extracted article_number is actually a dealer alias
        if (entryKeywords.includes(extractedLower)) {
          return {
            ...item,
            article_number: entry.article_number,
            dealer_article_number: item.dealer_article_number || item.article_number,
            article_number_source: "catalog_match" as const,
            article_number_match_reason: `Alias-Übereinstimmung: Extrahierte Nr. '${item.article_number}' gefunden in Suchbegriffen von '${entry.article_number}'`,
          };
        }
      }

      // --- OPH-65: Normalized-match pass ---
      // Strip whitespace/hyphens (± leading zeros) and try again.
      // Only runs when the exact pass above found no match.
      const extractedNormalized = normalizeArticleKey(item.article_number, stripLeadingZeros);
      if (extractedNormalized.length > 0) {
        // Find all catalog entries whose normalized key matches
        const normalizedHits: number[] = [];
        for (let i = 0; i < catalogEntries.length; i++) {
          if (catalogNormalizedKeys[i] === extractedNormalized) {
            normalizedHits.push(i);
          }
        }

        if (normalizedHits.length === 1) {
          // Single normalized match — safe to use
          const matchedEntry = catalogEntries[normalizedHits[0]];
          return {
            ...item,
            article_number: matchedEntry.article_number,
            dealer_article_number: item.dealer_article_number || item.article_number,
            article_number_source: "normalized_match" as const,
            article_number_match_reason: `Normalisiert: ${item.article_number} → ${matchedEntry.article_number}`,
          };
        } else if (normalizedHits.length > 1) {
          // Multiple catalog entries collide under normalization — ambiguous.
          // Log warning for admin to clean up the catalog; leave item unmatched.
          const colliding = normalizedHits.map((idx) => catalogEntries[idx].article_number).join(", ");
          console.warn(
            `OPH-65: Normalized collision for tenant ${tenantId}: extracted "${item.article_number}" ` +
            `normalizes to "${extractedNormalized}" which matches multiple catalog entries: [${colliding}]. ` +
            `Skipping normalized match — catalog cleanup recommended.`
          );
        }
      }

      // No exact or normalized catalog match found — fall through to fuzzy matching below
      // (the extracted article_number might be unrecognized, so try matching by name)
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
            reason: `GTIN-Übereinstimmung: '${itemGtin}' = Katalog-GTIN`,
          });
          continue;
        }
      }

      // 2. REF number match: check if dealer_article_number matches catalog ref_no
      if (entry.ref_no && item.dealer_article_number) {
        const dealerArt = item.dealer_article_number.trim().toLowerCase();
        if (dealerArt === entry.ref_no.trim().toLowerCase()) {
          candidates.push({
            catalogEntry: entry,
            score: 0.98,
            reason: `Ref.-Nr.-Übereinstimmung: Händler-Art.-Nr. '${item.dealer_article_number}' = Ref.-Nr. von '${entry.article_number}'`,
          });
          continue;
        }
      }

      // 3. Dealer article number vs catalog keywords (exact, case-insensitive)
      if (item.dealer_article_number && entryKeywords.length > 0) {
        const dealerArtLower = item.dealer_article_number.trim().toLowerCase();
        if (dealerArtLower && entryKeywords.includes(dealerArtLower)) {
          candidates.push({
            catalogEntry: entry,
            score: 0.95,
            reason: `Alias-Übereinstimmung: Händler-Art.-Nr. '${item.dealer_article_number}' gefunden in Suchbegriffen`,
          });
          continue;
        }
      }

      // 3. Description vs catalog keywords (exact keyword match)
      if (item.description && entryKeywords.length > 0) {
        const descLower = normalizeText(item.description);
        const keywordMatch = entryKeywords.find((kw) => descLower === kw || (descLower.includes(kw) && kw.length >= 4));
        if (keywordMatch) {
          candidates.push({
            catalogEntry: entry,
            score: 0.9,
            reason: `Keyword-Übereinstimmung: Beschreibung enthält '${keywordMatch}'`,
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
            reason: `Namens-Übereinstimmung (${Math.round(bestScore * 100)}%): '${item.description}' ~ '${matchedAgainst}'`,
          });
        }
      }
    }

    // No candidates found — keep item as-is (with extracted article_number if any)
    if (candidates.length === 0) {
      if (item.article_number) {
        return { ...item, article_number_source: "extracted" as const };
      }
      return item;
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    const topScore = candidates[0].score;
    const topCandidates = candidates.filter((c) => Math.abs(c.score - topScore) < 0.01);

    // Helper: build a catalog match result, preserving original article_number as dealer_article_number
    const buildMatch = (candidate: MatchCandidate, reasonSuffix?: string) => {
      const result: CanonicalLineItem & Record<string, unknown> = {
        ...item,
        article_number: candidate.catalogEntry.article_number,
        article_number_source: "catalog_match" as const,
        article_number_match_reason: candidate.reason + (reasonSuffix ?? ""),
      };
      // If item had an extracted article_number that differs from the catalog match,
      // preserve it as dealer_article_number
      if (item.article_number && item.article_number !== candidate.catalogEntry.article_number) {
        result.dealer_article_number = item.dealer_article_number || item.article_number;
      }
      return result as CanonicalLineItem;
    };

    // If multiple candidates with the same top score, try tie-breakers
    if (topCandidates.length > 1) {
      const descLower = item.description ? normalizeText(item.description) : "";
      const unitLower = item.unit?.toLowerCase() ?? "";

      // Tie-breaker 1: size1/size2 match against description
      if (descLower) {
        const sizeMatch = topCandidates.find((c) => {
          const s1 = c.catalogEntry.size1?.toLowerCase();
          const s2 = c.catalogEntry.size2?.toLowerCase();
          return (s1 && descLower.includes(s1)) || (s2 && descLower.includes(s2));
        });
        if (sizeMatch) {
          return buildMatch(sizeMatch, " (Groesse bestätigt)");
        }
      }

      // Tie-breaker 2: packaging match against unit
      if (unitLower) {
        const packagingMatch = topCandidates.find(
          (c) => c.catalogEntry.packaging?.toLowerCase() === unitLower
        );
        if (packagingMatch) {
          return buildMatch(packagingMatch, " (Verpackung bestätigt)");
        }
      }

      // Tie with no resolution: keep item as-is
      if (item.article_number) {
        return { ...item, article_number_source: "extracted" as const };
      }
      return item;
    }

    // Single top candidate: use it
    if (topCandidates.length === 1) {
      return buildMatch(topCandidates[0]);
    }

    // Fallback: keep item as-is
    if (item.article_number) {
      return { ...item, article_number_source: "extracted" as const };
    }
    return item;
  });
}
