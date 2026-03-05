# OPH-27: Order File Preview (Click-to-Open)

## Status: Planned
**Created:** 2026-03-05
**Last Updated:** 2026-03-05

## Dependencies
- Requires: OPH-2 (Bestellungs-Upload) — order files stored in Supabase Storage
- Requires: OPH-5 (Bestellprüfung) — order detail page context
- Requires: OPH-21 (E-Mail-Text als Extraktionsquelle) — EmailBodyPanel already displays email body
- Requires: OPH-26 (Order File Download) — signed URL fetching already in place; preview builds on same mechanism

## Problem Statement

On the order detail page, users can see the list of attached files and download them (OPH-26). However, to actually read the content of a document they must download it first and open it in an external application — an unnecessary friction step when the browser can render PDFs natively and plain text inline.

The existing review page (`/orders/[orderId]/review`) already has a `DocumentPreviewPanel` with iframe-based PDF preview. The order detail page has no equivalent.

**The user wants:**
- Click a file row in the "Dateien" card → file opens directly for viewing without leaving the page
- Click the email body section → email text is immediately readable inline
- Download buttons remain available alongside the preview

## User Stories

- As a platform user, I want to click on a PDF file in the order detail page and see it rendered immediately in a preview dialog so I can verify its contents without downloading it.
- As a platform user, I want to click on an Excel file and have it open in a new browser tab so I can inspect the source spreadsheet.
- As a platform user, I want to click on an EML file and have it open in a new browser tab so I can view the raw email.
- As a platform user, I want to click on the "Original E-Mail" section and have the email body text expand immediately (or be more obviously interactive) so I can read it without hunting for the expand control.
- As a platform user, I want the download button to remain available on each file even after I open the preview so I can save a local copy if needed.

## Acceptance Criteria

### File preview dialog
- [ ] **AC-1:** Each file row in the "Dateien" card is clickable (cursor pointer, hover highlight). Clicking opens the file.
- [ ] **AC-2:** For PDF files, clicking opens a Dialog (modal) containing an iframe that renders the PDF using the signed URL. The dialog is large enough to read the document comfortably (full-screen on mobile, wide on desktop).
- [ ] **AC-3:** For non-PDF files (Excel, EML, etc.), clicking opens the file in a new browser tab via the signed URL. No dialog is shown.
- [ ] **AC-4:** The preview dialog has a header showing the filename and two action buttons: "In neuem Tab öffnen" (external link) and a close button (X).
- [ ] **AC-5:** The signed URL is fetched on first click (lazy, same as OPH-26 "Downloads laden"). While the URL is being fetched, a loading spinner is shown on the clicked file row.
- [ ] **AC-6:** If signed URL fetching fails, a toast/error message is shown and no dialog is opened.
- [ ] **AC-7:** For `email_body.txt` specifically, clicking does not open a dialog or new tab — instead it scrolls to and auto-expands the existing "Original E-Mail" collapsible panel below the file list.
- [ ] **AC-8:** The download button on each file row remains functional and independent from the preview interaction.
- [ ] **AC-9:** Only one preview dialog can be open at a time. Opening a second file closes the first.

### Email body panel
- [ ] **AC-10:** The "Original E-Mail" collapsible panel (`EmailBodyPanel`) is expanded by default (not collapsed) so the email text is immediately visible without an extra click.

## Edge Cases

- **User clicks a file before "Downloads laden" was used** — signed URL is fetched on-demand at click time; no prior fetch needed.
- **User clicks a large PDF** — iframe renders progressively; dialog shows loading state from the iframe until the PDF is ready.
- **PDF signed URL has expired** (page open > 1 hour) — iframe shows an error. "In neuem Tab öffnen" button fetches a fresh signed URL.
- **email_body.txt appears in file list but EmailBodyPanel is not rendered** (e.g. logic mismatch) — clicking `email_body.txt` falls back to opening the plain text file in a new tab.
- **Order has only one file** — single-file preview works the same as multi-file.
- **Dialog opened on mobile** — dialog is full-screen or near full-screen; PDF iframe scrolls within it.
- **User closes dialog and re-opens same file** — signed URL is already cached in state from the first open; no second fetch needed.

## Scope Notes

- **No backend changes required.** The `GET /api/orders/[orderId]/preview-url` API already returns signed URLs for all files and is reused as-is.
- **Email body preview stays in `EmailBodyPanel`** — no separate dialog needed; the panel is changed to default-open.
- **The existing `DocumentPreviewPanel`** (review page) is not modified — it is a separate component for a different page layout.
- **Files modified:**
  - `src/components/orders/order-file-list.tsx` — make rows clickable, add per-file loading state, open PDF dialog or new tab
  - `src/components/orders/email-body-panel.tsx` — change default `isOpen` from `false` to `true`, trigger fetch on mount
