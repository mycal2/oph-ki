# OPH-60: Fixed Value Column Mapping in ERP Config

## Status: In Review
**Created:** 2026-03-30
**Last Updated:** 2026-03-30

## Dependencies
- Requires: OPH-9 (Admin: ERP-Mapping-Konfiguration) — extends the column mapping data model
- Requires: OPH-58 (Split Multi-File ERP Export) — primary use case is split_csv Auftragskopf columns
- Requires: OPH-6 (ERP-Export & Download) — fixed values must be written to exported files

## Background

The `ErpColumnMappingExtended` type currently maps each output column to a canonical extraction field (e.g. `order.order_number`). Some ERP systems (e.g. mesonic/WinLine) require certain columns to always contain a **fixed constant value** regardless of what is in the order — for example `Auftragsart` must always be `81`, or `Waehrung` must always be `EUR`.

Currently there is no way to configure this without abusing the `default` transformation as a workaround. A first-class `fixed_value` concept is needed.

## User Stories

- As a **platform admin**, I want to configure a column mapping as a fixed value (e.g. always output `81`) so that ERP-required constant fields are filled correctly without depending on extracted order data.
- As a **platform admin**, I want to select "Fester Wert" as the source type for a column in the CsvColumnBuilder so that I can distinguish fixed values from dynamic extraction fields.
- As a **platform admin**, I want to enter the fixed value as free text so that I can set any constant string or number required by the ERP system.
- As a **tenant user**, I want fixed-value columns to always appear in the export output with the configured value, even if the order data is incomplete.

## Acceptance Criteria

### Configuration UI
- [ ] The CsvColumnBuilder row has a **source type toggle/select**: "Extraktion" (dynamic from order data) or "Fester Wert" (fixed constant).
- [ ] When "Fester Wert" is selected, the canonical field input is hidden and replaced with a text input for the fixed value.
- [ ] When "Extraktion" is selected, the existing canonical field input and transformation editor are shown (unchanged behavior).
- [ ] The fixed value is saved as part of the `ErpColumnMappingExtended` record.
- [ ] The CsvColumnBuilder correctly initializes existing rows: if a row has a fixed value set, it shows the "Fester Wert" mode.

### Export Output
- [ ] When exporting (CSV, split_csv), a column with a fixed value always outputs that fixed value, regardless of the order's extracted data.
- [ ] Fixed value columns are NOT treated as missing/unmapped — they are never replaced by the `empty_value_placeholder` (e.g. `@`).
- [ ] Fixed values are written as-is (no transformations applied to fixed values).

### Edge Cases
- [ ] A fixed value of `""` (empty string) is valid and outputs an empty cell (not the placeholder).
- [ ] A fixed value column is never marked as "required" for validation purposes — it can always be filled.
- [ ] Existing column mappings without a fixed_value field continue to work (backward-compatible default: "Extraktion" mode).

## Edge Cases

- **Switch from Extraktion to Fester Wert:** Clears the source_field and transformation steps. Switch back resets to an empty source_field.
- **Auto-mapping:** The AI auto-map endpoint maps columns to canonical fields. Fixed-value columns are not auto-mapped — they are configured manually by the admin.
- **Confidence score:** Fixed-value columns are always considered "filled" for confidence score purposes (score does not penalize for them).
- **XML export:** Fixed values should also work in XML template variable substitution — a column configured as fixed value outputs its value in place of the variable.

## Technical Requirements

- **No migration needed:** `fixed_value` is stored as a new optional field inside the existing `column_mappings` JSONB column — no schema change required.
- **Backward compatibility:** Existing mappings without `fixed_value` continue to behave as before (treated as "Extraktion" mode).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results

**Tested:** 2026-03-30
**App URL:** http://localhost:3003
**Tester:** QA Engineer (AI)

### Implementation Status

OPH-60 is only **partially implemented**. The backend/type layer has been scaffolded (type field, Zod validation, export logic in `erp-transformations.ts`), but the **UI has not been built at all**. The CsvColumnBuilder component (`src/components/admin/erp-csv-column-builder.tsx`) contains zero references to `fixed_value` or "Fester Wert". This means the feature cannot be used end-to-end.

### Acceptance Criteria Status

#### AC-1: Configuration UI -- Source type toggle/select
- [ ] FAIL: The CsvColumnBuilder has NO source type toggle. There is no way to select "Extraktion" vs "Fester Wert" in the UI.

#### AC-2: Configuration UI -- "Fester Wert" hides canonical field, shows text input
- [ ] FAIL: Not implemented. The canonical field input is always shown. No text input for fixed value exists.

#### AC-3: Configuration UI -- "Extraktion" shows existing fields (unchanged)
- [x] PASS: The existing "Extraktion" behavior works as before since no changes were made to it.

#### AC-4: Configuration UI -- Fixed value saved in ErpColumnMappingExtended
- [x] PASS (backend only): The `fixed_value` field exists on `ErpColumnMappingExtended` type and the Zod schema validates it. However, the UI never writes this field, so it cannot be tested end-to-end.

#### AC-5: Configuration UI -- Existing rows with fixed_value show "Fester Wert" mode
- [ ] FAIL: Not implemented in UI. If a mapping with `fixed_value` were loaded from the database, the CsvColumnBuilder would ignore it and show it as a regular "Extraktion" row.

#### AC-6: Export Output -- Fixed value always output in CSV/split_csv
- [x] PASS (backend only): `getTransformedValue()` correctly returns `mapping.fixed_value!` when `isFixedValueMapping()` is true. This works for both `generateCsvContent()` and `generateSplitCsvZip()`.

#### AC-7: Export Output -- Fixed value columns not replaced by empty_value_placeholder
- [ ] BUG: The `buildCsvRow()` function in `split-csv-export.ts` (line 33) applies the empty placeholder when `raw === ""`. A fixed-value column with `fixed_value: ""` would have `getTransformedValue` return `""`, and then `buildCsvRow` would replace it with the placeholder. This violates the requirement. The regular `generateCsvContent()` in `erp-transformations.ts` does NOT have this bug (it does not use a placeholder at all).

#### AC-8: Export Output -- No transformations applied to fixed values
- [x] PASS: `getTransformedValue()` returns `fixed_value` directly before any transformation logic runs.

### Edge Cases Status

#### EC-1: Fixed value of "" (empty string) outputs empty cell, not placeholder
- [ ] BUG: In `split-csv-export.ts`, `buildCsvRow()` replaces empty strings with the `emptyValuePlaceholder`. Fixed-value columns with `fixed_value: ""` would be incorrectly replaced.

#### EC-2: Fixed value column never marked as "required" for validation
- [ ] BUG: `validateRequiredFields()` does not check for `isFixedValueMapping()`. If a fixed-value column is marked as `required: true`, the validation would still try to resolve the `source_field` and could report a false error because `source_field` may be empty for fixed-value columns.

#### EC-3: Backward compatibility -- existing mappings without fixed_value
- [x] PASS: `isFixedValueMapping()` checks for `undefined` and `null`, so existing mappings without the field default to "Extraktion" mode correctly.

#### EC-4: Switch from Extraktion to Fester Wert clears source_field
- [ ] FAIL: Not implemented. No toggle exists in the UI.

#### EC-5: Auto-mapping does not auto-map fixed-value columns
- [x] PASS: The auto-map endpoint (`auto-map/route.ts`) maps columns based on the output format schema, not on existing mappings. Fixed-value columns are manual-only by nature. No issue here.

#### EC-6: Confidence score treats fixed-value columns as "filled"
- [ ] BUG: `confidence-score.ts` does not import or call `isFixedValueMapping()`. The `checkMappingHasValue()` function always checks `source_field` to resolve a value. A fixed-value column with an empty or irrelevant `source_field` would be incorrectly penalized as "missing" in the confidence score.

#### EC-7: XML export -- fixed value works in default XML template
- [x] PASS: The default XML renderer in `generateXmlContent()` calls `getTransformedValue()` per mapping, which correctly returns the fixed value.

#### EC-8: XML export -- fixed value works in Handlebars template
- [ ] NOT TESTABLE: Handlebars templates use `{{order.field}}` syntax and render directly from order data context, not from column mappings. Fixed-value columns cannot be injected into Handlebars-rendered XML because the template does not go through `getTransformedValue()`. This is a design gap.

### Security Audit Results
- [x] Authentication: The CsvColumnBuilder is only accessible within the admin ERP config editor, which is behind platform admin auth.
- [x] Authorization: Column mappings are stored per ERP config, which is admin-managed. No cross-tenant access possible.
- [x] Input validation: The Zod schema limits `fixed_value` to 500 characters max and validates it as a nullable optional string.
- [x] No secrets exposed: No sensitive data involved.
- [x] XSS: Fixed values pass through `escapeCsvField()` or `escapeXml()` before output, preventing injection in exports.

### Bugs Found

#### BUG-1: CsvColumnBuilder UI not implemented for OPH-60
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Go to Admin > ERP Configurations > Edit any config
  2. Open the CSV column builder
  3. Expected: Each column row has a toggle to switch between "Extraktion" and "Fester Wert"
  4. Actual: No toggle exists. Only the canonical field input is shown. There is no way to configure a fixed value through the UI.
- **Priority:** Fix before deployment
- **Files:** `src/components/admin/erp-csv-column-builder.tsx`

#### BUG-2: split_csv buildCsvRow replaces empty fixed values with placeholder
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Configure a column mapping with `fixed_value: ""` (empty string) via direct DB edit
  2. Export an order using split_csv format
  3. Expected: The column cell is empty
  4. Actual: The column cell contains the `emptyValuePlaceholder` (e.g. `@`)
- **Priority:** Fix before deployment
- **File:** `src/lib/split-csv-export.ts` line 33

#### BUG-3: validateRequiredFields does not skip fixed-value columns
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Configure a column with `fixed_value: "81"` and `required: true` via direct DB edit
  2. Trigger export validation
  3. Expected: No validation error because fixed-value columns are always filled
  4. Actual: Validation checks `source_field` (which may be empty), potentially reporting a false error
- **Priority:** Fix before deployment
- **File:** `src/lib/erp-transformations.ts` line 296-326

#### BUG-4: Confidence score does not recognize fixed-value columns as filled
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Configure a column with `fixed_value: "EUR"` via direct DB edit
  2. View the confidence score on the order review page
  3. Expected: The column is counted as "filled" in the confidence calculation
  4. Actual: `checkMappingHasValue()` checks `source_field` instead of recognizing it as a fixed-value column, so it may be penalized
- **Priority:** Fix before deployment
- **File:** `src/lib/confidence-score.ts` line 115-151

#### BUG-5: Handlebars XML templates cannot use fixed values
- **Severity:** Low
- **Steps to Reproduce:**
  1. Create an ERP config with XML format and a Handlebars template
  2. Configure a column with a fixed value
  3. Expected: The fixed value appears in the rendered XML
  4. Actual: Handlebars templates render from the order data context directly, not through `getTransformedValue()`. Fixed values for columns not represented in the Handlebars template are silently dropped.
- **Priority:** Fix in next sprint (design decision needed)
- **File:** `src/lib/erp-transformations.ts` line 233-249

### Cross-Browser / Responsive Testing
- Not applicable: The UI component is not implemented, so there is nothing to test visually.

### Summary
- **Acceptance Criteria:** 3/8 passed (and 2 of those 3 are backend-only)
- **Bugs Found:** 5 total (1 critical, 3 medium, 1 low)
- **Security:** Pass -- no security issues found
- **Production Ready:** NO
- **Recommendation:** The UI is the primary blocker. BUG-1 (critical) must be built first, then BUG-2, BUG-3, and BUG-4 must be fixed before deployment. BUG-5 is a design gap that can be addressed later.

## Deployment
_To be added by /deploy_
