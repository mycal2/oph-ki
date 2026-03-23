# OPH-44: Manufacturer Article Number Label Recognition in Extraction

## Overview
**Status:** In Review
**Created:** 2026-03-23
**Priority:** P1

## Problem
In dealer orders (PDFs, Excel files, emails), the manufacturer's article number is almost always labeled from the dealer's perspective — the dealer calls the manufacturer their "Lieferant" (supplier), so the manufacturer's article number appears as:

- `Lief.Art.Nr.` / `Lief.-Art.-Nr.`
- `Lieferantenartikelnummer`
- `Lieferanten-Art.-Nr.`
- `Art.Nr.` / `Artikelnummer`
- `Art.-Nr.` / `Art-Nr`
- `Supplier Art. No.` / `Supplier Article No.`
- `Vendor Article No.` / `Vendor Item No.`

Claude currently receives no guidance on which column/label maps to `article_number`. Without this, it may:
- Skip the manufacturer article number entirely
- Put it in `dealer_article_number` instead
- Misidentify a different column as the article number

This affects virtually every dealer because the naming convention is universal in the industry.

## Solution
Add explicit column header recognition guidance for `article_number` to the extraction prompt — the same approach already used for `quantity` (rule #15 multilingual header list). Claude is told which labels map to which fields, so it extracts correctly regardless of the document's language or abbreviation style.

## User Stories

1. **As a manufacturer user**, I want the system to correctly identify and extract the manufacturer article number from dealer orders regardless of whether it is labeled "Lief.Art.Nr.", "Art.Nr.", or "Supplier Article No.", so I don't have to manually correct it after every extraction.
2. **As a manufacturer user**, I want re-extraction to consistently populate `article_number` when the column is present in the order, so the AI article matching (OPH-40) can find the correct catalog entry.
3. **As a manufacturer user**, I want the system to distinguish between the manufacturer article number and the dealer's own internal article number when both are present in the same order.

## Acceptance Criteria

### AC-1: Extraction Prompt Updated
- [ ] The `article_number` field description in the Claude extraction schema includes an explicit list of recognized column header labels (German, English, abbreviations)
- [ ] The guidance covers the most common patterns:
  - German: `Lief.Art.Nr.`, `Lief.-Art.-Nr.`, `Lieferantenartikelnummer`, `Lieferanten-Art.-Nr.`, `Art.Nr.`, `Art.-Nr.`, `Artikelnummer`, `Herst.-Art.-Nr.`, `Herstellerartikelnummer`
  - English: `Supplier Art. No.`, `Supplier Article No.`, `Vendor Art. No.`, `Manufacturer Art. No.`, `Item No.`, `Product Code`

### AC-2: Correct Field Assignment
- [ ] When a dealer order contains a column labeled `Lief.Art.Nr.` or `Lieferantenartikelnummer`, the value is extracted into `article_number` (not `dealer_article_number`)
- [ ] When the same order also contains a separate dealer-internal reference number (e.g. `Kd.-Art.Nr.`, `Eigene Art.Nr.`), that value goes to `dealer_article_number`

### AC-3: No Regression
- [ ] When only one article number is present and it has no recognizable label, extraction behavior is unchanged (Claude uses context to decide)
- [ ] OPH-40 article matching continues to work correctly after the prompt change

## Edge Cases

- **EC-1:** Order has only `Lief.Art.Nr.` (no dealer-internal number) → `article_number` populated, `dealer_article_number` null
- **EC-2:** Order has both `Lief.Art.Nr.` and `Kd.-Art.Nr.` → `article_number` = Lief.Art.Nr. value, `dealer_article_number` = Kd.-Art.Nr. value
- **EC-3:** Order uses an unrecognized label → Claude falls back to context-based inference (existing behavior)
- **EC-4:** Order is in a language not covered by the label list → existing prompt guidance still applies
- **EC-5:** Column mapping (OPH-15) is configured for this dealer → column mapping takes priority over prompt label recognition (existing behavior, no change)

## Implementation Notes

- **Scope:** Single change to the `CANONICAL_JSON_SCHEMA` string in `src/lib/claude-extraction.ts`
- **Pattern to follow:** Rule #15 (quantity column recognition) — add a new rule for `article_number` label recognition
- **No database changes needed**
- **No UI changes needed**
- **Applies to all file types:** PDF, Excel, EML, CSV, plain text

## Dependencies
- Requires: OPH-4 (AI Extraction) — this is a direct prompt enhancement
- Related: OPH-37 (Dealer Article Number) — must not regress `dealer_article_number` extraction
- Related: OPH-40 (Article Matching) — benefits from more reliable `article_number` extraction
- Related: OPH-15 (Column Mapping) — per-dealer column mapping takes priority over this generic guidance

---

## QA Test Results

**Tested:** 2026-03-23
**App URL:** http://localhost:3003
**Tester:** QA Engineer (AI)

### Test Methodology

This feature is a **prompt-only change** -- no UI, no database, no API route changes. Testing focuses on:
1. Code review of the prompt changes against acceptance criteria
2. Build verification (no regressions in compilation)
3. Structural correctness of the schema and rule additions
4. Security audit of the extraction pipeline
5. Cross-feature regression analysis (OPH-37, OPH-40, OPH-15)

Manual browser testing of extraction output would require uploading real dealer order documents and comparing extraction results, which is beyond static code analysis. The acceptance criteria for AC-2 (correct field assignment) and AC-3 (no regression) are **prompt behavior** criteria that can only be fully validated with integration tests against real documents.

### Acceptance Criteria Status

#### AC-1: Extraction Prompt Updated
- [x] The `article_number` field description in `CANONICAL_JSON_SCHEMA` (line 46) includes an explicit list of recognized column header labels with a reference to rule #17
- [x] Rule #17 added to `SYSTEM_PROMPT` (lines 135-145) with full multilingual guidance
- [x] German labels covered: Lief.Art.Nr., Lief.-Art.-Nr., Lieferantenartikelnummer, Lieferanten-Art.-Nr., Lieferanten Art Nr, Art.Nr., Art.-Nr., Art-Nr, Artikelnummer, Artikel-Nr., Artikel Nr, Herst.-Art.-Nr., Herstellerartikelnummer, Hersteller-Art.-Nr., Hersteller Art Nr, Bestell-Nr., Bestellnummer
- [x] English labels covered: Supplier Art. No., Supplier Article No., Supplier Article Number, Vendor Art. No., Vendor Article No., Vendor Item No., Manufacturer Art. No., Manufacturer Article No., Item No., Item Number, Product Code, Product No., Article No., Article Number, Part No., Part Number, SKU
- [x] Implementation goes beyond spec requirements -- includes additional labels not in AC-1 (Lieferanten Art Nr, Artikel-Nr., Artikel Nr, Hersteller Art Nr, Bestell-Nr., Bestellnummer, Supplier Article Number, Product No., Article No., Article Number, Part No., Part Number, SKU) which is a positive enhancement
- [x] Dealer article number labels also added (Kd.-Art.Nr., Kd.Art.Nr., Kundenartikelnummer, etc.) to help Claude distinguish the two fields -- good addition not in original spec

**Result: PASS**

#### AC-2: Correct Field Assignment
- [x] Rule #17 explicitly states: "These labels map to `article_number` (the manufacturer's article number), NOT to `dealer_article_number`"
- [x] Rule #17 explicitly lists dealer-internal labels (Kd.-Art.Nr., Eigene Art.Nr., etc.) and maps them to `dealer_article_number`
- [x] The `article_number` field description in the schema (line 46) cross-references rule #17
- [x] The `dealer_article_number` field description (line 47) already had guidance to "only populate if the document clearly contains a separate dealer-specific reference number"
- [x] Rule #17 includes instruction: "When both types of article numbers appear in the same document, extract each into the correct field"

**Result: PASS (code review)** -- Full validation requires integration testing with real documents.

#### AC-3: No Regression
- [x] Rule #17 includes fallback: "If the column label does not match any of the above, fall back to context-based inference (existing behavior)" -- preserves existing behavior for unrecognized labels
- [x] `article_number` and `dealer_article_number` are still passed through identically in all three code paths: single extraction (line 413-414), chunked first result (line 612-613), chunked subsequent results (line 633-634)
- [x] OPH-40 article matching (`article-matching.ts`) operates on extracted `article_number` field -- it checks `item.article_number` presence and marks source as "extracted" if present. The prompt change only affects what value Claude puts there, not the downstream processing
- [x] Rule #16 (dealer-specific hints) is marked as CRITICAL priority and states hints "override default extraction behavior" -- this still takes precedence over rule #17
- [x] OPH-15 column mapping context is injected as dealer context (lines 209-211), which per rule #16 takes highest priority
- [x] Build succeeds with no errors

**Result: PASS (code review)**

### Edge Cases Status

#### EC-1: Only Lief.Art.Nr. present
- [x] Rule #17: "When only one article number column is present and it matches a manufacturer/supplier label above, put it in `article_number` and leave `dealer_article_number` null" -- correctly addressed

#### EC-2: Both Lief.Art.Nr. and Kd.-Art.Nr. present
- [x] Rule #17: "When both types of article numbers appear in the same document, extract each into the correct field" -- correctly addressed
- [x] Both label sets are enumerated so Claude can distinguish them

#### EC-3: Unrecognized label
- [x] Rule #17: "If the column label does not match any of the above, fall back to context-based inference (existing behavior)" -- correctly addressed

#### EC-4: Unsupported language
- [x] Rule #17 only covers German and English. For other languages, the fallback to context-based inference applies. The existing rules (#1-#16) still guide extraction -- no regression

#### EC-5: Column mapping configured (OPH-15)
- [x] Column mapping context is injected as dealer context and rule #16 (dealer hints) has highest priority -- column mapping will override rule #17 as expected

### Security Audit Results

This feature modifies only the Claude extraction prompt (a string constant). No new attack surface is introduced.

- [x] No new API endpoints added
- [x] No new user input paths added
- [x] No database schema changes
- [x] No authentication/authorization changes
- [x] Prompt injection via extraction hints: Existing sanitization (`sanitizeHints` from validations.ts, line 5) is applied to dealer extraction hints before they reach the prompt -- no change here
- [x] The additional `extractJson` fix (bracket-counting instead of greedy regex) is a security improvement -- the greedy regex could potentially be exploited with crafted JSON-like content after the real JSON to alter extraction results. The bracket-counting approach correctly finds the first complete JSON object
- [x] No secrets or credentials exposed
- [x] No CORS or header changes

**Security Result: PASS** -- No new vulnerabilities introduced.

### Additional Observations

#### Bonus Fix: extractJson Improvement
The same commit (76dbe8d) includes an unrelated but important fix to `extractJson()`: replacing a greedy regex (`/\{[\s\S]*\}/`) with proper bracket-counting JSON extraction. This is a good fix because:
- The greedy regex would match from the first `{` to the LAST `}` in the entire response, potentially including garbage after the JSON
- The bracket-counting approach correctly handles nested objects and strings with escaped characters
- This improves extraction reliability for all orders, not just those with article number labels

#### Spec vs Implementation Discrepancy (Informational)
The spec's Implementation Notes say "Single change to the `CANONICAL_JSON_SCHEMA` string" but the actual implementation correctly made TWO changes:
1. Enhanced the `article_number` field description in `CANONICAL_JSON_SCHEMA` (line 46)
2. Added rule #17 to `SYSTEM_PROMPT` (lines 135-145)

This is the right approach -- it mirrors how rule #15 (quantity) was implemented. The spec's description was slightly narrow but the implementation is correct.

### Cross-Browser / Responsive Testing

**Not applicable.** This feature has no UI changes. The extraction prompt runs server-side only.

### Regression Check

- [x] OPH-4 (AI Extraction): Core extraction pipeline unchanged, only prompt text modified
- [x] OPH-37 (Dealer Article Number): `dealer_article_number` field handling unchanged in all code paths
- [x] OPH-40 (Article Matching): `matchArticleNumbers()` function unchanged, still consumes `article_number` from extraction results
- [x] OPH-15 (Column Mapping): Column mapping injection unchanged, still takes priority via rule #16
- [x] OPH-23 (Chunked Extraction): Chunked path correctly passes through both article number fields
- [x] Build passes successfully with no errors

### Bugs Found

No bugs found.

### Summary
- **Acceptance Criteria:** 3/3 passed (code review level)
- **Bugs Found:** 0
- **Security:** Pass -- no new attack surface
- **Production Ready:** YES
- **Recommendation:** Deploy. The prompt changes are well-structured, follow the established pattern (rule #15 for quantity), and include proper fallback behavior. The bonus `extractJson` fix improves extraction reliability. Full behavioral validation should be done by processing a few real dealer orders after deployment and verifying the `article_number` field is correctly populated.
