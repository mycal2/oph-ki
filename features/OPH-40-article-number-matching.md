# OPH-40: AI Article Number Matching during Extraction

## Status: In Review
**Created:** 2026-03-20
**Last Updated:** 2026-03-20

## Dependencies
- Requires: OPH-39 (Manufacturer Article Catalog) — catalog must exist to match against
- Requires: OPH-4 (KI-Datenextraktion) — matching runs as part of or after extraction
- Requires: OPH-5 (Bestellprüfung & manuelle Korrektur) — matched values shown in review UI

## Overview
When the AI extracts a dealer order line item that has no manufacturer article number (Herst.-Art.-Nr.), the system searches the tenant's article catalog (OPH-39) for the best matching article using the extracted product name, packaging, color/shade, and other available signals. The best match is pre-filled into the Herst.-Art.-Nr. field and visually flagged so the user can confirm or correct it before export.

## User Stories
- As a tenant user reviewing an order, I want the system to pre-fill the Herst.-Art.-Nr. automatically when it can find a likely match so that I spend less time looking up article numbers manually.
- As a tenant user, I want matched article numbers to be visually marked as "AI-suggested" so that I know they need confirmation and don't treat them as verified.
- As a tenant user, I want to see the match confidence or reason so that I can quickly judge whether to accept or correct it.
- As a tenant user, I want to be able to clear a suggested match and enter the correct number manually without friction.
- As a platform_admin, I want matching to be transparent (logged) so that I can diagnose false matches during onboarding.

## Acceptance Criteria
- [ ] After extraction, for each line item where `article_number` (Herst.-Art.-Nr.) is empty, the system searches the tenant's article catalog
- [ ] Matching uses the following signals from the extracted line item (in priority order):
  1. GTIN/EAN if present
  2. Dealer article number (exact match against keywords/aliases)
  3. Fuzzy text match on product name vs. `name` + `keywords` fields
  4. Packaging as a tie-breaker when multiple candidates score equally
- [ ] If a match is found with sufficient confidence, the `article_number` field is pre-filled with the matched Herst.-Art.-Nr.
- [ ] Pre-filled matches are visually distinguished in the review UI (e.g., a small "KI-Vorschlag" badge next to the field)
- [ ] The match reason is shown on hover/tooltip (e.g., "Übereinstimmung: Artikelname 'Tetric A1 Shade A1' → Herst.-Art.-Nr. 123456")
- [ ] If no match meets the confidence threshold, the field remains empty — no guess is made
- [ ] The user can accept the suggestion (no action needed), edit it, or clear it — all treated the same way as a manually entered value on save
- [ ] If the tenant catalog is empty, matching is skipped silently (no error)
- [ ] Matching is tenant-scoped — articles from other tenants are never used

## Matching Logic (non-technical description)
1. **GTIN exact match** — if the dealer order contains a barcode/EAN and it matches a catalog entry → high confidence
2. **Keyword/alias exact match** — if the extracted product name matches any keyword or alias in the catalog (case-insensitive) → high confidence
3. **Fuzzy name match** — normalized text similarity between extracted product name and catalog article name + keywords → medium/low confidence depending on score
4. **Packaging filter** — if multiple candidates remain, prefer entries whose `packaging` matches the ordered quantity unit

A minimum confidence threshold prevents low-quality guesses from being auto-filled.

## Edge Cases
- EC-1: Multiple catalog articles score equally → no match is pre-filled; field stays empty
- EC-2: Dealer article number matches a keyword in two different catalog entries → no match pre-filled
- EC-3: Tenant catalog has 0 entries → matching skipped, no error shown
- EC-4: Line item already has a Herst.-Art.-Nr. from extraction → matching is NOT run for that line item (don't overwrite confident extractions)
- EC-5: User manually edits a pre-filled suggestion → treated identically to manual entry; badge removed on save
- EC-6: Re-extraction of an order (if supported) → matching runs again and may update suggestions
- EC-7: Very large catalog (5,000+ articles) → matching must complete within acceptable time (< 3s per order)

## Tech Design (Solution Architect)

### Flow

```
Claude AI Extraction (existing)
  → line items extracted, article_number often empty
       ↓
Article Matching (NEW — server-side, post-extraction)
  → loads tenant's article_catalog from database
  → for each line item with empty article_number:
     1. GTIN exact match
     2. Dealer article number vs. catalog keywords
     3. Fuzzy name match vs. catalog name + keywords
     4. Packaging tie-breaker
  → pre-fills confident matches with source + reason metadata
       ↓
Order saved to database (atomically with extraction result)
       ↓
User reviews in Order Review UI
  → "KI-Vorschlag" badge on pre-filled fields
  → Tooltip shows match reason
  → Accept (no action) / edit / clear → badge gone on save
```

### UI Changes (no new pages)

```
Order Review Page (existing)
+-- OrderEditForm (existing)
    +-- Line Item Row
        +-- Herst.-Art.-Nr. field
            +-- [NEW] "KI-Vorschlag" badge (when source = "catalog_match")
            +-- [NEW] Tooltip: e.g. "Gefunden über Alias: 'Tetric A1'"
            +-- Badge clears when user edits or saves a different value

ExtractionResultPreview (existing, read-only)
+-- Line Items Table
    +-- [NEW] Small indicator icon on catalog-matched values
```

### Data Model Changes

Two new optional fields added to `CanonicalLineItem` (stored in existing order JSON — **no schema migration needed**):

| Field | Values | Meaning |
|---|---|---|
| `article_number_source` | `"extracted"` / `"catalog_match"` / `"manual"` | How the value got there |
| `article_number_match_reason` | string or null | e.g. `"Alias-Übereinstimmung: 'Tetric A1 Shade A1'"` |

### New / Modified Files

| File | Change |
|---|---|
| `src/lib/article-matching.ts` | NEW — matching utility (loads catalog, runs algorithm, returns enriched line items) |
| `src/lib/types.ts` | Add `article_number_source` and `article_number_match_reason` to `CanonicalLineItem` |
| `src/app/api/orders/[orderId]/extract/route.ts` | Call matching after extraction, before saving |
| `src/components/orders/review/order-edit-form.tsx` | Show KI-Vorschlag badge + tooltip |
| `src/components/orders/extraction-result-preview.tsx` | Show indicator on matched values |

### Tech Decisions

- **Server-side matching** — catalog can have 5,000+ rows; downloading to browser for every review is wasteful
- **No Claude API for matching** — text similarity against a known list is fast, deterministic, and free; Claude already extracted the product name
- **Post-extraction, pre-save** — atomic with extraction result; no race condition between extraction and matching
- **No new database table** — match metadata is order-scoped and ephemeral; lives in the existing order JSON
- **No new packages** — text similarity via standard string operations (no external library needed)
