# OPH-70: Inline Email Body Text Preview in Dokument-Vorschau

## Status: In Progress
**Created:** 2026-04-16
**Last Updated:** 2026-04-16

## Dependencies
- OPH-5: Bestellprüfung & manuelle Korrektur (review page exists)
- OPH-27: Order File Preview — signed URL API already returns `email_body.txt`

## User Stories
- As a tenant user, I want to read the email body directly in the Dokument-Vorschau panel so that I can see the full email context without leaving the review page.
- As a tenant user, I want to still download the email body as a file so that I can save or forward it when needed.
- As a tenant user, I want the email body text to be scrollable so that I can read long emails without disrupting the rest of the review layout.

## Acceptance Criteria
- [ ] When `email_body.txt` is one of the order files, its text content is rendered inline in the Dokument-Vorschau panel (not offered only as a download).
- [ ] The text is displayed in a scrollable, monospace or readable block that fits within the panel height.
- [ ] A download button remains visible as a secondary action alongside the "In neuem Tab" button.
- [ ] If the text content fails to load (network error), an error message is shown with a download fallback.
- [ ] Other file types (non-text) continue to use the existing download fallback.
- [ ] The tab/file selector still works correctly when `email_body.txt` is one of multiple files.

## Edge Cases
- Very long email bodies (thousands of lines): must scroll without breaking layout.
- Empty `email_body.txt` (0 bytes): show a subtle "Kein E-Mail-Text vorhanden." placeholder.
- Non-UTF-8 encoding edge case: render best-effort using the browser's default decoding.
- `email_body.txt` is the only file: no file tabs shown, text preview fills the panel.
- Text content fetch fails (signed URL expired): show error alert with download link as fallback.

## Technical Requirements
- Detection: `mimeType === "text/plain"` or `filename === "email_body.txt"` (either condition triggers inline rendering).
- Fetch the text via the existing signed URL (no new API endpoint needed).
- Use a `useEffect` triggered on `activeFile` change to fetch the text content.
- Render in a `<pre>` or `<div>` with `whitespace-pre-wrap` and overflow-y scroll.
- Keep download button (secondary) in the card header alongside "In neuem Tab".

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
