# OPH-26: Order File Download

## Status: Deployed
**Created:** 2026-03-05
**Last Updated:** 2026-03-05

## Dependencies
- Requires: OPH-2 (Bestellungs-Upload) — order files are stored in Supabase Storage
- Requires: OPH-5 (Bestellprüfung) — order detail page where files are displayed
- Requires: OPH-1 (Auth) — signed URLs are only generated for authenticated, authorized users

## Problem Statement

Users can upload files (PDF, Excel, EML) as part of an order, and see them listed on the order detail page. However, there is no way to download the original files from the UI — once uploaded, the files are inaccessible unless the user has direct storage access.

This creates friction when a user needs to re-examine the original file, share it with a colleague, or verify the source data against the extracted order data.

## User Stories

- As a platform user, I want to download the original order files (PDF, Excel, EML) from the order detail page so that I can re-examine the source document if needed.
- As a platform user, I want download links to appear on demand rather than automatically so that the page loads fast and signed URLs are only generated when needed.
- As a platform user, I want each file to have its own download button so that I can download individual files without downloading all of them.
- As a platform administrator, I want download access to be gated behind authentication and tenant authorization so that order files cannot be accessed by unauthorized users.
- As a platform user, I want the download to use the original filename so that the downloaded file is easy to identify.

## Acceptance Criteria

- [ ] **AC-1:** The order file list shows a "Downloads laden" button in the card header when no URLs have been fetched yet.
- [ ] **AC-2:** Clicking "Downloads laden" fetches signed download URLs for all files in the order via `GET /api/orders/[orderId]/preview-url`.
- [ ] **AC-3:** While URLs are loading, the button shows a spinner and is disabled.
- [ ] **AC-4:** After fetching, the "Downloads laden" button disappears and each file row shows a download icon button.
- [ ] **AC-5:** Clicking a file's download icon opens the file in a new tab with the original filename as the download name.
- [ ] **AC-6:** Signed URLs expire after 1 hour — users who need to download again after expiry reload the page (URLs are fetched fresh on each visit).
- [ ] **AC-7:** If the URL fetch fails (network error, server error), the download buttons simply don't appear — no error message is shown and the file list is otherwise unaffected.
- [ ] **AC-8:** The API enforces tenant isolation — a user cannot fetch signed URLs for an order belonging to a different tenant.
- [ ] **AC-9:** Platform admins can fetch signed URLs for any order (cross-tenant).
- [ ] **AC-10:** If a file fails to generate a signed URL (e.g., missing from storage), it is skipped silently — other files in the list still get download buttons.

## Edge Cases

- **Order has no files** — file list is not rendered at all; download feature is irrelevant.
- **Single file order** — "Downloads laden" loads URLs for the one file; download icon appears on that row.
- **User clicks "Downloads laden" twice** — second click is a no-op; `hasFetched` guard prevents duplicate requests.
- **File was deleted from storage after upload** — signed URL creation fails for that file; it is skipped. Other files work normally.
- **Signed URL expires while page is open** — the link becomes invalid; downloading fails in the browser. User must reload the page to get fresh URLs.
- **Inactive user or tenant** — API returns 403; download buttons don't appear (fetch silently fails).

## Implementation Notes (As Built)

- **No new API route needed.** The existing `GET /api/orders/[orderId]/preview-url` endpoint (built for OPH-5 PDF preview) already generates 1-hour signed URLs for all order files. This feature reuses it.
- **Frontend only change.** `OrderFileList` component converted to a client component with on-demand URL fetching.
- **Files modified:**
  - `src/components/orders/order-file-list.tsx` — Added `"use client"`, `orderId` prop, download state, fetch logic, and per-file download buttons.
  - `src/components/orders/order-detail-content.tsx` — Pass `orderId` to `OrderFileList`.
