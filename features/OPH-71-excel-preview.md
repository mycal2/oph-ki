# OPH-71: Excel File Preview in Dokument-Vorschau

## Status: In Progress
**Created:** 2026-04-17
**Last Updated:** 2026-04-17

## Dependencies
- OPH-5: Bestellprüfung & manuelle Korrektur (review page exists)
- OPH-27: Order File Preview — signed URL API already returns Excel files
- OPH-70: Inline Email Body Text Preview — establishes pattern for inline file rendering

## User Stories
- As a tenant user, I want to see the contents of an Excel order file directly in the Dokument-Vorschau panel so that I can verify the raw order data without leaving the review page.
- As a tenant user, I want to navigate between sheets if the Excel file has multiple sheets so that I can check all relevant data.
- As a tenant user, I want to still be able to download the Excel file as a secondary action so that I can open it in my local spreadsheet app when needed.
- As a tenant user, I want to see a loading indicator while the Excel data is being parsed so that I know the preview is working.
- As a tenant user, I want to see a helpful fallback if the Excel file cannot be parsed so that I can still access the data via download.

## Acceptance Criteria
- [ ] Excel files (`.xlsx`, `.xls`) are rendered as a scrollable table in the Dokument-Vorschau panel instead of the generic download fallback.
- [ ] CSV files (`.csv`, `text/csv`) are also rendered as a scrollable table.
- [ ] The table is scrollable both horizontally and vertically without overflowing the panel.
- [ ] If the Excel file has multiple sheets, sheet-name tabs are shown above the table; clicking a tab switches the displayed sheet.
- [ ] A Download button is visible as a secondary action in the card header (next to "In neuem Tab").
- [ ] While the file is being fetched and parsed, a loading spinner with "Excel wird geladen..." is displayed.
- [ ] If parsing fails (corrupt file, unsupported format), an error message is shown with a download fallback button.
- [ ] Empty sheets display a "Keine Daten in diesem Blatt." placeholder.
- [ ] The first row is rendered as a sticky header row (visually distinct, e.g. bold or shaded).
- [ ] Other file types (PDF, image, text) continue to use their existing preview behavior.

## Edge Cases
- Very large Excel files (1000+ rows): table renders but may be slow — loading state must be visible.
- Excel file with a single empty sheet: show placeholder rather than an empty table.
- Excel with many columns (50+): horizontal scroll must work; column widths are reasonable (not stretched to full width).
- Binary `.xls` (old format) vs `.xlsx` (Open XML): both must be handled by SheetJS.
- CSV with non-UTF-8 encoding (e.g. Windows-1252): best-effort rendering with visible output.
- Merged cells in Excel: render as plain text in the first cell; merge spans are not required.
- Excel file where MIME type is `application/octet-stream` but filename ends in `.xlsx`: detection must also check file extension.

## Technical Requirements
- **Library:** SheetJS (`xlsx` npm package) — industry standard, client-side, no server changes needed.
- **Detection:** `mimeType` matches `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-excel`, or `text/csv`; OR filename ends with `.xlsx`, `.xls`, `.csv`.
- **Rendering:** Fetch binary via existing signed URL, parse with SheetJS, render as HTML table.
- **Backend:** Update `preview-url/route.ts` to treat Excel/CSV MIME types as inline-viewable (no forced download disposition).
- **No new API endpoint needed.**

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
