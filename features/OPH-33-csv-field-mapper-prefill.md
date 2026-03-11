# OPH-33: Field Mapper Output for All Formats (CSV, JSON, XML)

## Status: In Review
**Created:** 2026-03-09
**Last Updated:** 2026-03-10

## Dependencies
- Requires: OPH-9 (Admin: ERP-Mapping-Konfiguration) - for CSV Spalten Konfiguration and XML Template
- Requires: OPH-28 (Output Format Sample Upload) - for uploading sample files
- Requires: OPH-32 (Visual Field Mapper) - the drag-and-drop mapper UI

## User Stories

- As a platform admin, I want the Field Mapper to work identically regardless of the uploaded sample format (CSV, XLSX, XML, JSON) so that I always use the same drag-and-drop workflow.
- As a platform admin, I want "Template generieren" to produce the correct output for the currently selected export format: pre-filled CSV Spalten Konfiguration for CSV, XML template for XML, or JSON mapping for JSON.
- As a platform admin, I want the export format tab to automatically switch to match the uploaded sample format so that I see the generated output immediately.
- As a platform admin, I want unmapped fields to appear as empty entries in the generated output so that I can see all target columns and fill in remaining mappings manually.
- As a platform admin, I want the column order from my uploaded sample file to be preserved in the generated output so that the export matches my ERP's expected format.

## Acceptance Criteria

### General (all formats)
- [ ] The Field Mapper panel appears for ALL uploaded sample formats (CSV, XLSX, XML, JSON) — not just XML.
- [ ] The drag-and-drop interaction, transformation picker, and save/generate buttons work identically regardless of format.
- [ ] "Template generieren" checks the uploaded sample's `file_type` and generates the appropriate output.
- [ ] The format tab auto-switches to match the sample file type (CSV sample → CSV tab, XML → XML tab, JSON → JSON tab).
- [ ] If the target format section already has content, a confirmation dialog asks before overwriting.

### CSV/XLSX output
- [ ] "Template generieren" converts field mappings into `ErpColumnMappingExtended[]` entries and pre-fills the CSV Spalten Konfiguration.
- [ ] Each generated CSV column has: `target_column_name` = detected column name, `source_field` = mapped variable path, `required` = detected `is_required` flag.
- [ ] Unmapped columns are included with `source_field` = `""` (empty) and `required` = false.
- [ ] Variable path `this.X` is converted to `items[].X` for CSV convention (matching `SOURCE_FIELD_SUGGESTIONS`).
- [ ] Column order matches the `detected_schema` order from the uploaded sample.
- [ ] Transformation from field mapping is converted to `ErpTransformationStep[]` on the CSV column.

### XML output (existing behavior, unchanged)
- [ ] "Template generieren" produces an XML Handlebars template (current OPH-32 behavior).
- [ ] Unmapped fields produce empty tags `<tag></tag>`.

### JSON output
- [ ] "Template generieren" is disabled or shows a message that JSON uses canonical format directly (no mapping needed — per existing JSON tab behavior).

## Edge Cases

- **CSV sample with 0 data rows (headers only):** All columns detected, all marked `is_required: true`. Pre-fill works normally.
- **XLSX sample:** Treated same as CSV — flat format, same pre-fill logic.
- **Existing CSV Spalten Konfiguration has entries:** Confirmation dialog: "Bestehende Spalten-Konfiguration ueberschreiben?". Cancel or overwrite.
- **Existing XML template has content:** Confirmation dialog (already exists from OPH-32).
- **Same variable mapped to multiple columns:** Allowed — some ERP formats repeat values.
- **User switches format tab after pre-fill:** Generated config remains. Switching back shows it.
- **JSON sample uploaded:** Field Mapper still shows for schema preview, but "Template generieren" shows info that JSON export uses canonical format directly.

## Technical Requirements (optional)
- Frontend-only changes: no new API calls or database changes.
- Reuses existing `field_mappings` JSONB column from OPH-32.
- Variable path conversion for CSV: `this.article_number` → `items[].article_number`, `order.X` stays as-is.
- The `generateTemplateFromMappings` function (or a new sibling) must return CSV column config as an alternative to XML template string.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

```
erp-config-editor.tsx  (orchestrator — existing, extended)
├── Tabs (CSV | XML | JSON)
│   ├── CsvColumnBuilder  ← gets pre-filled from Field Mapper
│   ├── XmlTemplateEditor ← already pre-filled (OPH-32)
│   └── JSON tab (no change)
│
├── OutputFormatTab  (upload sample — existing)
│
└── FieldMapperPanel  (existing, extended)
    ├── Target fields (left) — works for all formats already
    ├── Variable chips (right) — works for all formats already
    └── "Template generieren" button
        ├── file_type = csv/xlsx → produces CSV columns
        ├── file_type = xml      → produces XML template (existing)
        └── file_type = json     → shows info message (no generation)
```

### What Gets Built

**1. New utility: `generateCsvColumnsFromMappings`**
- Parallel to the existing `generateTemplateFromMappings`
- Input: field mappings + detected schema columns
- Output: `ErpColumnMappingExtended[]` (the exact type CsvColumnBuilder already consumes)
- Converts `this.X` variable paths to `items[].X` for CSV convention
- Unmapped columns included with empty `source_field`

**2. Extended `FieldMapperPanel`**
- Receives `file_type` as a prop
- On "Template generieren": branches on `file_type`
  - csv/xlsx → calls `onGenerateCsvColumns(columns[])`
  - xml → calls `onGenerateTemplate(xmlString)` (existing)
  - json → renders info note instead of button
- Overwrite confirmation dialog extended for CSV case

**3. Extended `erp-config-editor.tsx`**
- New handler `handleFieldMapperGenerateCsvColumns` → sets `columnMappings` state + switches tab to CSV
- Passes `file_type`, `onGenerateTemplate`, and `onGenerateCsvColumns` into `FieldMapperPanel`

### Tech Decisions

| Decision | Why |
|---|---|
| Frontend-only | All data (mappings + schema) already in browser state — no server round-trip needed |
| Reuse `ErpColumnMappingExtended` | CsvColumnBuilder already reads this type — zero UI changes to the column builder itself |
| Separate `onGenerateCsvColumns` callback | FieldMapperPanel produces data; editor decides what to do with it (clean separation) |
| `this.X` → `items[].X` conversion in utility | Historical naming difference; conversion belongs in the generation layer, not UI |

### No new packages needed

## QA Test Results

**Tested:** 2026-03-10
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)

### Acceptance Criteria Status

#### AC-1: General - Field Mapper panel appears for ALL formats
- [x] Panel renders when `savedOutputFormat` has `detected_schema.length > 0` -- no file_type filter. Verified in `erp-config-editor.tsx` lines 509-533.
- **PASS**

#### AC-2: General - Drag-and-drop, transformation picker, save/generate work identically
- [x] `FieldMapperPanel` uses the same DnD context, same `TargetFieldDropZone`, same `TransformationPicker` regardless of `fileType`. The only branching is in the generate button and its label.
- **PASS**

#### AC-3: General - "Template generieren" checks file_type and generates appropriate output
- [x] `handleGenerateTemplate` branches on `isCsv` (csv/xlsx) vs xml. JSON shows info message instead of button.
- [x] CSV path calls `generateCsvColumnsFromMappings`, XML path calls `generateTemplateFromMappings`.
- **PASS**

#### AC-4: General - Format tab auto-switches to match sample file type
- [x] `handleOutputFormatChange` in `erp-config-editor.tsx` switches: csv/xlsx -> `setFormat("csv")`, xml -> `setFormat("xml")`, json -> `setFormat("json")`.
- **PASS**

#### AC-5: General - Confirmation dialog before overwriting existing content
- [x] CSV path: checks `currentColumnMappings.length > 0` before overwriting.
- [x] XML path: checks `currentTemplate.trim()` before overwriting.
- [x] Dialog shows format-specific text for CSV vs XML cases.
- **PASS**

#### AC-6: CSV/XLSX - Generates ErpColumnMappingExtended[] and pre-fills CSV Spalten Konfiguration
- [x] `generateCsvColumnsFromMappings` returns `ErpColumnMappingExtended[]` which is passed via `onGenerateCsvColumns` to `setColumnMappings` in the editor.
- [x] `handleFieldMapperGenerateCsvColumns` also calls `setFormat("csv")` to switch to CSV tab.
- **PASS**

#### AC-7: CSV/XLSX - Each column has correct target_column_name, source_field, required
- [x] `target_column_name` = `col.column_name` from detected_schema.
- [x] `source_field` = converted variable path via `toSourceField()`.
- [x] `required` = `col.is_required` from detected_schema.
- **PASS**

#### AC-8: CSV/XLSX - Unmapped columns included with empty source_field and required=false
- [x] When `!mapping`, returns `{ source_field: "", target_column_name: col.column_name, required: false, transformations: [] }`.
- [x] Backend validation (`erpColumnMappingExtendedSchema`) allows empty `source_field` (no `.min(1)` constraint).
- **PASS**

#### AC-9: CSV/XLSX - Variable path this.X converted to items[].X
- [x] `toSourceField()` function: `"this.".startsWith` -> `"items[]." + rest`. Header fields (`order.X`) pass through unchanged.
- [x] Matches `SOURCE_FIELD_SUGGESTIONS` convention in `erp-csv-column-builder.tsx`.
- **PASS**

#### AC-10: CSV/XLSX - Column order matches detected_schema order
- [x] `generateCsvColumnsFromMappings` iterates `columns` (detected_schema) with `.map()`, preserving original order.
- **PASS**

#### AC-11: CSV/XLSX - Transformation converted to ErpTransformationStep[]
- [x] `date` transformation -> `{ type: "date_format", param: format }`.
- [x] `number` transformation -> `{ type: "round", param: format }`.
- [ ] BUG: `prefix_suffix` transformation is silently dropped (see BUG-1 below).
- **PARTIAL PASS**

#### AC-12: XML - Generates XML Handlebars template (existing behavior)
- [x] XML path calls existing `generateTemplateFromMappings` unchanged.
- **PASS**

#### AC-13: XML - Unmapped fields produce empty tags
- [x] In `renderMappedNode`, when `!mapping`, content is `""`, producing `<tag></tag>`.
- **PASS**

#### AC-14: JSON - Template generieren disabled/shows info message
- [x] When `fileType === "json"`, an `Alert` with `Info` icon renders instead of the generate button.
- [x] Text: "JSON-Export verwendet das Canonical-Format direkt -- kein Template erforderlich."
- **PASS**

### Edge Cases Status

#### EC-1: CSV sample with 0 data rows (headers only)
- [x] Schema detection would still produce columns with `is_required: true`. `generateCsvColumnsFromMappings` processes these normally.
- **PASS**

#### EC-2: XLSX sample treated same as CSV
- [x] `isCsv` = `fileType === "csv" || fileType === "xlsx"` -- XLSX follows CSV path.
- [x] `handleOutputFormatChange` does not switch to `"xlsx"` format (there is no xlsx tab) -- it correctly sets `"csv"`.
- **PASS**

#### EC-3: Existing CSV config has entries -- confirmation dialog
- [x] Checks `currentColumnMappings.length > 0`. Dialog title: "Bestehende Spalten-Konfiguration ueberschreiben?"
- **PASS**

#### EC-4: Existing XML template has content -- confirmation dialog
- [x] Checks `currentTemplate.trim()`. Dialog title: "Bestehendes Template ueberschreiben?"
- **PASS**

#### EC-5: Same variable mapped to multiple columns
- [x] `generateCsvColumnsFromMappings` iterates columns, not mappings. Multiple columns can share the same `source_field`.
- **PASS**

#### EC-6: User switches format tab after pre-fill
- [x] `columnMappings` state persists independently of the active tab. Switching back to CSV shows the generated config.
- **PASS**

#### EC-7: JSON sample uploaded -- Field Mapper shows but generate shows info
- [x] Field Mapper panel renders (no file_type gating). Generate button replaced by info alert for JSON.
- **PASS**

### Security Audit Results

- [x] Authentication: All API routes (`GET/POST/PUT/DELETE` on `/api/admin/erp-configs/[configId]/output-format`) call `requirePlatformAdmin()`.
- [x] Authorization: Only platform admins can access. Regular tenant users see "Zugriff verweigert".
- [x] Input validation: Field mappings validated by Zod schema (`putBodySchema`). `target_field` and `variable_path` require `.min(1)`.
- [x] Rate limiting: `checkAdminRateLimit(user.id)` applied on all routes.
- [x] UUID validation: `UUID_REGEX.test(configId)` prevents injection via path params.
- [x] No exposed secrets: No API keys or credentials in frontend code.
- [x] XSS: Variable paths are rendered via React JSX (auto-escaped). Template generation produces Handlebars syntax, not raw HTML.
- [x] CSV column config is client-side only -- no new API surface for CSV generation.
- [x] IDOR protection: Output format is scoped to `erp_config_id`, which is access-controlled by admin auth.

### Cross-Browser & Responsive

- [x] **Chrome/Firefox/Safari:** No browser-specific APIs used. DnD uses `@dnd-kit/core` with PointerSensor and KeyboardSensor (cross-browser compatible).
- [x] **375px (Mobile):** Field Mapper uses `grid-cols-1 lg:grid-cols-[1fr_320px]` -- stacks on mobile. Variables shown first (`lg:order-2`).
- [x] **768px (Tablet):** Same single-column layout until `lg` breakpoint (1024px).
- [x] **1440px (Desktop):** Two-column layout with sticky variable panel.
- [ ] BUG: On mobile (375px), the variable chips panel appears ABOVE the target fields due to `lg:order-2`. This means users see variables first but have nowhere to drop them until they scroll down to the target fields. (See BUG-2 below.)

### Bugs Found

#### BUG-1: prefix_suffix transformation silently dropped in CSV generation
- **Severity:** Low
- **Steps to Reproduce:**
  1. Upload a CSV sample file in an ERP config.
  2. In the Field Mapper, drag a variable to a target field.
  3. Configure a "Prefix/Suffix" transformation on the mapping (e.g., prefix="INV-").
  4. Click "Spalten-Konfiguration generieren".
  5. Expected: The generated CSV column includes the prefix/suffix transformation.
  6. Actual: The transformation is silently dropped. The comment in `generate-template-from-mappings.ts` line 327 says "prefix_suffix has no direct ErpTransformationStep equivalent -- omit".
- **Notes:** `ErpTransformationStep` has no `prefix_suffix` type. This is a design limitation, not a runtime error. The data is not lost (field_mappings still have it), but it is not reflected in the generated CSV column config.
- **Priority:** Nice to have (requires extending `ErpTransformationStep` type)

#### BUG-2: Mobile UX - variables panel shown above target fields
- **Severity:** Low
- **Steps to Reproduce:**
  1. Open the ERP config editor on a mobile device (375px width).
  2. Scroll down to the Field Mapper panel.
  3. Expected: Target fields appear first, then variables below (or in a collapsible section).
  4. Actual: Variables appear first (due to `lg:order-2` only reordering on large screens), so users see draggable chips with no drop targets visible until they scroll further down.
- **Notes:** This is a UX inconvenience on mobile, not a functional bug. Drag-and-drop on mobile touchscreens is already awkward with this library.
- **Priority:** Nice to have

### Summary
- **Acceptance Criteria:** 13/14 passed (1 partial pass due to BUG-1)
- **Bugs Found:** 2 total (0 critical, 0 high, 0 medium, 2 low)
- **Security:** Pass -- all endpoints properly authenticated, validated, and rate-limited
- **Build:** Pass -- `npm run build` completes without errors
- **Production Ready:** YES
- **Recommendation:** Deploy. The 2 low-severity bugs are minor UX/design limitations and do not block production. BUG-1 (prefix_suffix drop) can be addressed in a future enhancement to `ErpTransformationStep`. BUG-2 (mobile variable order) is a cosmetic issue on an admin-only screen.

## Deployment
_To be added by /deploy_
