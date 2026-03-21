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

---

## QA Test Results

**Tested:** 2026-03-21
**App URL:** http://localhost:3003
**Tester:** QA Engineer (AI)

### Acceptance Criteria Status

#### AC-1: Catalog search for line items with empty article_number
- [x] Code in `src/lib/article-matching.ts` iterates line items and skips those that already have `article_number` (line 133)
- [x] For items with empty `article_number`, the full catalog is searched
- [x] Called from `src/app/api/orders/[orderId]/extract/route.ts` (lines 536-554) after extraction, before save

#### AC-2: Matching uses signals in priority order (GTIN, dealer art. nr., fuzzy, packaging)
- [x] GTIN exact match checked first (score 1.0, line 151-160)
- [x] Dealer article number vs catalog keywords checked second (score 0.95, line 163-174)
- [x] Fuzzy name match checked third (score based on Dice coefficient, line 191-214)
- [x] Packaging used as tie-breaker when top candidates score equally (line 229-245)
- [ ] BUG: Description-vs-keyword substring match (step 3, line 177-188) is NOT listed in the AC priority order. The spec says priority #3 is "Fuzzy text match" but the code adds an intermediate step at score 0.9 for keyword substring match. See BUG-3.

#### AC-3: Confident match pre-fills article_number
- [x] Match result sets `article_number` from `catalogEntry.article_number` (lines 237, 250)
- [x] Uses `article_number_source: "catalog_match"` to flag the source

#### AC-4: Visual distinction in review UI ("KI-Vorschlag" badge)
- [x] `order-edit-form.tsx` shows a violet "KI-Vorschlag" badge with Sparkles icon when `article_number_source === "catalog_match"` (line 392-411)
- [x] Uses shadcn Badge and Tooltip components correctly
- [x] Badge styling uses violet color scheme for clear differentiation

#### AC-5: Match reason shown on hover/tooltip
- [x] `order-edit-form.tsx` shows tooltip with `article_number_match_reason` (line 405-408)
- [x] Falls back to generic message "Automatisch aus dem Artikelkatalog zugeordnet." if reason is null
- [x] `extraction-result-preview.tsx` shows Sparkles icon with tooltip on catalog-matched values (lines 469-482)
- [ ] BUG: Reason strings use "Ubereinstimmung" (missing umlaut) instead of the correct German spelling. See BUG-1.

#### AC-6: No match below confidence threshold leaves field empty
- [x] `FUZZY_MATCH_THRESHOLD = 0.6` prevents low-quality matches (line 12)
- [x] Items with no candidates remain unchanged (line 218-220)
- [x] Tied candidates with no packaging resolution return item unchanged (line 244, 257)

#### AC-7: User can accept, edit, or clear suggestion
- [x] `order-edit-form.tsx` onChange handler sets `article_number_source: "manual"` and `article_number_match_reason: null` when user edits (line 417-420)
- [x] Badge disappears when source changes from "catalog_match"
- [x] Clearing the field (empty string) sets article_number to null

#### AC-8: Empty catalog skips matching silently
- [x] Code returns early with no error when catalog is empty or null (lines 112-118)
- [x] Items with existing article_number still get `article_number_source: "extracted"` even when catalog is empty

#### AC-9: Matching is tenant-scoped
- [x] Query filters by `.eq("tenant_id", tenantId)` (line 105)
- [x] RLS policies on `article_catalog` table enforce tenant isolation at database level
- [x] adminClient is used (bypasses RLS) but tenant filter is explicit in the query

### Edge Cases Status

#### EC-1: Multiple catalog articles score equally
- [x] When multiple candidates share the top score, packaging tie-breaker is attempted (line 229)
- [x] If packaging doesn't resolve the tie, the field stays empty (line 244, 257)

#### EC-2: Dealer article number matches keyword in two catalog entries
- [x] Both entries would be pushed as candidates with score 0.95
- [x] Top candidates with equal scores trigger the tie-breaker logic, which ultimately leaves the field empty if unresolved

#### EC-3: Tenant catalog has 0 entries
- [x] Handled at line 112 -- returns line items unchanged (no error)

#### EC-4: Line item already has article_number from extraction
- [x] Matching is skipped for that item (line 133-138)
- [x] Source is set to "extracted"

#### EC-5: User manually edits a pre-filled suggestion
- [x] onChange handler resets source to "manual" and clears match_reason (line 417-420)

#### EC-6: Re-extraction runs matching again
- [x] The extract route always calls `matchArticleNumbers` after extraction (line 538)
- [x] Previous review data is cleared before re-extraction (line 196-197)

#### EC-7: Very large catalog (5,000+ articles)
- [ ] BUG: No `.limit()` on catalog query. See BUG-2.
- [x] Matching is O(n*m) where n=line items, m=catalog size -- acceptable for typical order sizes
- [x] Fuzzy matching (Dice coefficient) is O(len) per comparison, not O(n^2)

### Security Audit Results
- [x] Authentication: Extract route requires either valid Supabase auth or internal secret
- [x] Authorization: Tenant scoping enforced via explicit `.eq("tenant_id", tenantId)` filter
- [x] Tenant isolation: RLS policies on article_catalog table prevent cross-tenant access
- [x] Input validation: New fields validated via Zod schema in `reviewSaveSchema`
- [x] No secrets exposed: Matching runs server-side only, no catalog data sent to browser unnecessarily
- [x] Timing-safe comparison for internal secret (line 24-26 in extract route)
- [x] Error handling: Matching errors are caught and logged without failing extraction (try/catch at line 537-553)
- [x] No injection vectors: Supabase parameterized queries, no raw SQL

### Cross-Browser & Responsive
- [x] Badge and tooltip use standard shadcn/ui components (cross-browser compatible)
- [x] Extraction preview table hides Herst.-Art.-Nr. column below sm breakpoint (line 439: `hidden sm:table-cell`)
- [x] Badge in edit form uses flexible layout that wraps on small screens
- [x] Tooltip works with both mouse hover and touch (shadcn Tooltip primitive)

### Bugs Found

#### BUG-1: Missing German umlauts in match reason strings
- **Severity:** Low
- **File:** `src/lib/article-matching.ts`
- **Steps to Reproduce:**
  1. Have an article catalog with entries that match extracted line items
  2. Run extraction on an order
  3. View the tooltip for a catalog-matched article number
  4. Expected: Correct German spelling with umlauts (e.g., "Ubereinstimmung" with U-umlaut, "bestatigt" with a-umlaut)
  5. Actual: ASCII characters without umlauts: "Ubereinstimmung" (line 157, 170, 184, 211) and "bestatigt" (line 239)
- **Affected strings:**
  - `GTIN-Ubereinstimmung` should be `GTIN-Übereinstimmung`
  - `Alias-Ubereinstimmung` should be `Alias-Übereinstimmung`
  - `Keyword-Ubereinstimmung` should be `Keyword-Übereinstimmung`
  - `Namens-Ubereinstimmung` should be `Namens-Übereinstimmung`
  - `Verpackung bestatigt` should be `Verpackung bestätigt`
- **Priority:** Fix in next sprint (cosmetic, user-facing tooltip text)

#### BUG-2: No query limit on catalog loading
- **Severity:** Medium
- **File:** `src/lib/article-matching.ts`, line 102-105
- **Steps to Reproduce:**
  1. A tenant has a very large article catalog (5,000+ entries)
  2. Run extraction on an order
  3. Expected: Catalog query has a reasonable limit or pagination
  4. Actual: Query loads ALL catalog entries without `.limit()`, potentially loading unbounded rows
- **Notes:** The project backend rules state "Use `.limit()` on all list queries." While the feature spec accepts catalogs up to 5,000+, Supabase has a default row limit (typically 1,000) that may silently truncate results, causing missed matches for tenants with large catalogs. The code should either explicitly set a high limit (e.g., 10000) to override the Supabase default, or implement batched loading.
- **Priority:** Fix before deployment (could cause silent incorrect behavior for large catalogs)

#### BUG-3: Undocumented keyword-substring matching step
- **Severity:** Low
- **File:** `src/lib/article-matching.ts`, lines 177-188
- **Steps to Reproduce:**
  1. Review the matching logic
  2. Expected: Matching steps follow the documented priority order (GTIN, dealer art. nr. vs keywords, fuzzy name, packaging)
  3. Actual: An additional step exists between dealer art. nr. matching and fuzzy matching -- "Description vs catalog keywords (substring match)" at score 0.9 -- that is not documented in the acceptance criteria or matching logic description
- **Notes:** This step matches when the description contains a keyword of 4+ characters as a substring. While functional and reasonable, it should be documented in the spec since it introduces a matching path not covered by the spec's priority order.
- **Priority:** Nice to have (documentation alignment)

#### BUG-4: Operator precedence ambiguity in keyword match condition
- **Severity:** Low
- **File:** `src/lib/article-matching.ts`, line 179
- **Steps to Reproduce:**
  1. Read line 179: `entryKeywords.find((kw) => descLower === kw || descLower.includes(kw) && kw.length >= 4)`
  2. Expected: Clear intent expressed with parentheses
  3. Actual: Relies on JavaScript operator precedence (`&&` before `||`). While the behavior is correct (exact match OR substring match with length >= 4), the missing parentheses make the intent ambiguous and error-prone for future maintainers.
- **Recommended fix:** Add parentheses: `descLower === kw || (descLower.includes(kw) && kw.length >= 4)`
- **Priority:** Nice to have (code clarity)

### Regression Check
- [x] OPH-4 (AI Extraction): Extract route still functions correctly; matching is wrapped in try/catch and non-blocking
- [x] OPH-5 (Order Review): Edit form works with and without new fields; existing orders without `article_number_source` render correctly
- [x] OPH-39 (Article Catalog): Catalog CRUD operations unaffected; matching only reads from the catalog
- [x] OPH-37 (Dealer Article Number): `dealer_article_number` field still displayed and editable in review form
- [x] Build passes without errors (`npm run build` successful)

### Summary
- **Acceptance Criteria:** 8/9 passed (1 partial: AC-2 has undocumented intermediate matching step; AC-5 has cosmetic umlaut issue)
- **Edge Cases:** 6/7 passed (EC-7 has missing query limit concern)
- **Bugs Found:** 4 total (0 critical, 1 medium, 3 low)
- **Security:** Pass -- no vulnerabilities found
- **Production Ready:** YES (with caveat)
- **Recommendation:** Fix BUG-2 (missing query limit) before deployment to avoid silent data truncation for tenants with large catalogs. BUG-1, BUG-3, and BUG-4 are cosmetic/documentation issues that can be addressed in the next sprint.


## Deployment
- **Production URL:** https://oph-ki.ids.online
- **Deployed:** 2026-03-21
- **Git Tag:** v1.40.0-OPH-40
- **All 4 QA bugs fixed before deployment**
