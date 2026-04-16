# OPH-58: Split Multi-File ERP Export (Header + Lines CSV)

## Status: Planned
**Created:** 2026-03-25
**Last Updated:** 2026-03-25

## Dependencies
- Requires: OPH-6 (ERP-Export & Download) — extends the existing export mechanism
- Requires: OPH-32 (Visual Field Mapper) — reuses the field mapping concept for two templates
- Requires: OPH-29 (Shared ERP Configurations) — the new format type is added to ERP configs

## Background

Some ERP systems (e.g. mesonic/WinLine) require order data to be imported as **two separate CSV files**:
1. **Auftragskopf** (Order Header) — one row per order with order-level metadata
2. **Positionen** (Order Lines) — one row per line item with article-level data

Both files share a common document number (`Belegnummer`) as a linking key. Unmapped columns use `@` as a placeholder (not blank), and the delimiter is `;` (semicolon). Files are named with a timestamp suffix, e.g. `Auftragskopf_202603250815.csv` and `Positionen_202603250815.csv`.

This cannot be achieved with the existing single-file field mapper (OPH-32/33).

## User Stories

- As a tenant user, I want to download a ZIP archive containing both the Auftragskopf and Positionen CSV files so that I can import the order into my ERP system in one step.
- As a platform admin, I want to configure a "split CSV" ERP format with separate column templates for the header file and the lines file so that any tenant can use it.
- As a tenant user, I want the file names to include a timestamp so that I can distinguish multiple exports.
- As a tenant user, I want unmapped columns in both files to be filled with `@` so that my ERP import does not fail on missing fields.
- As a platform admin, I want to be able to map only the populated fields and leave the rest as `@` so that the configuration effort is minimal.

## Acceptance Criteria

- [ ] A new ERP config format type `split_csv` can be created in the admin ERP config UI.
- [ ] The `split_csv` config has two independent column templates: one for the header file, one for the lines file.
- [ ] **Header file template:** configures a fixed set of column headers (semicolon-delimited). Each column maps to either a fixed value, an extraction field, or `@` (empty placeholder).
- [ ] **Lines file template:** same concept, but each row represents one `line_items` entry. The `Belegnummer` column links to the header (always `1` for single-order export, or sequential for batch).
- [ ] Downloading an order with `split_csv` format produces a `.zip` file containing both CSVs.
- [ ] File names follow the pattern: `Auftragskopf_{YYYYMMDDHHMI}.csv` and `Positionen_{YYYYMMDDHHMI}.csv`.
- [ ] Both files use `;` as delimiter.
- [ ] All columns not explicitly mapped output `@`.
- [ ] The `Position` column in the lines file auto-increments (1, 2, 3…) for each line item.
- [ ] The `Belegnummer` in both files is the same value (e.g. `1`) to enable ERP-side linking.
- [ ] Existing single-file export formats are unaffected.
- [ ] The ZIP download is accessible from the existing order review/export page (same download button, format-aware).

## Concrete Example (from sample files)

**Auftragskopf row (populated fields only):**
```
Belegnummer: 1
Kunde:        202124       ← customer_number from extracted data
Belegdatum:   25.03.2026   ← order_date
Auftragsart:  81           ← fixed value (ERP order type)
Bestellung:   56878        ← order_number from extracted data
All others:   @
```

**Positionen rows (one per line item):**
```
Belegnummer:  1            ← same as header
Position:     1, 2, 3…    ← auto-incremented
Teil:         3916012DU0000 ← article_number
Menge:        1, 4, 2…    ← quantity
All others:   @
```

## Edge Cases

- **Multiple line items:** Each generates one row in Positionen with incrementing Position values.
- **Missing extraction fields:** If `customer_number` is not extracted, the `Kunde` column outputs `@`.
- **Batch export (multiple orders):** Out of scope for MVP. MVP = single order per ZIP download.
- **Column order:** Must match the exact sequence of columns in the template (ERP parsers are position-sensitive).
- **Encoding:** Files must use UTF-8 with BOM (or Latin-1 if the ERP requires it — make encoding configurable per ERP config).
- **Delimiter collision:** If an extracted value contains `;`, it must be quoted or escaped.
- **Empty orders (no line items):** Positionen file is still generated, but with zero data rows (header row only).
- **ZIP naming:** `Export_{Belegnummer}_{timestamp}.zip` or similar — needs to be distinguishable per order.

## Technical Requirements

- ZIP generation client-side (browser) using `jszip` (already used or easily added) OR server-side via API route.
- The ERP config schema for `split_csv` stores two arrays: `header_columns` and `lines_columns`, each being an ordered list of `{ column_name, source_field | fixed_value }`.
- The existing ERP config field mapper UI needs a tab switcher: "Auftragskopf" | "Positionen".
- Supabase: no new tables needed — the `split_csv` config is stored as JSONB in the existing `erp_configs` table.
- Security: same RLS policies as existing ERP configs apply.

---

## Tech Design (Solution Architect)

### Overview

This is primarily a **configuration + export** change. No new pages, no new database tables. The work spans three areas: (1) extending the ERP config data model to store a second column template, (2) updating the ERP config editor UI to show two column builders side-by-side under tabs, and (3) updating the export download logic to produce a ZIP file when the format is `split_csv`.

---

### A) Component Structure

```
ErpConfigEditor (existing — modified)
+-- Format Selector (existing — adds "Split CSV" option)
+-- [When format = split_csv] Tab Switcher (NEW)
|   +-- Tab: "Auftragskopf" (order header)
|   |   +-- CsvColumnBuilder (existing component, reused)
|   |       Column list: order-level fields only
|   |       (order_number, order_date, customer_number, etc.)
|   +-- Tab: "Positionen" (order lines)
|       +-- CsvColumnBuilder (existing component, reused)
|           Column list: items[] fields only
|           (article_number, quantity, unit, description, etc.)
+-- [Existing tabs for settings, test, history — unchanged]

Order Export Download (existing — modified)
+-- Detects format = "split_csv"
+-- Calls existing export API (extended)
+-- Receives ZIP binary instead of CSV text
+-- Browser saves as Export_{ordernumber}_{timestamp}.zip
```

---

### B) Data Model

**No new database tables.** The existing `erp_configs` table stores config as JSONB. We extend the stored data with one additional field:

```
ERP Config (existing fields, unchanged):
- id, name, description
- format: "csv" | "xml" | "json" | "split_csv"  ← "split_csv" added
- column_mappings: [...] ← repurposed as LINES file columns (Positionen)
- separator: ";"
- encoding: "utf-8" / "latin-1"
- empty_value_placeholder: "@"  ← NEW field (default "" for existing, "@" for split_csv)

New field added to erp_configs JSONB:
- header_column_mappings: [...]  ← NEW — column list for AUFTRAGSKOPF file
  Each entry: { column_name, source_field | fixed_value, transformations }
```

The existing `column_mappings` array is reused for the Positionen (lines) file. The new `header_column_mappings` array is only present when `format = "split_csv"`.

---

### C) Export Flow

```
User clicks "Export" on order review page
  ↓
Frontend calls existing export API: POST /api/orders/{id}/export
  ↓
API detects format = "split_csv"
  ↓
Builds Auftragskopf CSV (1 row: order-level data, using header_column_mappings)
Builds Positionen CSV (N rows: one per line item, using column_mappings)
  ↓
Packages both files into a ZIP archive
  ↓
Returns ZIP binary (Content-Type: application/zip)
  ↓
Browser downloads: Export_{order_number}_{YYYYMMDDHHMI}.zip
```

Inside the ZIP:
- `Auftragskopf_{YYYYMMDDHHMI}.csv`
- `Positionen_{YYYYMMDDHHMI}.csv`

---

### D) Tech Decisions

| Decision | Choice | Why |
|---|---|---|
| ZIP generation | Server-side (existing API route) | Export logic stays centralized and testable; avoids shipping a ZIP library to every browser |
| Second column template | New `header_column_mappings` field in JSONB | No schema migration needed; backward compatible (field simply absent on non-split configs) |
| Empty placeholder | Configurable `empty_value_placeholder` field (default `""`) | Existing configs are unaffected; split_csv configs default to `@` |
| Reuse `CsvColumnBuilder` | Yes, both tabs use the same component | Avoids duplicating complex UI; just changes the field suggestions shown |
| Position auto-increment | `items[].position` source field (already in suggestions) | Already supported by existing column mapper — no special logic needed |

---

### E) New Dependencies

| Package | Purpose |
|---|---|
| `jszip` | Server-side ZIP archive creation (Node.js compatible) |

`jszip` is small (~100KB), well-maintained, works in both Node and browser environments.

---

### F) Files Changed

| File | Change |
|---|---|
| `src/lib/types.ts` | Add `"split_csv"` to `ExportFormat`; add `header_column_mappings` and `empty_value_placeholder` to config types |
| `src/components/admin/erp-config-editor.tsx` | When format = `split_csv`, show tab switcher with two `CsvColumnBuilder` instances |
| `src/lib/erp-export.ts` (or equivalent) | Add split_csv export path: build two CSV strings + ZIP them |
| `src/app/api/orders/[orderId]/export/route.ts` | Return ZIP binary for split_csv format |
| `supabase/migrations/038_oph58_split_csv.sql` | No table changes — only adds a DB comment for documentation (optional) |

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
