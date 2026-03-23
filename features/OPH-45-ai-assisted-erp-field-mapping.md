# OPH-45: AI-Assisted ERP Field Mapping

## Overview
**Status:** In Review
**Created:** 2026-03-23
**Priority:** P1

## Problem
Setting up ERP field mappings today requires the platform admin to manually drag-and-drop every field in the Visual Field Mapper (OPH-32). For a typical ERP output format with 10–20 columns, this takes 10–20 minutes and requires deep knowledge of the canonical order JSON schema. There is no automation: the admin must know which internal field (e.g., `items[].article_number`) maps to which target column (e.g., `Artikel-Nr.`).

When a new tenant uploads a target format sample, an AI could map the vast majority of fields automatically — reducing setup from 15+ minutes to under 2 minutes.

## Solution
Add an AI-powered auto-mapping step to the ERP configuration workflow. When an output format sample is uploaded, Claude analyzes both the target format's column names and the canonical order JSON schema, then pre-fills field mappings with confidence scores. The admin reviews the result in a two-column table (target field → canonical source), confirms high-confidence matches with one click, and corrects any low-confidence or missing mappings via dropdown. The result is then passed to the existing "Template generieren" flow (OPH-33) to produce the final ERP configuration.

## User Stories

1. **As a platform admin**, I want AI to automatically map target format columns to canonical order fields when I upload a sample file, so I don't have to manually drag-and-drop each field.
2. **As a platform admin**, I want to see a confidence indicator next to each AI-suggested mapping so I can quickly identify which mappings need my attention.
3. **As a platform admin**, I want a single "Alle bestätigen" button that accepts all high-confidence mappings at once, so I only need to focus on the uncertain ones.
4. **As a platform admin**, I want to correct or override any AI suggestion via a dropdown showing all canonical fields, so I stay in full control of the final mapping.
5. **As a platform admin**, I want the AI mapping to trigger automatically after a sample upload (or on demand via a button), without disrupting the existing manual Field Mapper workflow.
6. **As a platform admin**, I want unmapped target columns to be clearly highlighted so I don't accidentally miss a required field.

## Acceptance Criteria

### AC-1: AI Auto-Mapping Trigger
- [ ] An "Auto-Mapping starten" button appears on the ERP config output format tab after a sample file is uploaded
- [ ] Clicking the button calls an API endpoint that sends the detected column names and canonical field list to Claude
- [ ] A loading indicator is shown while Claude processes the mapping (typically 2–5 seconds)
- [ ] On completion, the mapping result is displayed in the Auto-Mapping review table (AC-2)
- [ ] If no sample file is uploaded, the button is disabled with a tooltip explaining why

### AC-2: Mapping Review Table
- [ ] The review table shows one row per detected target format column
- [ ] Each row has:
  - Left cell: target column name as found in the uploaded sample (read-only label)
  - Right cell: dropdown pre-filled with the AI's best canonical field suggestion
  - Confidence badge: green (≥ 80%), yellow (50–79%), red (< 50% or no suggestion)
- [ ] Rows with red confidence are visually highlighted (e.g., amber row background)
- [ ] The dropdown for each row lists ALL canonical source fields (same list as the existing Field Mapper)
- [ ] An "Unmapped" / "-" option is available in each dropdown to explicitly leave a field unmapped
- [ ] The table is scrollable if there are many columns; it does not push other UI elements off-screen

### AC-3: Bulk Confirm
- [ ] An "Alle bestätigen" button accepts all green (high-confidence) mappings in a single click
- [ ] Yellow and red rows are NOT auto-confirmed — the admin must touch each one
- [ ] After bulk confirm, confirmed rows are visually distinguished (e.g., checkmark icon, slightly faded)
- [ ] Individual rows can also be confirmed one at a time via a per-row confirm button or by simply selecting from the dropdown

### AC-4: Apply to Field Mapper
- [ ] A "Mapping übernehmen" button applies the confirmed mappings to the Visual Field Mapper (replaces current `field_mappings` state)
- [ ] After applying, "Template generieren" works exactly as before (OPH-33) — no change to the generation logic
- [ ] If the Field Mapper already has manually configured mappings, a confirmation dialog warns the admin before overwriting: "Bestehende Mappings überschreiben?"
- [ ] The admin can cancel and keep existing mappings

### AC-5: Fallback / Graceful Degradation
- [ ] If the Claude API call fails, an error message is shown and the manual Field Mapper remains fully functional
- [ ] If Claude returns no suggestion for a column, it shows as "Unmapped" with red confidence
- [ ] The existing drag-and-drop Field Mapper (OPH-32) remains available and unchanged — AI mapping is an additional fast-path, not a replacement

## Edge Cases

- **EC-1:** Sample has only 1–2 columns → Auto-mapping works normally; short table is shown
- **EC-2:** Sample has 30+ columns → Table is scrollable; "Alle bestätigen" still works on all green rows at once
- **EC-3:** Target column name is in a language other than German/English (e.g., Italian) → Claude still attempts a mapping; confidence is likely yellow/red; admin corrects manually
- **EC-4:** Same canonical field mapped to multiple target columns → Allowed (e.g., `article_number` could appear in both a "Artikel-Nr." and a "Hersteller-Nr." column); no error
- **EC-5:** Admin runs Auto-Mapping a second time after editing some fields manually → Confirmation dialog: "Bestehendes Auto-Mapping überschreiben?" (same as AC-4 for Field Mapper)
- **EC-6:** Uploaded sample is XML format → Column detection reads XML tag names as target fields; same mapping flow applies
- **EC-7:** Claude API is slow (> 10 seconds) → Loading spinner remains; no timeout on the client; API route uses 30-second timeout and returns an error if exceeded

## Implementation Notes

### AI Prompt Design
- Input to Claude: list of target column names (from `detected_schema`) + list of canonical order fields (same as Field Mapper variables)
- Output from Claude: JSON array of `{ target_column: string, canonical_field: string | null, confidence: number }` (confidence 0.0–1.0)
- Confidence thresholds: ≥ 0.8 = green, 0.5–0.79 = yellow, < 0.5 = red
- The prompt includes the canonical field descriptions (from the order JSON schema) so Claude can reason about meaning, not just name similarity

### API Route
- New route: `POST /api/admin/erp-configs/[id]/auto-map`
- Input: `{ detected_columns: string[] }` (columns from the already-stored `detected_schema`)
- Output: `{ mappings: { target_column: string, canonical_field: string | null, confidence: number }[] }`
- Auth: admin only
- No database write — result is returned to the client; only stored when admin clicks "Mapping übernehmen" (which saves to `field_mappings` column, existing behavior)

### Frontend
- New component: `AutoMappingPanel` rendered inside the existing ERP config editor (below the output format sample section)
- State: `{ status: 'idle' | 'loading' | 'done' | 'error', mappings: AutoMappingRow[] }`
- "Mapping übernehmen" dispatches the confirmed mappings to the existing `field_mappings` state in `erp-config-editor.tsx`

### No database schema changes needed

## Dependencies
- Requires: OPH-28 (Output Format Sample Upload) — `detected_schema` must exist
- Requires: OPH-32 (Visual Field Mapper) — mappings are applied to this component's state
- Requires: OPH-33 (Field Mapper Output) — "Template generieren" consumes the mappings
- Related: OPH-9 (ERP-Mapping-Konfiguration) — the ERP config this is part of

---

## Tech Design (Solution Architect)

### Component Structure

```
ErpConfigEditor (existing)
  └── OutputFormatTab (existing)
        └── [sample uploaded → detected_schema available]
              └── AutoMappingPanel (NEW)
                    ├── "Auto-Mapping starten" Button
                    │     └── disabled with tooltip if no sample uploaded
                    ├── Loading Skeleton (while Claude runs)
                    ├── MappingReviewTable (NEW, shown after AI responds)
                    │     └── MappingRow × N (one per target column)
                    │           ├── Left: target column name (read-only)
                    │           ├── Center: confidence badge (green/yellow/red)
                    │           └── Right: Select dropdown (all canonical fields + "–")
                    ├── "Alle bestätigen" Button (bulk-accepts green rows)
                    └── "Mapping übernehmen" Button
                          └── OverwriteConfirmDialog (if Field Mapper already has mappings)

FieldMapperPanel (existing — unchanged)
  └── receives updated field_mappings when admin clicks "Mapping übernehmen"
```

### Data Flow

```
1. Admin uploads sample file  →  detected_schema stored in DB (existing, OPH-28)
2. Admin clicks "Auto-Mapping starten"
3. Frontend calls  POST /api/admin/erp-configs/[id]/auto-map
4. API reads detected_schema from DB  →  sends column names + canonical field list to Claude
5. Claude returns JSON: [{ target_column, canonical_field, confidence }, ...]
6. API returns this array to the frontend  (no DB write yet)
7. Frontend renders MappingReviewTable with AI suggestions pre-filled in dropdowns
8. Admin adjusts yellow/red rows, clicks "Alle bestätigen" for green rows
9. Admin clicks "Mapping übernehmen"
10. OverwriteConfirmDialog (if needed) → confirmed mappings injected into FieldMapperPanel state
11. Admin clicks "Template generieren" in FieldMapperPanel → OPH-33 flow runs as before
12. Admin saves ERP config → field_mappings written to DB (existing behavior)
```

### What Gets Built

**1 new API route:** `POST /api/admin/erp-configs/[configId]/auto-map`
- Reads detected_schema columns from the ERP config's linked output format
- Sends to Claude: column names + full canonical variable list with descriptions (from VARIABLE_GROUPS in field-mapper-panel.tsx)
- Returns `{ mappings: [{ target_column, canonical_field, confidence }] }` — no DB write
- Admin-only auth

**1 new frontend component:** `AutoMappingPanel`
- Inserted into ErpConfigEditor below the output format sample section
- All auto-mapping state is local; pushes result into FieldMapperPanel via callback prop on confirm
- Uses existing shadcn/ui Select, Badge, Button, Skeleton, Alert, Dialog — no new packages

### Data Storage
No new database columns or tables. Auto-mapping result lives in component state only. Confirmed mappings populate the existing `field_mappings` JSONB column via the existing save flow.

### Tech Decisions

| Decision | Reasoning |
|---|---|
| Two-column table with dropdowns | Faster to scan, works on all devices, no extra library |
| Confidence as float from Claude | Natural uncertainty expression; thresholds tunable without code |
| No DB write for auto-mapping result | Admin may discard; only confirmed mappings should persist |
| Reuse FieldMapperPanel state | Zero regression risk — mapper doesn't care how its state was populated |
| Admin-only route | Tenant users never access ERP configs |

---

## QA Test Results

**Tested by:** QA Engineer (code review + static analysis)
**Date:** 2026-03-23
**Status:** NOT READY -- Medium-severity bugs must be fixed

### Acceptance Criteria Results

| AC | Criterion | Result | Notes |
|----|-----------|--------|-------|
| AC-1.1 | "Auto-Mapping starten" button appears after sample upload | PASS | Button renders when `savedOutputFormat.detected_schema.length > 0` |
| AC-1.2 | Button calls API endpoint with column names + canonical fields | PASS | Calls `POST /api/admin/erp-configs/${configId}/auto-map`; API reads detected_schema from DB (better than spec's body-based design) |
| AC-1.3 | Loading indicator shown while Claude processes | PASS | Skeleton rows + spinner text shown during `loading` state |
| AC-1.4 | On completion, mapping result displayed in review table | PASS | Rows rendered in `done` state with full table |
| AC-1.5 | Button disabled with tooltip when no sample uploaded | PASS | `disabled={!hasDetectedSchema}` with TooltipContent explaining why |
| AC-2.1 | Review table shows one row per detected target column | PASS | Maps over all rows from Claude response |
| AC-2.2 | Left cell: target column name (read-only) | PASS | Rendered as read-only `<span>` with mono font |
| AC-2.3 | Right cell: dropdown pre-filled with AI suggestion | PASS | Select component with `value={row.selected_field}` |
| AC-2.4 | Confidence badge: green >= 80%, yellow 50-79%, red < 50% | PASS | `getConfidenceLevel()` thresholds match spec |
| AC-2.5 | Red confidence rows visually highlighted (amber background) | PASS | `bg-amber-50` applied when `level === "red" && !row.confirmed` |
| AC-2.6 | Dropdown lists ALL canonical source fields | PASS | Iterates over all VARIABLE_GROUPS |
| AC-2.7 | "Unmapped" / "-" option available in dropdown | PASS | `__unmapped__` sentinel value mapped to `null` |
| AC-2.8 | Table is scrollable for many columns | PASS | `max-h-[500px] overflow-y-auto` on the table container |
| AC-3.1 | "Alle bestaetigen" button accepts all green rows | PASS | `handleBulkConfirm` filters by `getConfidenceLevel === "green"` |
| AC-3.2 | Yellow and red rows NOT auto-confirmed | PASS | Only green-level rows are toggled |
| AC-3.3 | Confirmed rows visually distinguished (checkmark, faded) | PASS | Green background + Badge with Check icon + "OK" text |
| AC-3.4 | Individual rows confirmable via per-row button or dropdown change | PASS | Both `handleConfirmRow` and `handleFieldChange` set `confirmed: true` |
| AC-4.1 | "Mapping uebernehmen" applies mappings to Field Mapper | PASS | Calls `onApplyMappings` which saves via API, then re-mounts FieldMapperPanel |
| AC-4.2 | "Template generieren" works as before after applying | PASS | No changes to FieldMapperPanel or generation logic |
| AC-4.3 | Overwrite confirmation dialog when Field Mapper has existing mappings | PASS | Dialog shown when `hasExistingMappings` is true |
| AC-4.4 | Admin can cancel and keep existing mappings | PASS | "Abbrechen" button closes dialog without applying |
| AC-5.1 | Error message shown if Claude API fails | PASS | Error state with Alert + retry button |
| AC-5.2 | No suggestion shows as "Unmapped" with red confidence | PASS | Server-side post-processing resets invalid canonical_field to null with confidence 0 |
| AC-5.3 | Drag-and-drop Field Mapper remains available and unchanged | PASS | FieldMapperPanel rendered independently below AutoMappingPanel |

**Score: 22/22 acceptance criteria PASS**

### Edge Case Results

| EC | Scenario | Result | Notes |
|----|----------|--------|-------|
| EC-1 | Sample with 1-2 columns | PASS | Table renders normally for any row count |
| EC-2 | Sample with 30+ columns | PASS | Scrollable container handles large tables |
| EC-3 | Non-German/English column names | PASS | Claude handles multilingual input; lower confidence expected |
| EC-4 | Same canonical field mapped to multiple targets | FAIL | **BUG-1**: AI prompt instruction #3 explicitly forbids this ("Each canonical field can be used at most once"), contradicting this edge case. See bug report below. |
| EC-5 | Re-run auto-mapping after manual edits | PASS | `window.confirm()` dialog shown before re-running |
| EC-6 | XML format sample | PASS | Uses same detected_schema flow regardless of format |
| EC-7 | Claude API slow (> 10 seconds) | FAIL | **BUG-2**: No timeout configured on the API route. See bug report below. |

### Bug Reports

#### BUG-1: AI Prompt Contradicts EC-4 (Same Canonical Field to Multiple Targets)

- **Severity:** Medium
- **Priority:** P2
- **Location:** `/src/app/api/admin/erp-configs/[configId]/auto-map/route.ts`, line 132
- **Description:** The AI prompt instruction #3 says "Each canonical field can be used at most once. If two target columns could map to the same canonical field, pick the better match and leave the other as null." However, edge case EC-4 in the spec explicitly states this should be allowed. The prompt actively prevents the desired behavior.
- **Steps to reproduce:**
  1. Upload a sample file with two columns that should map to the same canonical field (e.g., "Artikel-Nr." and "Hersteller-Nr." both mapping to `this.article_number`)
  2. Run auto-mapping
  3. Claude will only map one of them and leave the other as null
- **Expected:** Both columns should be mapped to the same canonical field
- **Fix suggestion:** Remove instruction #3 from the prompt or change it to allow duplicate canonical field assignments

#### BUG-2: No API Timeout for Claude Request (EC-7 Violation)

- **Severity:** Medium
- **Priority:** P2
- **Location:** `/src/app/api/admin/erp-configs/[configId]/auto-map/route.ts`, lines 256-261
- **Description:** EC-7 specifies "API route uses 30-second timeout and returns an error if exceeded." The Anthropic SDK call has no timeout configuration and no `AbortController` signal. If Claude is slow or hangs, the request will block indefinitely (or until Vercel's function timeout kills it).
- **Steps to reproduce:**
  1. Trigger auto-mapping when Claude API is experiencing latency
  2. Request hangs with no controlled timeout or error message
- **Expected:** API should abort after 30 seconds and return a meaningful error
- **Fix suggestion:** Add `signal: AbortSignal.timeout(30_000)` to the Anthropic SDK call or use an `AbortController`, and also export `maxDuration` from the route if needed for Vercel.

#### BUG-3: Umlaut Inconsistency in VARIABLE_GROUPS Descriptions (Cosmetic)

- **Severity:** Low
- **Priority:** P3
- **Location:** `/src/components/admin/auto-mapping-panel.tsx` and `/src/app/api/admin/erp-configs/[configId]/auto-map/route.ts`
- **Description:** The VARIABLE_GROUPS in `auto-mapping-panel.tsx` and the API route use ASCII transliterations for German umlauts (e.g., "Waehrung", "Stueckpreis", "Haendlername"), while `field-mapper-panel.tsx` uses proper umlauts ("Waehrung", "Stueckpreis", "Haendlername"). This means dropdown labels in the auto-mapping review table look different from those in the field mapper.
- **Steps to reproduce:**
  1. Open an ERP config with a detected schema
  2. Run auto-mapping
  3. Compare dropdown descriptions in auto-mapping table vs field mapper below
- **Expected:** Consistent display of German descriptions across all panels
- **Fix suggestion:** Use the same umlaut-containing descriptions as `field-mapper-panel.tsx`. Ideally, extract VARIABLE_GROUPS into a shared constant file to avoid three separate copies diverging.

#### BUG-4: Duplicate Target Column Names Cause React Key Collision and Row Confusion

- **Severity:** Medium
- **Priority:** P2
- **Location:** `/src/components/admin/auto-mapping-panel.tsx`, line 491 (key), lines 270-280 (handleFieldChange)
- **Description:** If the detected schema contains duplicate column names (e.g., two columns both named "Bemerkung"), the table uses `row.target_column` as the React key, causing key collisions. Additionally, `handleFieldChange` and `handleConfirmRow` identify rows by `target_column`, so changing one duplicate row would affect all rows with the same name.
- **Steps to reproduce:**
  1. Upload a sample file that has two columns with identical names
  2. Run auto-mapping
  3. Attempt to change the canonical field for one of the duplicate rows -- both rows update
- **Expected:** Each row should be independently addressable
- **Fix suggestion:** Use the array index as part of the key and use index-based row identification instead of (or in addition to) target_column name

#### BUG-5: VARIABLE_GROUPS Duplicated in Three Files (Maintenance Risk)

- **Severity:** Low
- **Priority:** P3
- **Location:** `auto-mapping-panel.tsx`, `field-mapper-panel.tsx`, `auto-map/route.ts`
- **Description:** The VARIABLE_GROUPS definition is copy-pasted into three separate files. If a new canonical field is added (e.g., a new order property), all three files must be updated in lockstep. This is a maintenance hazard, not a current bug, but increases the risk of divergence (as already seen with the umlaut inconsistency in BUG-3).
- **Fix suggestion:** Extract into a shared `src/lib/canonical-fields.ts` module imported by all three consumers.

### Security Audit (Red Team)

| Check | Result | Notes |
|-------|--------|-------|
| Authentication | PASS | `requirePlatformAdmin()` verifies admin role before any processing |
| Authorization (tenant isolation) | PASS | Admin-only route; no tenant user can access. Config ID validated as UUID before DB query. |
| Rate limiting | PASS | `checkAdminRateLimit(user.id)` applied (60 req/min default) |
| Input validation (configId) | PASS | UUID regex validation before DB query |
| Input validation (request body) | PASS (N/A) | No request body accepted -- all data read from DB |
| SQL injection | PASS | Supabase parameterized queries used throughout |
| Prompt injection via column names | LOW RISK | Column names from detected_schema are interpolated into the Claude prompt. A malicious sample file could inject instructions into the prompt. However, since only platform admins can trigger this and the output is validated via Zod, the practical risk is minimal. The worst case is Claude returning unexpected mappings, which the admin would see and correct in the review table. |
| API key exposure | PASS | `ANTHROPIC_API_KEY` read from env var, not exposed in response |
| Error message information leakage | PASS | Error messages are generic German text; Claude API error messages are passed through but only contain the SDK error, not the API key |
| Response data leakage | PASS | Only returns mapping data, no internal state or credentials |
| CORS / CSRF | PASS | Next.js API routes only accept same-origin requests by default |

### Regression Check

| Related Feature | Status | Notes |
|----------------|--------|-------|
| OPH-28 (Output Format Sample Upload) | No regression | AutoMappingPanel is additive; does not modify sample upload flow |
| OPH-32 (Visual Field Mapper) | No regression | FieldMapperPanel code unchanged; only receives mappings via existing callback |
| OPH-33 (Field Mapper Output / Template Generation) | No regression | Template generation logic untouched |
| OPH-9 (ERP-Mapping-Konfiguration) | No regression | ERP config editor integration is additive |

### Cross-Browser / Responsive Notes

The AutoMappingPanel uses standard shadcn/ui components (Select, Button, Badge, Card, Dialog, Skeleton, Alert) and Tailwind CSS. Based on code review:

- **Desktop (1440px):** Table layout with `max-w-[320px]` dropdowns should render well
- **Tablet (768px):** Table may become cramped; Select dropdowns have no min-width issue since they use shadcn/ui Select
- **Mobile (375px):** The table with 4 columns (target, confidence, dropdown, status) will be tight. The `overflow-y-auto` handles vertical scrolling but there is no horizontal scroll wrapper, which could cause horizontal overflow on very narrow screens. This is a **Low severity** UX concern.

### Summary

| Category | Count |
|----------|-------|
| Acceptance criteria tested | 22 |
| Acceptance criteria passed | 22 |
| Edge cases tested | 7 |
| Edge cases passed | 5 |
| Edge cases failed | 2 |
| Bugs found | 5 |
| -- Critical | 0 |
| -- High | 0 |
| -- Medium | 3 (BUG-1, BUG-2, BUG-4) |
| -- Low | 2 (BUG-3, BUG-5) |

### Production-Ready Decision

**NOT READY** -- 3 Medium bugs should be fixed before deployment:

1. **BUG-1** (P2): AI prompt prevents duplicate canonical field mappings, contradicting EC-4
2. **BUG-2** (P2): No API timeout on Claude request, violating EC-7
3. **BUG-4** (P2): Duplicate column names cause row confusion

Low-severity items (BUG-3, BUG-5) can be addressed post-deployment.
