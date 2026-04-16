# OPH-61: Configurable Output Filenames for Split CSV Export

## Status: Planned
**Created:** 2026-03-30
**Last Updated:** 2026-03-30

## Dependencies
- Requires: OPH-58 (Split Multi-File ERP Export) — this feature extends the split CSV export format

## Background

The split CSV export (OPH-58) currently generates filenames with hardcoded prefixes and a timestamp suffix:
- `Auftragskopf_{YYYYMMDDHHMI}.csv`
- `Positionen_{YYYYMMDDHHMI}.csv`
- `Export_{order_number}_{YYYYMMDDHHMI}.zip`

Different ERP systems (and different tenants) have specific naming conventions for their import files. For example, a tenant may need `BelegKopf_{order_number}.csv` or `POS_{customer_number}_{timestamp}.csv`. Additionally, some tenants may prefer to receive the two CSV files as separate downloads rather than a ZIP archive.

All file naming configuration is done by the platform admin within the ERP mapping config (Split CSV tab).

## User Stories

- As a platform admin, I want to define a custom filename template for the Auftragskopf CSV so that the exported file matches the naming convention expected by the tenant's ERP system.
- As a platform admin, I want to define a custom filename template for the Positionen CSV so that both output files follow the tenant's required naming scheme.
- As a platform admin, I want to choose whether the split CSV export is packaged as a ZIP archive or delivered as two separate downloadable CSV files so that the tenant can use whichever delivery format their workflow requires.
- As a platform admin, I want to define a custom ZIP filename template (when ZIP mode is selected) so that the archive is named consistently with the tenant's file management conventions.
- As a tenant user, I want the exported filenames to include dynamic values such as the order number or a timestamp so that each export is uniquely identifiable.

## Acceptance Criteria

### Filename Templates
- [ ] In the ERP config editor (Split CSV tab), there are text input fields for:
  - Auftragskopf filename template (default: `Auftragskopf_{timestamp}`)
  - Positionen filename template (default: `Positionen_{timestamp}`)
- [ ] Filename templates support the following variables enclosed in `{...}`:
  - `{order_number}` — the extracted order number
  - `{timestamp}` — current datetime in `YYYYMMDDHHMI` format
  - `{customer_number}` — the extracted customer number (`sender.customer_number`)
  - `{order_date}` — the extracted order date in `YYYYMMDD` format
- [ ] Variables are resolved at export time using the actual order data.
- [ ] If a variable cannot be resolved (e.g. `order_number` is null), it is replaced with an empty string.
- [ ] The `.csv` file extension is automatically appended — it must not be entered in the template.
- [ ] A live preview of the resolved filename is shown below each input field using sample data (e.g. order number "56878", timestamp "202603300815").

### Output Mode Selection
- [ ] In the ERP config editor (Split CSV tab), there is a selector for output mode:
  - **ZIP archive** (default) — both CSV files packaged in a single `.zip` download
  - **Zwei CSV-Dateien** — both CSV files downloaded separately (two sequential browser downloads)
- [ ] When ZIP mode is selected, an additional input field is shown for the ZIP filename template (default: `Export_{order_number}_{timestamp}`).
- [ ] The ZIP filename template supports the same variables as the CSV filename templates.
- [ ] The `.zip` extension is automatically appended.
- [ ] When "Zwei CSV-Dateien" mode is selected, the ZIP filename field is hidden.

### Export Behavior
- [ ] When a tenant downloads an order in `split_csv` format with ZIP mode, the browser receives a single `.zip` file with the configured name containing both CSV files with their configured names.
- [ ] When a tenant downloads an order in `split_csv` format with "Zwei CSV-Dateien" mode, two separate file downloads are triggered in sequence (Auftragskopf first, then Positionen).
- [ ] Previously saved configs without filename templates fall back to the existing default naming (`Auftragskopf_{timestamp}.csv`, `Positionen_{timestamp}.csv`).

### Configuration Persistence
- [ ] All filename templates and the output mode setting are saved as part of the ERP config (no separate migration required — stored in existing JSONB fields).
- [ ] The settings are visible and editable when reopening an existing ERP config.

## Edge Cases

- **Empty template:** If the admin clears the template field entirely, the system falls back to the default filename pattern.
- **Template with no variables:** A static filename like `BelegKopf` is valid — results in `BelegKopf.csv` (or `BelegKopf_1.csv` if two exports would collide, but collision handling is out of scope for MVP).
- **Unresolvable variable:** `{order_number}` when order_number is null → replaced with empty string → `Auftragskopf_.csv`.
- **Invalid characters in resolved filename:** Characters not valid in filenames (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`) are stripped from resolved filenames before download.
- **Two-file mode on mobile:** Browser download behavior for multiple sequential files may differ by browser — acceptable UX limitation, documented only.
- **ZIP mode — large orders:** ZIP generation is server-side; file size limits remain the same as existing export.

## Technical Requirements

- Filename templates stored as three new JSONB subfields on the ERP config: `header_filename_template`, `lines_filename_template`, `zip_filename_template`
- Output mode stored as a new JSONB subfield: `split_output_mode` with values `"zip"` (default) or `"separate"`
- No database migration required — new subfields are inside the existing `config` JSONB column structure
- Variable interpolation implemented as a shared utility function: `interpolateFilename(template, orderData)`
- Supported in both the export route (`/api/orders/[orderId]/export`) and the test endpoint (`/api/admin/erp-configs/[configId]/test`)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview

This is a **pure configuration + export** extension. No new pages, no database migration, no new packages. The work touches four areas: (1) extend the data model types with four new optional fields, (2) extend the validation schema, (3) add a small utility function for variable interpolation, and (4) update the ERP config editor UI to show the new inputs in the Split CSV tab. The export route and `generateSplitCsvZip` library function receive the templates and use them when naming files.

---

### A) Component Structure

```
ErpConfigEditor (existing — modified)
+-- Split CSV Tab (existing)
|   +-- Output Mode Selector (NEW)
|   |   +-- Radio/Select: "ZIP-Archiv" | "Zwei CSV-Dateien"
|   +-- Auftragskopf Filename Section (NEW)
|   |   +-- Label: "Dateiname Auftragskopf"
|   |   +-- Input: filename template (e.g. "Auftragskopf_{timestamp}")
|   |   +-- Variable chips: clickable [{order_number}] [{timestamp}] [{customer_number}] [{order_date}]
|   |   +-- Preview: "→ Auftragskopf_56878_202603300815.csv"
|   +-- Positionen Filename Section (NEW)
|   |   +-- Label: "Dateiname Positionen"
|   |   +-- Input: filename template
|   |   +-- Variable chips (same as above)
|   |   +-- Preview: "→ Positionen_56878_202603300815.csv"
|   +-- ZIP Filename Section (NEW — only shown when mode = "zip")
|       +-- Label: "Dateiname ZIP-Archiv"
|       +-- Input: ZIP filename template
|       +-- Variable chips
|       +-- Preview: "→ Export_56878_202603300815.zip"
```

The variable chips work like the click-to-insert feature in the XML editor (OPH-31) — clicking a chip appends the variable at the cursor position in the input.

---

### B) Data Model

**No new database tables or columns.** Four new optional fields are added to the ERP config TypeScript types and Zod schema. They are stored as plain columns on the existing `erp_configs` table (which already holds all these fields as top-level columns or in a flexible structure).

```
ERP Config — new optional fields (added to existing ErpConfigAdmin + ErpConfigSavePayload):

split_output_mode         "zip" | "separate"    (default: "zip")
header_filename_template  string                (default: "Auftragskopf_{timestamp}")
lines_filename_template   string                (default: "Positionen_{timestamp}")
zip_filename_template     string                (default: "Export_{order_number}_{timestamp}")
```

All four fields are optional — existing configs without them use the hardcoded defaults that match the current behavior, so no data migration is needed.

---

### C) Filename Interpolation Utility

A new shared function `interpolateFilename(template, orderData)` is added to `src/lib/split-csv-export.ts` (or a shared utility file). It:
- Replaces `{order_number}` with the order's extracted order number (or `""` if null)
- Replaces `{timestamp}` with the current datetime in `YYYYMMDDHHMI` format
- Replaces `{customer_number}` with `sender.customer_number` (or `""` if null)
- Replaces `{order_date}` with the order date in `YYYYMMDD` format (or `""` if null)
- Strips filesystem-unsafe characters (`/ \ : * ? " < > |`) from the result
- Falls back to the default pattern if the template is empty

This function is called both in the export API route (real order data) and in the ERP config test endpoint (sample data).

---

### D) Export Flow Changes

```
Before (current):
  generateSplitCsvZip(orderData, headerMappings, linesMappings, options)
  → always returns { buffer, filename: "Export_{orderNumber}_{timestamp}.zip" }
  → CSV files inside: "Auftragskopf_{timestamp}.csv", "Positionen_{timestamp}.csv"

After (OPH-61):
  generateSplitCsvZip(orderData, headerMappings, linesMappings, options, filenameConfig)
  → filenameConfig = { headerTemplate, linesTemplate, zipTemplate, outputMode }
  → resolves all templates via interpolateFilename()
  → returns { buffer, filename: resolved_zip_name }
  → CSV files inside: resolved header name + resolved lines name

  When outputMode = "separate":
  → Export API returns two separate file responses sequentially
  → Frontend triggers two consecutive downloads
```

The `split_output_mode = "separate"` path requires the frontend export button to handle two response blobs, not one. The API can either return both files in a JSON wrapper (each as base64) or the frontend can make two sequential requests (one for each file). The simpler approach: a single API request returns both CSV contents as JSON with filenames, and the frontend triggers two `<a download>` clicks.

---

### E) Files to Change

| File | Change |
|---|---|
| `src/lib/types.ts` | Add 4 optional fields to `ErpConfigAdmin` and `ErpConfigSavePayload` |
| `src/lib/validations.ts` | Add 4 optional fields to `erpConfigSaveSchema` |
| `src/lib/split-csv-export.ts` | Add `interpolateFilename()`, extend `generateSplitCsvZip()` signature to accept filename config |
| `src/app/api/orders/[orderId]/export/route.ts` | Pass filename config to `generateSplitCsvZip`; handle `separate` mode |
| `src/app/api/admin/erp-configs/[configId]/test/route.ts` | Update test output label to show configured filenames |
| `src/components/admin/erp-config-editor.tsx` | Add 3 new UI sections to the Split CSV tab (output mode, filename inputs, previews) |

---

### F) Tech Decisions

| Decision | Choice | Why |
|---|---|---|
| Store in existing columns | Four new top-level fields on `erp_configs` | No migration needed; backward compatible via optional/nullable; same pattern as `empty_value_placeholder` added in OPH-58 |
| Variable syntax | `{variable_name}` | Already familiar to admins from XML template editor (Handlebars uses `{{}}` there, but `{}` is simpler and unambiguous for filenames) |
| Separate-mode delivery | Two-file JSON response, frontend triggers two downloads | Avoids two round-trips; keeps the API stateless; simple frontend implementation with two blob URLs |
| Live preview | Client-side with hardcoded sample values | Instant feedback without a server round-trip; sample values are fixed ("56878", "20260330", etc.) |
| Unsafe character stripping | Server-side in `interpolateFilename()` | Defense in depth — even if a bad template is saved, the output filename is always safe |

---

### G) New Dependencies

None — no new packages required.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
