# OPH-43: Sample CSV Download for Article Import

## Overview
**Status:** In Review
**Created:** 2026-03-21
**Priority:** P2

## Problem
Manufacturer users who want to import their article catalog don't know which columns the CSV/Excel file must contain. They currently have to guess or look up the column names by trial and error.

## Solution
Add a "Muster-CSV herunterladen" (Download Sample CSV) button to the article catalog import area. Clicking it immediately downloads a ready-made CSV file with the correct column headers and two example rows, so users can fill it in and upload directly.

## User Stories

1. **As a manufacturer user**, I want to download a sample CSV so I know exactly which columns to include when preparing my article import file.
2. **As a manufacturer user**, I want the sample to contain example rows so I can see the expected data format before filling in my own data.
3. **As a manufacturer user**, I want the sample file to open correctly in Excel (German locale) without encoding issues.

## Acceptance Criteria

### AC-1: Download Trigger
- [ ] A "Muster herunterladen" button is visible on the article catalog page
- [ ] The button is placed near the import button (logical grouping)
- [ ] Clicking the button immediately triggers a file download with no dialog

### AC-2: File Format
- [ ] File is named `artikelstamm-muster.csv`
- [ ] File is semicolon-separated (`;`) to match existing export and be Excel-compatible in German locale
- [ ] File uses UTF-8 with BOM (`\uFEFF`) so Excel opens it without encoding issues

### AC-3: File Content
- [ ] First row contains all column headers:
  `Herst.-Art.-Nr.;Artikelbezeichnung;Kategorie;Farbe / Shade;Verpackungseinheit;Groesse 1;Groesse 2;Ref.-Nr.;GTIN / EAN;Suchbegriffe / Aliase`
- [ ] At least two example rows with realistic dental product data
- [ ] Example rows demonstrate optional fields (some populated, some empty) so users understand which are required

### AC-4: Required vs Optional Columns
- [ ] The sample clearly shows that `Herst.-Art.-Nr.` and `Artikelbezeichnung` are the only required columns (others may be empty)
- [ ] All other columns are shown as optional by leaving some empty in example rows

## Edge Cases

- **EC-1:** Button must work even when the article list is empty (no catalog yet) — download is always available
- **EC-2:** No server request needed — the file content is static/generated client-side, no API call required
- **EC-3:** Button must not trigger import dialog — it is a separate action

## Sample File Content

```
Herst.-Art.-Nr.;Artikelbezeichnung;Kategorie;Farbe / Shade;Verpackungseinheit;Groesse 1;Groesse 2;Ref.-Nr.;GTIN / EAN;Suchbegriffe / Aliase
12345;Komposit Venus Pearl A2;Komposit;A2;10 Stk.;4g;;VP-A2;4012239123456;Venus, Venus Pearl, Heraeus
67890;Adhäsiv iBOND Universal;Adhäsiv;;;5ml;;IB-UNI;;iBOND, i-Bond, Adhäsiv Universal
```

## Implementation Notes

- No new API route needed — generate and trigger download purely in the browser using a Blob + anchor click
- Column headers in the sample must match the `COLUMN_MAP` in `src/lib/article-import.ts`
- Reuse the same semicolon-separated format as the existing export (`src/app/api/articles/export/route.ts`)

## Dependencies
- Requires: OPH-39 (Manufacturer Article Catalog) — for context and placement in the UI
