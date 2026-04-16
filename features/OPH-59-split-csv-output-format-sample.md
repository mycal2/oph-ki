# OPH-59: Split CSV Output Format Sample Upload

## Status: Planned
**Created:** 2026-03-25
**Last Updated:** 2026-03-25

## Dependencies
- Requires: OPH-28 (Output Format Sample Upload & Confidence Score) — extends the existing upload flow
- Requires: OPH-58 (Split Multi-File ERP Export) — the split_csv format with header_column_mappings
- Requires: OPH-45 (AI-Assisted ERP Field Mapping) — auto-map for the Auftragskopf sample

## Background

OPH-28 allows admins to upload a single sample output file so the system can detect columns, suggest field mappings via AI (OPH-45), and pre-fill the field mapper. However, OPH-58 introduced the `split_csv` format which has **two independent column templates**: Auftragskopf (header) and Positionen (lines).

Currently, the Output Format Sample Upload only pre-fills the **Positionen** column builder (`column_mappings`). The **Auftragskopf** columns (`header_column_mappings`) must be configured manually. This feature adds a second upload slot for the Auftragskopf sample so both templates can be auto-configured from sample files.

## User Stories

- As a **platform admin**, I want to upload a sample Auftragskopf CSV alongside the existing Positionen sample, so that the system can auto-detect and auto-map the header columns too.
- As a **platform admin**, I want the field mapper and AI auto-mapping (OPH-45) to work on the Auftragskopf sample independently from the Positionen sample, so that both templates are pre-filled correctly.
- As a **platform admin**, I want to see which sample file (Auftragskopf or Positionen) is currently assigned when editing a split_csv config, so I know which one I still need to upload.
- As a **platform admin**, I want to replace or delete the Auftragskopf sample independently from the Positionen sample, so I can update one without affecting the other.
- As a **platform admin**, I want the confidence score to cover both Auftragskopf and Positionen required columns, so the tenant user gets a complete picture of export readiness.

## Acceptance Criteria

### Upload & UI
- [ ] When the ERP config format is `split_csv`, the Output Format section shows two upload slots: one for "Auftragskopf" and one for "Positionen".
- [ ] Each upload slot works independently: upload, parse, review schema, save, replace, delete.
- [ ] The parse endpoint accepts an optional `slot` parameter (`header` or `lines`) to indicate which template the sample belongs to.
- [ ] After uploading an Auftragskopf sample, the detected columns are displayed for admin review (same schema preview as OPH-28).
- [ ] Admin can save the Auftragskopf sample; it is stored separately from the Positionen sample (e.g. different storage path or metadata tag).

### Auto-Mapping
- [ ] After saving the Auftragskopf sample, the AI auto-map endpoint (OPH-45) generates field mapping suggestions for header-level fields (order_number, customer_number, order_date, delivery_date, etc.).
- [ ] The field mapper for the Auftragskopf sub-tab is pre-filled with the AI-suggested mappings.
- [ ] The Positionen auto-map flow continues to work as before (unchanged).

### Field Mapper Integration
- [ ] When a new Auftragskopf sample is saved, the detected columns are used to pre-fill the `header_column_mappings` in the CsvColumnBuilder for the Auftragskopf sub-tab.
- [ ] When a new Positionen sample is saved, the detected columns pre-fill the `column_mappings` (existing behavior).
- [ ] Both field mappers can be edited after pre-fill (no lock-in).

### Confidence Score
- [ ] When both samples are assigned, the confidence score combines required columns from both templates: score = (filled required header columns + filled required line columns) / (total required header columns + total required line columns) × 100.
- [ ] If only one sample is assigned, the score covers only that template's required columns.
- [ ] The missing fields gap list in the export dialog distinguishes between header-level and line-level missing fields.

### Non-Split Formats
- [ ] For non-split_csv formats (csv, xml, json), the upload flow remains unchanged (single upload slot, existing behavior).

## Edge Cases

- **Format switch after upload:** If admin uploads both samples and then switches the format from `split_csv` to `csv`, the Auftragskopf sample becomes irrelevant. The system should retain it in storage (in case they switch back) but only use the Positionen sample for mapping and scoring.
- **Only Auftragskopf uploaded:** If only the header sample is uploaded, the Positionen columns must still be configured manually. The confidence score covers only header required fields.
- **Only Positionen uploaded:** Existing behavior — header columns are manual. Score covers only line-level required fields.
- **Same file uploaded to both slots:** No error — the admin may intentionally upload the same sample to test. The system parses and stores each independently.
- **Sample with `@` placeholder values:** When the sample contains `@` as placeholder values (common for Auftragskopf), the parser should treat `@` as empty for the purpose of required-column inference (i.e., columns filled only with `@` are NOT marked as required).

## Technical Requirements

- **Storage:** Both samples stored in Supabase Storage under `tenant-output-formats/{configId}/header-{timestamp}-{filename}` and `tenant-output-formats/{configId}/lines-{timestamp}-{filename}`.
- **Performance:** No additional latency — each upload is independent and sequential.
- **Security:** Same as OPH-28 — platform admin only, rate-limited.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

The key insight: the existing `OutputFormatTab` already does everything needed — parse, preview, save, replace, delete. For OPH-59, we render **two instances** of it (one per slot) inside the split_csv sub-tabs, driven by a new `slot` prop.

```
ErpConfigEditor (existing)
└── Split CSV Tab (existing — OPH-58)
    └── Sub-Tabs: Auftragskopf | Positionen
        ├── Auftragskopf Sub-Tab
        │   ├── OutputFormatTab (slot="header") ← NEW: second upload slot
        │   └── CsvColumnBuilder (header_column_mappings) ← existing
        └── Positionen Sub-Tab
            ├── OutputFormatTab (slot="lines") ← existing tab, now slot-aware
            └── CsvColumnBuilder (column_mappings) ← existing

Non-split formats (CSV, XML, JSON):
└── Output-Format section (unchanged — uses slot="lines" implicitly)
```

For the confidence score display in the export dialog: no UI changes needed. The score number itself changes (combines both slots), but the badge and gap list components are reused as-is.

### Data Model

**Modified: `tenant_output_formats` table**

Add one column:
- `slot` — which template this sample belongs to: `lines` (default, backward-compatible) or `header`

Change the uniqueness constraint from `(erp_config_id)` to `(erp_config_id, slot)`, allowing a maximum of two rows per ERP config: one for each slot.

No new tables required. Existing columns (file_name, file_path, file_type, detected_schema, column_count, required_column_count, field_mappings, etc.) are reused identically for both slots.

**Modified: Confidence score calculation**

When both slots exist, the score becomes:

> score = (filled required header columns + filled required line columns) / (total required header + total required line columns) × 100

The `output_format_missing_columns` JSON on the order is extended to distinguish `header:ColumnName` from `lines:ColumnName` in the gap list, so the export dialog can label them clearly.

### API Routes

All changes are additive — existing non-split flows remain untouched.

| Route | Method | Change |
|-------|--------|--------|
| `/api/admin/erp-configs/[configId]/output-format` | GET | Add `?slot=lines\|header` (default: `lines`) |
| `/api/admin/erp-configs/[configId]/output-format` | POST | Add `slot` field in form data (default: `lines`) |
| `/api/admin/erp-configs/[configId]/output-format` | DELETE | Add `?slot=lines\|header` (default: `lines`) |
| `/api/admin/erp-configs/[configId]/output-format` | PUT | Add `slot` in body (saves field_mappings to the correct row) |
| `/api/admin/erp-configs/[configId]/output-format/parse` | POST | Add `slot` in form data (pass-through, no DB change in parse) |
| `/api/admin/erp-configs/[configId]/output-format/download` | GET | Add `?slot=lines\|header` |
| `/api/admin/erp-configs/[configId]/auto-map` | POST | Add `slot` in body → maps to `column_mappings` or `header_column_mappings` |

No new routes needed. The `slot` param is a filter on all existing routes.

### Tech Decisions

**Why reuse `OutputFormatTab` instead of a new component?**
The upload/parse/preview/save/replace/delete logic is identical for both slots. Adding a `slot` prop is far simpler than duplicating the component, and keeps all upload UX consistent.

**Why a `slot` column instead of separate columns on the existing row?**
A second row (differentiated by `slot`) lets all existing query logic stay unchanged — GET, POST, DELETE, and confidence score calculation all work the same way, just filtered by slot. Adding 8–10 new nullable columns to the existing row would clutter the schema and require touching every existing query.

**Why not a new `tenant_output_formats_header` table?**
Premature. The slot column achieves the same result with zero new tables and minimal migration.

**Backward compatibility**
All existing rows in `tenant_output_formats` have no `slot` value. The migration sets them to `lines` as default. The existing `OutputFormatTab` (without a `slot` prop, or with `slot="lines"`) works exactly as before — no breaking changes for non-split configs.

### Files to Change or Create

| File | Change |
|------|--------|
| `supabase/migrations/041_oph59_output_format_slot.sql` | NEW — add `slot` column, update unique constraint, backfill existing rows to `slot='lines'` |
| `src/components/admin/output-format-tab.tsx` | MODIFIED — accept `slot` prop, pass to all API calls |
| `src/hooks/use-output-format.ts` | MODIFIED — accept `slot` param, add to all fetch/mutate URLs |
| `src/components/admin/erp-config-editor.tsx` | MODIFIED — render OutputFormatTab inside Auftragskopf and Positionen sub-tabs for split_csv; wire `onFormatChange` for header slot |
| `src/lib/confidence-score.ts` | MODIFIED — accept optional header schema + header mappings; combine both slots into single score |
| `src/app/api/admin/erp-configs/[configId]/output-format/route.ts` | MODIFIED — read `slot` param from query/body in GET/POST/DELETE/PUT |
| `src/app/api/admin/erp-configs/[configId]/output-format/parse/route.ts` | MODIFIED — read `slot` from form data (pass-through, no change to parse logic) |
| `src/app/api/admin/erp-configs/[configId]/output-format/download/route.ts` | MODIFIED — read `slot` from query param |
| `src/app/api/admin/erp-configs/[configId]/auto-map/route.ts` | MODIFIED — read `slot` from body, select correct column mapping set |
| `src/lib/types.ts` | MODIFIED — add `slot` field to `TenantOutputFormat` type |

### Dependencies

No new packages required. Everything builds on existing infrastructure.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
