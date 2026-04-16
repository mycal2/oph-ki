# OPH-65: Tolerant Article Number Matching (Whitespace, Hyphens, Optional Leading Zeros)

## Status: In Progress
**Created:** 2026-04-15
**Last Updated:** 2026-04-15

## Dependencies
- Requires: OPH-39 (Manufacturer Article Catalog) — provides the catalog being matched against
- Requires: OPH-40 (AI Article Number Matching during Extraction) — this feature extends the matching layer
- Requires: OPH-46 (Manufacturer Customer Catalog) — for the customer-number normalization scope
- Requires: OPH-47 (AI Customer Number Matching during Extraction) — the customer-number side that will share the same normalization helper

## Problem Context

Order PDFs across dealers use inconsistent formatting for the **same** manufacturer article number. Real example from a KARL STORZ order:

- **Extracted from PDF:** `"801HP 016"` (space between letters and digits)
- **Catalog entry:** `"801-HP-16"` (hyphens, leading zero stripped)
- **Result:** Strict equality match fails; the line item shows no catalog match even though both refer to the same product.

Today the matcher does case-insensitive, trimmed string equality (`src/lib/article-matching.ts`). Any difference in separators (spaces vs hyphens vs none) or leading zeros causes an exact-match miss, even when both strings are obviously the same product to a human reviewer. The same problem affects customer numbers (e.g. `"00108606"` extracted vs `"108606"` in catalog).

## User Stories

- As a **Mandant-Mitarbeiter**, I want article numbers to match the catalog even when the PDF formatting differs from the catalog entry, so that I don't have to manually correct dozens of line items per order just because of separator differences.
- As a **Mandant-Mitarbeiter**, I want the system to clearly indicate when a match was made via normalization (not exact), so that I can spot-check those matches and trust the rest.
- As a **Plattform-Admin**, I want to enable an additional "leading zeros are not significant" rule for specific dealers (e.g. KARL STORZ) without affecting other dealers, so that I can handle dealer-specific quirks without risking false matches in catalogs where leading zeros do distinguish products.
- As a **Mandant-Mitarbeiter**, I want the extracted value to remain visible in the line item exactly as it appeared in the PDF, so that I can always trace back what the dealer actually wrote, even when a normalized match was found.
- As a **Mandant-Mitarbeiter**, I want the same tolerant matching behavior for customer numbers, so that "00108606" in a PDF still matches catalog entry "108606".

## Acceptance Criteria

### Default normalization (universal — applies to all dealers)

- [ ] Manufacturer article number matching strips whitespace and hyphens from **both** the extracted value and the catalog `article_number` before comparison.
- [ ] Match precedence is preserved: an exact (raw) string match still wins over a normalization-only match if both exist in the catalog.
- [ ] On a successful normalized match, the line item's `article_number` is replaced with the **canonical catalog value** (consistent with how OPH-40 already handles REF/keyword matches — needed so the ERP export uses the catalog's canonical form). The originally-extracted value is preserved in two places: (a) as the fallback for `dealer_article_number` if that field is empty, and (b) inside the human-readable `article_number_match_reason` string (e.g. "Normalisiert: 801HP 016 → 801-HP-16").
- [ ] Customer number matching (OPH-47) uses the same normalization helper for `customer_number` ↔ catalog `customer_number`. On a successful normalized match, the line item's `customer_number_source` is set to a new value `"catalog_normalized"` (distinct from `"catalog_exact"`), so the UI can show a "normalized" indicator.
- [ ] Dealer article numbers (`dealer_article_number`) are **not** affected by this feature — they continue to match strictly.

### Per-dealer leading-zero opt-in

- [ ] Each dealer profile has a new boolean `strip_leading_zeros_in_article_numbers`, defaulting to `false`.
- [ ] When `true`, manufacturer article number matching for that dealer's orders **also** strips leading zeros from each digit run (e.g. `"801HP 016"` → normalized → `"801HP16"`; matches catalog `"801-HP-16"` → normalized → `"801HP16"`).
- [ ] The toggle is editable in the existing dealer admin UI (under the dealer profile edit screen).
- [ ] When `false` (default), leading zeros are preserved in the comparison.

### UI signal for normalized matches

- [ ] When a line item's article was matched via normalization (not exact equality), the UI shows a small "fuzzy match" indicator next to the article number — for example a tooltip "Übereinstimmung über Normalisierung gefunden: 801HP 016 → 801-HP-16".
- [ ] The `article_number_source` field continues to be `"catalog_match"` for normalized matches (no new value introduced).
- [ ] The mechanism for the indicator is a separate boolean flag on the line item (e.g. `article_match_method: "exact" | "normalized"` or a similar field) — to be specified during architecture.
- [ ] Exact matches show no indicator (silent success).

### Out of scope (explicitly NOT in this feature)

- Fuzzy / edit-distance matching beyond the deterministic normalization rules above.
- Normalization of dealer article numbers.
- Per-dealer toggle for separator stripping (always on).
- Bulk re-matching of historical orders (reviewer can re-extract individually if desired).

## Edge Cases

- **Empty / null extracted article_number:** unchanged behavior — falls through to the existing fuzzy-match-on-description path. Normalization only runs when the extracted value is non-empty.
- **Catalog has both `"801HP016"` and `"801HP 016"` as separate entries:** the exact-match-wins rule prevents the normalization match from taking priority. The exact match (when one exists) is always preferred.
- **Multiple catalog entries normalize to the same key:** if two catalog rows collide under normalization (e.g. `"801-HP-16"` and `"801 HP 16"` both normalize to `"801HP16"`), no normalization match is made and a warning is logged for the admin to clean up the catalog. The line item is left without a catalog match.
- **Leading-zero toggle ON but no digit runs in the article number:** the rule is a no-op; behavior is identical to the toggle being off for that article.
- **Customer number with leading zeros** (e.g. extracted `"00108606"` vs catalog `"108606"`): customer numbers always strip leading zeros (digits before non-zero), since customer numbers don't carry the same per-dealer ambiguity as article numbers. This is handled inside the customer normalization helper without a per-dealer toggle.
- **Dealer profile toggle changed after orders extracted:** existing line items keep their stored match. New extractions and re-extractions use the current toggle value.
- **Article number contains characters other than alphanumerics/spaces/hyphens** (e.g. `"801HP/016"`): the normalization preserves all non-space, non-hyphen characters. So `"801HP/016"` and `"801-HP-016"` would NOT match (different separators beyond what we normalize). This is intentional — we only normalize the known-noisy separators to keep the behavior predictable.
- **Case differences:** already handled by the existing `.toLowerCase()` on both sides; normalization is applied on top of the lowercased value.

## Technical Requirements

- The normalization helper must be a single, pure function reused by both the article matcher and the customer matcher (no duplicated logic across files).
- Per-dealer toggle requires a database migration on the `dealers` table (boolean column with default `false`).
- The article-matching code path is hot during extraction — normalization must be O(n) over the input length and avoid regex allocations in hot loops where avoidable.
- Backwards compatibility: existing exact matches continue to work identically. No reprocessing of historical orders is triggered by this change.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview

Three independent parts, all backend-focused:
1. A shared `normalizeArticleKey()` helper (pure function, no DB)
2. A dealer-profile toggle for leading-zero stripping (DB migration + admin UI toggle)
3. A new `"normalized_match"` source value that drives a new UI badge in the order review form

### Data Model

**dealers table** — new boolean column (DB migration):
- `strip_leading_zeros_in_article_numbers` (boolean, default `false`)
- When ON, digit runs like "016" and "16" are treated as equal for this dealer's orders

**CanonicalLineItem type** (in-memory/JSON, no DB schema change):
- `article_number_source` gains a new value: `"normalized_match"`
  - `"catalog_match"` = raw string equality hit
  - `"normalized_match"` *(new)* = matched only after stripping spaces/hyphens (±leading zeros)
- `article_number_match_reason` carries the tooltip string, e.g. `"Normalisiert: 801HP 016 → 801-HP-16"`
- The extracted `article_number` value is always preserved unchanged

### Component Structure

```
Backend (existing files extended, no new files)
│
├── src/lib/article-matching.ts
│   ├── New: normalizeArticleKey(value, stripLeadingZeros)
│   │     Step 1: lowercase + trim (existing)
│   │     Step 2: strip spaces and hyphens
│   │     Step 3 (if flag): strip leading zeros from digit runs
│   ├── Exact-match pass (unchanged, always first)
│   └── NEW normalized-match pass → source="normalized_match"
│
├── src/lib/customer-matching.ts (or wherever OPH-47 lives)
│   └── Reuses normalizeArticleKey() — leading-zero strip always ON
│
├── src/lib/types.ts
│   └── "normalized_match" added to article_number_source union
│
└── src/app/api/orders/[orderId]/extract/route.ts
    └── Passes dealer.strip_leading_zeros_in_article_numbers into matching

Database
└── supabase/migrations/[new].sql
    └── ALTER TABLE dealers: ADD strip_leading_zeros_in_article_numbers BOOLEAN DEFAULT FALSE

Admin UI
└── src/components/dealers/[dealer-form]
    └── New toggle: "Führende Nullen in Artikelnummern ignorieren"
        Tooltip hint: "Aktivieren wenn '016' und '16' dieselbe Artikelnummer sind (z.B. KARL STORZ)"

Order Review UI
└── src/components/orders/review/order-edit-form.tsx (lines ~415–434 today)
    ├── "catalog_match"    → existing violet "KI-Vorschlag" badge (unchanged)
    └── "normalized_match" → new amber "Normalisiert" badge
                             tooltip: "Normalisiert: [extracted] → [catalog]"
```

### Matching Logic

1. **Exact pass** (unchanged): lowercase + trim → equality → `source = "catalog_match"`, stop.
2. **Normalized pass** (new): strip spaces/hyphens (+ optionally leading zeros) from both sides → equality → `source = "normalized_match"`, record reason, stop.
3. Falls through to existing keyword/REF/fuzzy path if both miss.

Customer number matching: same two passes, leading-zero stripping always ON (no per-dealer toggle).

### Key Tech Decisions

| Decision | Reason |
|---|---|
| `"normalized_match"` source value (not a boolean) | Single source of truth for badge rendering — no extra field to sync |
| Normalization in comparison only, extracted value unchanged | Preserves auditability — reviewer sees "801HP 016 → 801-HP-16" |
| Per-dealer toggle for leading zeros; separator-strip always on | Separators are universally noisy; leading zeros are catalog-specific |
| Shared `normalizeArticleKey()` helper | One function, two call sites — no duplicated logic |
| No new DB columns on orders/line_items | `article_number_match_reason` (already exists) carries the tooltip text |

### No new npm packages required.

## QA Test Results

**Reviewer:** Manual review (Claude) — 2026-04-15
**Status:** Pass with fixes applied

### Bugs found and fixed during QA

1. **🔴 HARD BREAK — Validation schema rejects new article_number_source value**
   `src/lib/validations.ts:165` — the `article_number_source` Zod enum was missing `"normalized_match"`. Any save through `reviewSaveSchema` (PATCH `/api/orders/[orderId]/review`) with a normalized line item would fail with 400 and lose the user's edits. **Fixed.**

2. **🟡 Pre-existing OPH-47 schema gap — customer source silently stripped**
   `canonicalSenderSchema` did not include `customer_number_source` or `customer_number_match_reason`. Zod's default behavior strips unknown keys, so every review-form auto-save was silently dropping these fields (since OPH-47 deployed). **Fixed by adding both fields to the schema, with the new `"catalog_normalized"` enum value included.**

3. **🔴 Customer-number normalized matches were indistinguishable from exact matches in the UI**
   `customer-matching.ts` used `customer_number_source: "catalog_exact"` for normalized hits → no UI signal. **Fixed:** new enum value `"catalog_normalized"` + amber `ArrowRightLeft` icon (in `extraction-result-preview.tsx`) and amber "Normalisiert" badge (in `order-edit-form.tsx`) wired up.

4. **🟢 Dead code**
   Unused `const runStart = i;` in `normalizeArticleKey()` removed.

### Spec corrections

- Acceptance criterion clarified: on a normalized match, `article_number` IS replaced with the canonical catalog value (consistent with how OPH-40's REF/keyword matches already work — needed for ERP export to use the canonical form). Originally-extracted value is preserved in `dealer_article_number` (when empty) and inside the human-readable `article_number_match_reason`.

### Verification

- `npx tsc --noEmit` passes with zero errors across all changes.
- Source-value precedence verified manually:
  - Customer matching: exact (`catalog_exact`) wins → normalized (`catalog_normalized`) → keyword → fuzzy → phone.
  - Article matching: exact (`extracted` source kept) → normalized (`normalized_match`) → REF/keyword (`catalog_match`) → fuzzy.
- UI conditional logic reviewed for both views — `"catalog_normalized"` and `"normalized_match"` render the amber treatment; all other catalog source values continue to render the existing violet treatment; `"extracted"` / `"manual"` / `null` render no badge.

### Recommended end-to-end test

1. Set the new "Führende Nullen in Artikelnummern ignorieren" toggle ON for KARL STORZ in admin → Händler-Verwaltung.
2. Re-extract order [4cd1ddbd](https://oph-ki.ids.online/orders/4cd1ddbd-aab4-4e64-988e-5e206097f474).
3. Verify the line item shows the amber "Normalisiert" badge with tooltip "Normalisiert: 801HP 016 → 801-HP-16".
4. Open the review form, edit any other field, confirm the badge persists after auto-save (would have failed before fix #1).
5. For a different order, confirm that an exact catalog match still shows the violet "KI-Vorschlag" badge (no regression).

## Deployment
_To be added by /deploy_
