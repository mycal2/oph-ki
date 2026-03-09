# OPH-33: Field Mapper Output for All Formats (CSV, JSON, XML)

## Status: Planned
**Created:** 2026-03-09
**Last Updated:** 2026-03-09

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
_To be added by /qa_

## Deployment
_To be added by /deploy_
