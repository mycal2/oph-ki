# OPH-28: Output Format Sample Upload & Confidence Score

## Status: In Progress
**Created:** 2026-03-08
**Last Updated:** 2026-03-08

## Dependencies
- Requires: OPH-6 (ERP-Export & Download) — confidence score sits in the export flow
- Requires: OPH-8 (Admin: Mandanten-Management) — sample format is assigned per tenant
- Requires: OPH-9 (Admin: ERP-Mapping-Konfiguration) — new tab/section added in the ERP config area
- Requires: OPH-4 (KI-Datenextraktion) — extracted order data is the input for scoring

## Summary

Tenants deliver sample files in their desired ERP output format. Admins upload these sample files,
assign them to the correct tenant, and the system reverse-engineers the expected output schema
(columns, data types, required fields). When an order is processed, the system calculates a
**confidence score** — the percentage of required output columns that can be filled from the
extracted order data — and displays this score in the ERP export dialog so users know before
downloading whether the output will be complete.

---

## User Stories

- As a **platform admin**, I want to upload a sample output file (CSV/Excel/XML/JSON) and assign it
  to a tenant, so that the system learns what the tenant's ERP expects.
- As a **platform admin**, I want the system to automatically detect columns and data types from
  the sample file, so I don't have to configure the schema manually.
- As a **tenant user**, I want to see a confidence score on the export dialog before I download the
  file, so I know if the extracted data is complete enough to import into our ERP.
- As a **tenant user**, I want to see which required output columns are missing data, so I can
  decide whether to fix them manually before exporting.
- As a **platform admin**, I want to manage (view, replace, delete) the sample format assigned to
  each tenant, so I can keep the format up to date when tenants change their ERP requirements.

---

## Acceptance Criteria

### Upload & Assignment
- [ ] Admin can navigate to a tenant's ERP config and open an "Output Format" tab/section.
- [ ] Admin can upload a sample file in CSV, Excel (.xlsx), XML, or JSON format (max 10 MB).
- [ ] The system parses the uploaded file and extracts the output schema: column/field names and
      inferred data types (text, number, date).
- [ ] Required columns are inferred from the sample: columns that have non-empty values in sample
      data rows are marked as "required".
- [ ] The detected schema is displayed to the admin for review before saving.
- [ ] Admin can save the sample and assign it to the tenant; only one active sample format per
      tenant at a time.
- [ ] Admin can view the currently assigned sample format for a tenant (file name, upload date,
      detected column count).
- [ ] Admin can replace the existing sample with a new file upload.
- [ ] Admin can delete the assigned sample format.
- [ ] The original uploaded file is stored (Supabase Storage) and can be downloaded for reference.

### Confidence Score Calculation
- [ ] After AI extraction of an order, the system calculates a confidence score for the tenant's
      configured output format.
- [ ] Score = percentage of "required" output columns that have a corresponding non-empty value in
      the extracted order data (mapped via the ERP field mapping config).
- [ ] Score ranges: 0–59% = Low (red), 60–84% = Medium (yellow), 85–100% = High (green).
- [ ] Score is calculated automatically after extraction completes and stored with the order.

### Display
- [ ] The confidence score is shown in the ERP export dialog with a color-coded badge (red/yellow/green).
- [ ] The export dialog shows a list of required output columns that have NO matching extracted data
      (gap list), limited to the top 5 missing fields to avoid information overload.
- [ ] Export is NOT blocked regardless of the confidence score — the user can always proceed.
- [ ] If no sample format is assigned to the tenant, the confidence score section is hidden and
      export works as normal (CSV fallback for trial, configured format for production).
- [ ] If a sample format exists but the ERP field mapping config is not yet complete, a note is
      shown: "Configure field mapping to enable scoring."

---

## Edge Cases

- **Unsupported file content:** If an uploaded file has no parseable column headers (e.g., a
  binary Excel with merged cells only), show a clear error and ask the admin to upload a cleaner
  sample.
- **No data rows in sample:** If the uploaded file has only a header row and no data rows, all
  columns are treated as potentially required (conservative approach) and a warning is shown.
- **Multiple sheets in Excel:** Only the first sheet is parsed; a tooltip informs the admin.
- **Large XML/JSON files:** Parsing is limited to the first 100 records; schema is derived from
  the union of all fields seen across those records.
- **Schema drift:** If the tenant updates their ERP system and the old sample is no longer valid,
  the admin can re-upload. There is no automatic drift detection.
- **Partial extraction:** If extraction only succeeded partially (e.g., chunked extraction with
  some failures), the confidence score is calculated on the available extracted data with a note
  that the score may be lower than actual.
- **No ERP mapping configured:** Score cannot be calculated without a field mapping; score
  section shows a configuration prompt instead of a score.
- **Trial mode tenants:** For trial tenants, CSV is always the fallback export. The confidence
  score is still shown if a sample format has been uploaded, giving the admin a preview of
  production readiness.

---

## Technical Requirements

- **Performance:** Schema extraction from uploaded sample must complete in < 5 seconds for files
  up to 10 MB.
- **Storage:** Sample files stored in Supabase Storage under `tenant-output-formats/{tenantId}/`.
- **Security:** Only platform admins can upload, modify, or delete tenant output format samples.
- **Data retention:** Sample files follow the same retention rules as other tenant config data
  (OPH-12).
- **No re-extraction needed:** Confidence score is recalculated from existing extracted data when
  the output format sample is updated — no new AI call required.

---

## Out of Scope

- Automatic field mapping suggestion based on the sample format (future feature).
- Tenant users uploading their own sample formats (admin only for now).
- Multi-format support per tenant (one active sample format per tenant).
- Real-time ERP import validation (we validate format coverage, not ERP business rules).

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

```
Admin: ERP Config Page (/admin/erp-configs/[tenantId])
└── ErpConfigEditor (existing — gains new tab)
    ├── [existing tabs: CSV Builder, XML Template, etc.]
    └── NEW: OutputFormatTab
        ├── OutputFormatUploader (file dropzone, upload button)
        ├── OutputFormatSchemaPreview (detected columns table with required flags)
        │   └── column rows: name | inferred type | required?
        ├── OutputFormatSummaryCard (current format: name, date, column count)
        └── OutputFormatActions (Replace / Delete / Download original)

Order Export Flow (existing export-dialog.tsx — gains new section)
└── ExportDialog (existing)
    ├── [existing: format selector, preview panel]
    └── NEW: ConfidenceScoreSection
        ├── ConfidenceScoreBadge (color-coded %, red/yellow/green)
        └── MissingFieldsList (top 5 required columns with no data)
```

### Data Model

**New table: `tenant_output_formats`**
- `tenant_id` — which tenant this belongs to (one active row per tenant)
- `file_name` — original filename as uploaded
- `file_path` — path in Supabase Storage (`tenant-output-formats/{tenantId}/filename`)
- `file_type` — csv / xlsx / xml / json
- `detected_schema` — JSON array of `{ column_name, data_type, is_required }`
- `column_count` — total columns detected
- `required_column_count` — number of required columns
- `uploaded_at` — timestamp
- `uploaded_by` — admin user ID

**Modified: `orders` table — two new columns:**
- `output_format_confidence_score` — integer 0–100 (null if no format assigned)
- `output_format_missing_columns` — JSON array of missing column names (for gap list)

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/output-formats/[tenantId]/parse` | POST | Upload file, parse schema, return preview (no save) |
| `/api/admin/output-formats/[tenantId]` | GET | Get current format for tenant |
| `/api/admin/output-formats/[tenantId]` | POST | Save confirmed schema + upload to Storage |
| `/api/admin/output-formats/[tenantId]` | DELETE | Remove format + delete file from Storage |
| `/api/admin/output-formats/[tenantId]/download` | GET | Download original sample file |

**Modified existing routes:**
- `/api/orders/[orderId]/extract` — trigger score calculation after extraction
- `/api/orders/[orderId]/export/preview` — include score + missing columns in response

### Tech Decisions

**File parsing (server-side only):**
- CSV — built-in string splitting; delimiter auto-detected (comma or semicolon)
- Excel — existing `xlsx` library (already installed)
- JSON — native `JSON.parse`, union of fields across first 100 records
- XML — new dependency `fast-xml-parser` (lightweight, ~50KB)

**Schema extraction logic:**
- Required = column had at least one non-empty value in any data row
- No data rows → all columns marked required (conservative) + warning
- Excel: first sheet only; XML/JSON: first 100 records, union of all fields

**Confidence score calculation:**
- Runs after AI extraction completes (inside extract API route)
- For each required output column → look up ERP field mapping → check if extracted value is non-empty
- Score = (columns with non-empty mapped values) / (total required columns) × 100
- Stored on the order record; recalculated when format changes (no new AI call)

**Storage:**
- Supabase Storage bucket: `tenant-output-formats`
- Path: `{tenantId}/{timestamp}-{filename}`
- RLS: platform admins only

### Dependencies

| Package | Purpose |
|---------|---------|
| `fast-xml-parser` | Parse XML sample files server-side |

### Files Changed or Created

| File | Change |
|------|--------|
| `src/components/admin/output-format-tab.tsx` | NEW — admin upload/manage UI |
| `src/components/admin/output-format-schema-preview.tsx` | NEW — detected schema table |
| `src/components/orders/export/confidence-score-section.tsx` | NEW — score badge + gap list |
| `src/components/admin/erp-config-editor.tsx` | MODIFIED — add Output Format tab |
| `src/components/orders/export/export-dialog.tsx` | MODIFIED — add confidence score section |
| `src/app/api/admin/output-formats/[tenantId]/parse/route.ts` | NEW |
| `src/app/api/admin/output-formats/[tenantId]/route.ts` | NEW (GET, POST, DELETE) |
| `src/app/api/admin/output-formats/[tenantId]/download/route.ts` | NEW |
| `src/app/api/orders/[orderId]/extract/route.ts` | MODIFIED — trigger score calc |
| `src/app/api/orders/[orderId]/export/preview/route.ts` | MODIFIED — include score |
| DB migration | NEW table `tenant_output_formats`, 2 new columns on `orders` |

## Frontend Implementation

### New Files Created
- `src/components/admin/output-format-tab.tsx` — Admin upload/manage UI (upload dropzone, schema preview, replace/delete/download actions)
- `src/components/admin/output-format-schema-preview.tsx` — Detected schema table (column name, data type, required flag)
- `src/components/orders/export/confidence-score-section.tsx` — Color-coded confidence score badge, progress bar, missing fields list
- `src/hooks/use-output-format.ts` — Hook for output format CRUD (parse, save, delete, fetch)

### Modified Files
- `src/lib/types.ts` — Added `TenantOutputFormat`, `OutputFormatParseResponse`, `ConfidenceScoreData`, and related types; extended `ExportPreviewResponse` with `confidenceScore`
- `src/components/admin/erp-config-editor.tsx` — Added Output Format section below the main config editor
- `src/components/orders/export/export-dialog.tsx` — Added confidence score section between preview and download button
- `src/components/orders/export/index.ts` — Re-exported `ConfidenceScoreSection`

## Backend Implementation

### New Files Created
- `src/lib/output-format-parser.ts` — File parsing utility for CSV, XLSX, XML, JSON; auto-detects delimiters, infers data types and required columns
- `src/lib/confidence-score.ts` — Confidence score calculator; compares required output columns against extracted data via ERP field mappings
- `src/app/api/admin/output-formats/[tenantId]/route.ts` — GET/POST/DELETE for output format CRUD with optimistic locking
- `src/app/api/admin/output-formats/[tenantId]/parse/route.ts` — POST for file parsing preview (no save)
- `src/app/api/admin/output-formats/[tenantId]/download/route.ts` — GET for original sample file download
- `supabase/migrations/024_oph28_output_format_confidence_score.sql` — DB migration: `tenant_output_formats` table + 2 new columns on `orders`

### Modified Files
- `src/app/api/orders/[orderId]/extract/route.ts` — Triggers confidence score calculation after successful extraction
- `src/app/api/orders/[orderId]/export/preview/route.ts` — Includes confidence score data in preview response
- `src/lib/validations.ts` — Added `outputFormatFileTypeSchema`

### New Dependency
- `fast-xml-parser` — XML sample file parsing

### Key Design Decisions
- **Optimistic locking**: Version column on `tenant_output_formats` prevents concurrent admin overwrites (409 conflict)
- **Score recalculation**: When output format is saved/updated, scores are recalculated for orders in "extracted"/"approved" status only
- **Score on delete**: Clearing format also clears confidence scores from current orders
- **Non-blocking**: Confidence score errors never fail the extraction or export preview flow

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
