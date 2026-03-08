# OPH-26: Order File Download

## Status: Deployed
**Created:** 2026-03-05
**Last Updated:** 2026-03-08

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

---

## QA Test Results

**Tested:** 2026-03-08 (Re-test)
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)

### Acceptance Criteria Status

#### AC-1: "Downloads laden" button shown when URLs not fetched -- PASS
- [x] Button renders in CardHeader with Download icon and "Downloads laden" text when `hasFetched` is false
- [x] Button uses ghost variant and small size for unobtrusive appearance

#### AC-2: Clicking button fetches signed URLs via API -- PASS
- [x] `fetchDownloadUrls()` calls `GET /api/orders/${orderId}/preview-url`
- [x] Response is parsed and stored in `downloadUrls` state keyed by file ID

#### AC-3: Spinner + disabled while loading -- PASS
- [x] Loader2 spinner with `animate-spin` shown when `isLoading` is true
- [x] Button is `disabled={isLoading}` to prevent interaction during fetch

#### AC-4: Button disappears, per-file download icons appear -- PASS
- [x] `{!hasFetched && ...}` hides the "Downloads laden" button after successful fetch
- [x] Per-file download anchor with `<Download />` icon renders when `downloadUrls[file.id]` exists

#### AC-5: Download uses original filename -- PASS
- [x] Anchor tag has `download={file.original_filename}` attribute
- [x] API passes `{ download: file.original_filename }` to `createSignedUrl` (route.ts line 128), setting `Content-Disposition` header server-side for cross-origin compatibility (previous BUG-2 is FIXED)

#### AC-6: Signed URLs expire after 1 hour -- PASS
- [x] API sets `SIGNED_URL_EXPIRY_SECONDS = 3600` (route.ts line 10)
- [x] Component state resets on mount, so page reload generates fresh URLs

#### AC-7: Fetch failure shows no error message -- PASS
- [x] `catch` block in `fetchDownloadUrls` silently returns `{}` with no toast or UI error (order-file-list.tsx lines 91-93) (previous BUG-1 is FIXED)
- [x] `getFileUrl` silently returns on failure with no error message (order-file-list.tsx line 131)

#### AC-8: Tenant isolation enforced -- PASS
- [x] API filters by `tenant_id` when user is not platform_admin (route.ts lines 82-84)
- [x] Returns 404 if order does not belong to user's tenant
- [x] orderId validated against UUID regex to prevent injection

#### AC-9: Platform admins have cross-tenant access -- PASS
- [x] API skips tenant filter when `isPlatformAdmin` is true (route.ts line 82)

#### AC-10: Files with failed signed URL are skipped silently -- PASS
- [x] API uses `continue` to skip files where `createSignedUrl` fails (route.ts lines 131-138)
- [x] Other files in the response still get valid signed URLs

### Edge Cases Status

#### EC-1: Order has no files -- PASS
- [x] `OrderFileList` returns `null` when `files.length === 0` (line 154)
- [x] `OrderDetailContent` also guards with `order.files.length > 0` before rendering

#### EC-2: Single file order -- PASS
- [x] Works correctly -- single file gets download button after URL fetch

#### EC-3: Double-click on "Downloads laden" -- PASS
- [x] `hasFetched` guard in `fetchDownloadUrls` prevents duplicate API calls (line 74)
- [x] Button is disabled while loading, preventing rapid clicks

#### EC-4: File deleted from storage after upload -- PASS
- [x] API skips file with failed signed URL, other files still work (route.ts lines 131-138)

#### EC-5: Signed URL expires while page is open -- PASS
- [x] Expected behavior -- link becomes invalid, user must reload

#### EC-6: Inactive user or tenant -- PASS
- [x] API returns 403 for inactive user (route.ts line 43) or inactive tenant (route.ts line 49)
- [x] Frontend silently fails with no error shown to user (catch returns empty object)

### Security Audit Results

- [x] Authentication: API checks `supabase.auth.getUser()` and returns 401 if not authenticated
- [x] Authorization: Tenant isolation enforced via `tenant_id` filter on order query
- [x] Input validation: `orderId` validated against UUID regex before DB query
- [x] Inactive account handling: Both user and tenant status checked before generating URLs
- [x] Admin bypass: Platform admins can access cross-tenant (intentional, per AC-9)
- [x] Security headers: X-Frame-Options DENY, nosniff, HSTS, Referrer-Policy all set in next.config.ts
- [x] Signed URL scoping: URLs are scoped to specific files via `storage_path`, not wildcard
- [x] No secrets exposed: No API keys or credentials in client-side code
- [x] `noopener,noreferrer` used on `window.open` calls (line 141)
- [x] `e.stopPropagation()` on download anchor prevents double event handling
- [ ] Rate limiting: No rate limiting on the preview-url endpoint (Low -- consistent with project-wide pattern, not a blocker)

### Cross-Browser Testing (Code Review)

- [x] Chrome: Standard DOM APIs used, no browser-specific features
- [x] Firefox: `download` attribute supported; `window.open` works
- [x] Safari: Server-side `Content-Disposition` header now ensures correct filename for cross-origin downloads

### Responsive Testing (Code Review)

- [x] 375px (Mobile): File rows use `flex` with `min-w-0 flex-1` for text truncation; button uses small size
- [x] 768px (Tablet): Layout adapts via flex wrapping
- [x] 1440px (Desktop): Full layout with all elements visible

### Bugs Found

No bugs found. Both bugs from the initial QA run (2026-03-08) have been fixed:

- **BUG-1 (Medium, FIXED):** Toast error on fetch failure removed -- now silently fails per AC-7.
- **BUG-2 (Low, FIXED):** Server-side `Content-Disposition` header added via `createSignedUrl({ download: filename })` -- filenames now preserved across all browsers.

### Summary
- **Acceptance Criteria:** 10/10 passed
- **Edge Cases:** 6/6 passed
- **Bugs Found:** 0 (2 previously found bugs are now fixed)
- **Security:** Pass -- authentication, authorization, input validation all solid. Rate limiting absent but consistent with project-wide pattern.
- **Production Ready:** YES
- **Recommendation:** Deploy. All acceptance criteria pass, both previously identified bugs are fixed, security audit is clean.

## Deployment

- **Deployed:** 2026-03-08
- **Deployed by:** Platform Admin
- **No database migrations required** — feature is UI + API only (uses existing `order_files` table and Supabase Storage)
- **No new environment variables required**
