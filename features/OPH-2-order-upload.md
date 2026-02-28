# OPH-2: Bestellungs-Upload (Web: .eml, PDF, Excel)

## Status: Deployed
**Created:** 2026-02-27
**Last Updated:** 2026-02-28
**Deployed:** 2026-02-28

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) — Upload ist nur für authentifizierte Benutzer

## User Stories
- Als Mitarbeiter möchte ich eine E-Mail-Datei (.eml) aus meinem E-Mail-Programm exportieren und hochladen, damit das System die darin enthaltene Bestellung verarbeiten kann.
- Als Mitarbeiter möchte ich eine PDF-Datei mit einer Bestellung hochladen, damit Bestellungen, die als PDF-Anhang kommen, verarbeitet werden können.
- Als Mitarbeiter möchte ich eine Excel-Datei mit einer Bestellung hochladen, damit Bestellungen in Tabellenformat verarbeitet werden können.
- Als Mitarbeiter möchte ich mehrere Dateien gleichzeitig hochladen (z.B. .eml + zugehörige PDFs), damit zusammengehörige Dokumente gemeinsam verarbeitet werden.
- Als Mitarbeiter möchte ich nach dem Upload sofort sehen, ob das Hochladen erfolgreich war und die Verarbeitung gestartet wurde.

## Acceptance Criteria
- [ ] Unterstützte Dateiformate: `.eml`, `.pdf`, `.xlsx`, `.xls`, `.csv`
- [ ] Maximale Dateigröße pro Datei: 25 MB
- [ ] Maximale Anzahl Dateien pro Upload: 10
- [ ] Hochgeladene Dateien werden sicher in Supabase Storage gespeichert (mandantenspezifischer Bucket-Pfad)
- [ ] Upload-Progress wird dem Benutzer angezeigt (Fortschrittsbalken)
- [ ] Nach erfolgreichem Upload wird sofort die Händler-Erkennung (OPH-3) und Extraktion (OPH-4) ausgelöst
- [ ] Benutzer wird zur Bestellübersicht weitergeleitet nach Upload
- [ ] Ungültige Dateitypen werden abgelehnt mit verständlicher Fehlermeldung
- [ ] Dateien sind nur für Benutzer des eigenen Mandanten zugänglich (RLS auf Storage)
- [ ] Original-Dateien werden dauerhaft gespeichert (für Audit / Nachvollziehbarkeit)

## Edge Cases
- Was passiert, wenn eine Datei ein ungültiges Format hat (z.B. `.exe`)? → Ablehnung mit Fehlermeldung, kein Upload
- Was passiert, wenn eine Datei zu groß ist (> 25 MB)? → Fehlermeldung vor dem Upload
- Was passiert, wenn der Upload während des Transfers abbricht? → Fehlermeldung, Benutzer kann erneut versuchen; keine halb-gespeicherten Dateien
- Was passiert, wenn eine exakt gleiche Datei bereits hochgeladen wurde? → Warnung ("Diese Datei wurde bereits am [Datum] hochgeladen"), Benutzer kann trotzdem fortfahren
- Was passiert, wenn die KI-Extraktion nach dem Upload fehlschlägt? → Bestellung wird mit Status "Extraktionsfehler" gespeichert, manuelle Nachbearbeitung möglich
- Was passiert, wenn Supabase Storage nicht erreichbar ist? → Fehlermeldung "Upload momentan nicht möglich, bitte später erneut versuchen"

## Technical Requirements
- Supabase Storage für Dateiablage (Bucket: `orders/{tenant_id}/{order_id}/`)
- Datei-Hash (SHA-256) für Duplikat-Erkennung
- Asynchrone Verarbeitung nach Upload (Hintergrundprozess für Extraktion)
- Max. Upload-Größe in Next.js API-Route konfiguriert (25 MB)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_Skipped — implemented directly by /frontend skill._

**Component Structure:**
```
/orders/upload page
+-- FileDropzone (drag-and-drop + click-to-browse)
+-- UploadFileList
|   +-- UploadFileItem (per file: icon, name, size, progress, status)
+-- CardFooter (file count summary + Upload button)

/orders page (placeholder for OPH-5)
+-- Empty state + CTA link to /orders/upload
```

**Custom Hook:** `useFileUpload` — handles SHA-256 hashing, validation, XHR upload with progress, duplicate detection within session.

**API:** `POST /api/orders/upload` — Full backend: auth, tenant isolation, file validation (extension + MIME), Supabase Storage upload, SHA-256 integrity check, cross-session duplicate detection, rate limiting, rollback on failure.

## QA Test Results (Re-Test #4)

**Tested:** 2026-02-28 (Re-test after fixes for path traversal, .env.local.example, original filename, and orders list)
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Build Status:** PASS (Next.js 16.1.1 Turbopack build succeeds with no errors; 21 routes compiled including `/api/orders`, `/api/dealers`, `/api/orders/[orderId]`, `/api/orders/[orderId]/dealer`)
**Previous QA Pass:** 2026-02-28 (Re-Test #3 found 12 open bugs; several have since been fixed)

---

### Previously Found Bugs -- Fix Verification (Re-Test #3 -> Re-Test #4)

| Prior Bug | Description | Status in Re-Test #4 |
|-----------|-------------|----------------------|
| NEW-BUG-1 (Medium) | Orphaned orders and storage files on incomplete upload flow | **UNCHANGED** -- No cleanup mechanism added. Confirm endpoint still has comment at line 164: "Not rolling back the storage file since it's already uploaded". |
| NEW-BUG-2 (Low) | Signed upload URL exposed to client on non-HTTPS | **UNCHANGED** -- Inherent to signed URL architecture. Acceptable with HTTPS in production. |
| NEW-BUG-3 (Low) | Unused `token` field in presign response | **UNCHANGED** -- `token` still returned at route.ts line 203; still unused by client. |
| NEW-BUG-4 (Low) | Confirm does not verify presign-to-confirm binding | **UNCHANGED** -- Low risk (intra-tenant only). |
| NEW-BUG-5 (Low) | Original filename lost due to sanitization | **FIXED** -- `uploadConfirmSchema` now includes `originalFilename` field (validations.ts lines 91-95). Client sends `entry.file.name` (hook line 223). Confirm endpoint reads `originalFilename` from parsed data (confirm/route.ts line 86) and stores it directly in `order_files.original_filename` (confirm/route.ts line 155). The true original filename is now preserved. |
| NEW-BUG-6 (Low) | Confirm endpoint has no rate limiting | **UNCHANGED** -- Low risk. |
| NEW-BUG-7 (Medium) | Storage path not validated for path traversal sequences | **FIXED** -- Confirm endpoint now explicitly rejects `..`, `//`, and leading `/` in storagePath (confirm/route.ts line 107: `if (storagePath.includes("..") \|\| storagePath.includes("//") \|\| storagePath.startsWith("/"))`). Returns 400 with "Ungueltiger Speicherpfad." error. |
| NEW-BUG-8 (High) | .env.local.example deleted | **FIXED** -- File restored with all 5 required environment variables documented with dummy values and clear comments: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SESSION_TIMEOUT_HOURS`. |
| REMAINING-BUG-1 (Low) | No server-side batch file count enforcement | **UNCHANGED** -- Acceptable with rate limiting. |
| REMAINING-BUG-2 (Medium) | Extraction pipeline not triggered | **PARTIALLY ADDRESSED** -- OPH-3 dealer recognition now runs synchronously at the end of the confirm step (confirm/route.ts lines 172-178). OPH-4 AI extraction still not implemented. Orders remain at status `uploaded`. |
| REMAINING-BUG-3 (Low) | No automatic redirect after upload | **UNCHANGED** -- Current UX is good. |
| REMAINING-BUG-4 (Low) | SHA-256 may fail in Safari HTTP localhost | **UNCHANGED** -- Development-only. |

---

### Acceptance Criteria Status

#### AC-1: Supported file formats (.eml, .pdf, .xlsx, .xls, .csv)
- [x] Client-side: `ALLOWED_EXTENSIONS` in `use-file-upload.ts` (line 33) correctly lists all five formats
- [x] Client-side: `FileDropzone` `accept` attribute matches: `.eml,.pdf,.xlsx,.xls,.csv` (file-dropzone.tsx line 12)
- [x] Client-side: Extension check is case-insensitive (`.toLowerCase()` at hook line 64)
- [x] Server-side: `uploadPresignSchema` validates filename extension via `.refine()` (validations.ts lines 68-71) against same five formats
- [x] `FileTypeIcon` renders appropriate icons for .eml (Mail), .pdf (FileText), .xlsx/.xls (Sheet), .csv (FileText fallback)
- **PASS**

#### AC-2: Maximum file size per file: 25 MB
- [x] Client-side: `MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024` correctly set in hook (line 34)
- [x] Client-side: Files exceeding 25 MB are rejected with clear German error message including actual file size
- [x] Server-side: `uploadPresignSchema` validates `fileSize` with `.max(25 * 1024 * 1024)` (validations.ts line 76)
- [x] Supabase Storage bucket `file_size_limit` set to `26214400` (25 MB) in migration 002 (line 126)
- [x] Two-step signed URL flow: file is uploaded directly to Supabase Storage, which enforces its own size limit independently
- **PASS** (three layers: client, Zod schema, Supabase bucket)

#### AC-3: Maximum 10 files per upload
- [x] Client-side: `MAX_FILES = 10` in hook (line 35)
- [x] Client-side: Files exceeding limit generate a user-visible error message with count of dropped files (hook lines 92-98)
- [x] Client-side: Combined list is capped via `combined.slice(0, MAX_FILES)` (hook line 110)
- [ ] NOTE: Server-side has no batch limit concept -- each file creates a separate presign request. Rate limiting (50/15min) provides indirect protection. (see REMAINING-BUG-1)
- **PASS** (client-side enforced with user feedback; server relies on rate limiting)

#### AC-4: Files stored securely in Supabase Storage (tenant-specific bucket path)
- [x] Presign API creates storage path as `{tenant_id}/{order_id}/{sanitized_filename}` (route.ts line 178)
- [x] Filename sanitized via regex (route.ts line 177)
- [x] Signed upload URL generated by `adminClient.storage.from("order-files").createSignedUploadUrl(storagePath)` (route.ts lines 180-182)
- [x] Migration creates private bucket `order-files` with `public: false` (migration 002 line 125)
- [x] On signed URL creation failure, order record is rolled back via DELETE (route.ts line 186)
- [x] Confirm endpoint rejects path traversal (`..`, `//`, leading `/`) (confirm/route.ts line 107)
- [x] Confirm endpoint verifies storage path starts with `{tenantId}/` prefix (confirm/route.ts lines 114-120)
- [x] Confirm endpoint retrieves actual file metadata from Storage via `adminClient.storage.list()` (confirm/route.ts lines 143-145)
- [x] `order_files` record includes `original_filename`, `storage_path`, `file_size_bytes`, `mime_type`, `sha256_hash` (confirm/route.ts lines 152-160)
- **PASS**

#### AC-5: Upload progress shown to user (progress bar)
- [x] `useFileUpload` hook uses XHR with `xhr.upload.onprogress` for direct-to-storage upload (hook lines 187-193)
- [x] Progress maps to 5-95% range (presign=0-5%, upload=5-95%, confirm=95-100%) (hook line 190)
- [x] `UploadFileItem` renders shadcn/ui `<Progress>` component during `uploading` status (upload-file-item.tsx line 91)
- [x] Spinner icon (`Loader2`) shown during upload (upload-file-item.tsx line 65)
- **PASS**

#### AC-6: After successful upload, dealer recognition (OPH-3) and extraction (OPH-4) triggered
- [x] Dealer recognition (OPH-3): `recognizeDealer()` called synchronously at end of confirm step (confirm/route.ts line 173)
- [x] Recognition result embedded in confirm response (confirm/route.ts lines 187-192)
- [x] Client hook stores dealer result on each `UploadFileEntry` (hook lines 257-264)
- [x] Upload success screen renders `DealerBadge` per file (upload/page.tsx lines 82-89)
- [ ] AI extraction (OPH-4): NOT IMPLEMENTED -- OPH-4 is not yet built. Orders remain at status `uploaded`.
- **PARTIAL PASS** (OPH-3 dealer recognition works; OPH-4 AI extraction pending)

#### AC-7: User redirected to order overview after upload
- [x] After all files upload, `uploadComplete` becomes true (hook lines 282-285)
- [x] Success screen shows "Zur Bestelluebersicht" button linking to `/orders` (upload/page.tsx line 115-117)
- [x] Additionally shows "Weitere Dateien hochladen" button (upload/page.tsx line 112-114)
- [ ] NOTE: No auto-redirect; user must click the button. Current behavior is acceptable UX -- allows user to review per-file results and dealer badges before navigating.
- **PARTIAL PASS** (functional; manual navigation rather than auto-redirect)

#### AC-8: Invalid file types rejected with clear error message
- [x] Client-side: Invalid extensions caught by hook (line 66) with German error messages
- [x] Client-side: Error messages displayed in destructive `<Alert>` with `<AlertCircle>` icon (upload/page.tsx lines 146-157)
- [x] Client-side: File input `accept` attribute provides browser-level first filter
- [x] Server-side: Zod `uploadPresignSchema` validates filename extension via `.refine()` (validations.ts lines 68-71)
- **PASS**

#### AC-9: Files accessible only to users of the same tenant (RLS on Storage)
- [x] Storage RLS INSERT policy: `(storage.foldername(name))[1]` must match JWT `tenant_id` (migration 002 lines 141-147)
- [x] Storage RLS SELECT policy: same tenant folder check (migration 002 lines 149-155)
- [x] Storage RLS DELETE policy: same tenant folder check (migration 002 lines 157-163)
- [x] All policies scoped to `authenticated` role and `order-files` bucket
- [x] Bucket is private (`public: false`)
- [x] `orders` table RLS: users see only own tenant orders (migration 002 lines 43-47)
- [x] `order_files` table RLS: users see only own tenant files (migration 002 lines 100-104)
- [x] Platform admin RLS policies allow viewing all orders/files (migration 002 lines 50-54, 107-111)
- [x] Confirm endpoint verifies order belongs to requesting user's tenant (confirm/route.ts line 95)
- **PASS**

#### AC-10: Original files stored permanently (for audit/traceability)
- [x] Files uploaded directly to Supabase Storage via signed URL -- originals preserved
- [x] `order_files` table records full metadata including `original_filename` from the unsanitized user input (confirm/route.ts line 155)
- [x] No DELETE policies exist for `order_files` table for regular users
- [x] `orders` table has no user-facing DELETE policy
- **PASS**

---

### Edge Cases Status

#### EC-1: Invalid file format (e.g., .exe) rejected with error message
- [x] Client-side: Extension validation catches .exe and shows "Nicht unterstuetztes Format" error
- [x] Server-side: Zod schema rejects filenames not ending in allowed extensions
- [x] Supabase Storage bucket has MIME type allow-list (migration 002 lines 127-135)
- **PASS**

#### EC-2: File too large (> 25 MB) shows error before upload
- [x] Client-side: Size validation runs before adding file to list (hook lines 73-78)
- [x] Client-side: Error message includes actual file size and the 25 MB limit
- [x] Server-side: Zod validates `fileSize` max 25 MB
- [x] Supabase Storage bucket enforces 25 MB `file_size_limit`
- **PASS**

#### EC-3: Upload interruption during transfer
- [x] Client-side: XHR `onerror` handler sets file status to "error" (hook line 196)
- [x] Client-side: Error message displayed, user can remove and retry
- [x] Server-side: If signed URL creation fails, order record is rolled back (route.ts line 186)
- [ ] NOTE: Orphaned resources (order without files, storage file without metadata) still possible. (see REMAINING-BUG-2)
- **PARTIAL PASS** (error handling exists; orphan cleanup still missing)

#### EC-4: Duplicate file detection
- [x] Client-side: SHA-256 hash computed, in-session duplicates flagged with warning
- [x] Client-side: Duplicate files still upload (not blocked)
- [x] Server-side: Cross-session duplicate detection via hash+tenant_id (confirm/route.ts lines 125-132)
- [x] Server-side: Returns `isDuplicate` and `duplicateDate`
- [x] Client-side: `UploadFileItem` shows server duplicate warning with formatted date (upload-file-item.tsx lines 100-103)
- **PASS**

#### EC-5: AI extraction fails after upload
- [ ] Not testable -- OPH-4 not yet implemented
- [x] Order table has `status` column with `error` as a valid value
- **DEFERRED** (blocked by OPH-4)

#### EC-6: Supabase Storage unreachable
- [x] Presign step: Returns 500 with German error and rolls back order
- [x] Direct upload step: XHR `onerror` catches network failures
- [x] Confirm step: File size defaults to 0-byte fallback if storage list fails (confirm/route.ts line 148)
- **PASS**

---

### Security Audit Results

#### Authentication
- [x] Presign API calls `supabase.auth.getUser()` and returns 401 if unauthenticated (route.ts line 82)
- [x] Confirm API calls `supabase.auth.getUser()` and returns 401 if unauthenticated (confirm/route.ts line 32)
- [x] Both endpoints check user/tenant status from `app_metadata` and return 403 for inactive users/tenants
- [x] Both endpoints verify `tenant_id` exists in metadata (403 if missing)
- **PASS**

#### Authorization (Tenant Isolation)
- [x] `tenantId` extracted from JWT `app_metadata` -- cannot be client-spoofed
- [x] Order created with `tenant_id` from JWT
- [x] Storage path includes `tenantId` as first segment
- [x] Confirm verifies order belongs to tenant via `.eq("tenant_id", tenantId)`
- [x] Confirm validates storage path starts with `{tenantId}/`
- [x] Confirm inserts `order_files` with `tenant_id` from JWT
- [x] Duplicate detection scoped to tenant
- [x] Storage RLS policies enforce folder-based tenant isolation
- **PASS**

#### Input Validation (Server-Side -- Zod)
- [x] Presign: `uploadPresignSchema` validates filename (extension + max length), fileSize (positive int, max 25 MB), mimeType, sha256Hash (64 hex chars)
- [x] Confirm: `uploadConfirmSchema` validates orderId (UUID), storagePath (non-empty), sha256Hash (64 hex), originalFilename (non-empty, max 255)
- [x] JSON parse errors caught with 400
- **PASS**

#### Path Traversal
- [x] Confirm rejects `..` in storagePath (confirm/route.ts line 107)
- [x] Confirm rejects `//` in storagePath (confirm/route.ts line 107)
- [x] Confirm rejects leading `/` in storagePath (confirm/route.ts line 107)
- [x] Confirm verifies path starts with `{tenantId}/` (confirm/route.ts line 115)
- **PASS** (FIXED since Re-Test #3)

#### XSS via Filename
- [x] File names rendered via React JSX auto-escaping
- [x] No `dangerouslySetInnerHTML` in any upload component
- [x] Server sanitizes filename for storage path via regex
- **PASS**

#### Rate Limiting
- [x] Upload rate limiting: max 50 presign requests per 15 minutes per IP
- [x] Rate limit check runs before JSON parsing
- [x] Exceeding limit returns 429
- [ ] NOTE: No rate limiting on confirm endpoint (low risk given input validation)
- **PASS**

#### Exposed Secrets
- [x] No hardcoded secrets
- [x] `SUPABASE_SERVICE_ROLE_KEY` used only in server-side admin client
- [x] `.env.local.example` restored with all required variables documented
- **PASS** (FIXED since Re-Test #3)

#### SQL Injection
- [x] All queries use Supabase client with parameterized inputs
- **PASS**

---

### Cross-Browser Testing (Code Review)

#### Chrome (Desktop 1440px)
- [x] All shadcn/ui components, crypto.subtle, XHR progress, drag-and-drop, fetch all supported
- **Expected: PASS**

#### Firefox (Desktop 1440px)
- [x] All APIs used fully supported
- **Expected: PASS**

#### Safari (Desktop 1440px)
- [x] `crypto.subtle` requires HTTPS (Secure Context) in Safari
- [ ] NOTE: `crypto.subtle` may throw on `http://localhost` in Safari -- development-only
- **Expected: CONDITIONAL PASS** (production OK)

---

### Responsive Testing (Code Review)

#### Mobile (375px)
- [x] Upload page uses `max-w-2xl` and responsive spacing
- [x] CardFooter uses `flex-col sm:flex-row` for mobile stacking
- [x] Buttons use `flex-1 sm:flex-none` and `w-full sm:w-auto`
- [x] File names use `truncate`
- [x] Success screen buttons stack vertically on mobile
- [x] Mobile hamburger menu now available via Sheet component in top-navigation.tsx (lines 35-82)
- **Expected: PASS**

#### Tablet (768px)
- [x] Page header uses `text-2xl md:text-3xl` responsive sizing
- [x] CardFooter switches to row layout at `sm:` breakpoint
- **Expected: PASS**

#### Desktop (1440px)
- [x] Content properly constrained with `max-w-2xl`
- [x] All components render at appropriate size
- **Expected: PASS**

---

### Regression Testing (OPH-1: Multi-Tenant Auth)

- [x] Navigation: "Bestellungen" link present in both desktop nav and mobile Sheet menu (top-navigation.tsx lines 19-22, 58-79)
- [x] Protected route: `/orders` and `/orders/upload` under `(protected)` layout
- [x] Login, password reset, team management routes: unchanged
- [x] Middleware: unchanged
- [x] RLS policies on OPH-1 tables: unchanged
- [x] Security headers: unchanged
- [x] Types and validations: extended with OPH-2/OPH-3 types; no changes to existing OPH-1 schemas
- [x] Build: 21 routes compile successfully
- **PASS** -- No regression on OPH-1

---

### Remaining Bugs

#### REMAINING-BUG-1: No server-side batch file count enforcement
- **Severity:** Low
- **Unchanged.** Rate limiting (50/15min) provides indirect protection.
- **Priority:** Nice to have

#### REMAINING-BUG-2: Orphaned orders and storage files on incomplete upload flow
- **Severity:** Medium
- **Unchanged from Re-Test #3 NEW-BUG-1.** No cleanup mechanism. Confirm endpoint comment at line 164 says "Not rolling back the storage file since it's already uploaded."
- **Steps to Reproduce:**
  1. Presign succeeds (order created), then user closes browser before uploading
  2. Or: upload succeeds but confirm fails (network error)
  3. Orphaned order record and/or storage file with no metadata record accumulates
- **Files:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/upload/route.ts`, `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/upload/confirm/route.ts`
- **Priority:** Fix in next sprint (background cleanup job or TTL sweep)

#### REMAINING-BUG-3: No automatic redirect after upload
- **Severity:** Low
- **Unchanged.** Current UX is arguably better for reviewing per-file results.
- **Priority:** Nice to have

#### REMAINING-BUG-4: SHA-256 may fail in Safari on HTTP localhost
- **Severity:** Low
- **Unchanged.** Development-only.
- **Priority:** Nice to have

#### REMAINING-BUG-5: Unused `token` field in presign response
- **Severity:** Low
- **Unchanged from Re-Test #3 NEW-BUG-3.** `token` returned at route.ts line 203, never used by client.
- **Priority:** Nice to have (cleanup)

#### REMAINING-BUG-6: Confirm does not verify presign-to-confirm binding
- **Severity:** Low
- **Unchanged from Re-Test #3 NEW-BUG-4.** Intra-tenant only, low risk.
- **Priority:** Nice to have

#### REMAINING-BUG-7: Confirm endpoint has no rate limiting
- **Severity:** Low
- **Unchanged from Re-Test #3 NEW-BUG-6.** Low risk given input validation requirements.
- **Priority:** Nice to have

#### NEW-BUG-1: Extraction pipeline partially triggered (OPH-4 still missing)
- **Severity:** Medium (deferred dependency)
- **Description:** OPH-3 dealer recognition now runs at end of confirm step. OPH-4 AI extraction is still not implemented. Orders remain at status `uploaded` and are never progressed to `processing` or `extracted`. This is expected since OPH-4 is still Planned.
- **Priority:** Implement when OPH-4 is built

#### NEW-BUG-2: Orders list does not paginate -- hardcoded limit of 50
- **Severity:** Low
- **Steps to Reproduce:**
  1. Upload more than 50 orders
  2. Navigate to `/orders`
  3. Expected: Pagination controls or "load more" to see all orders
  4. Actual: `OrdersList` fetches with `?limit=50` (orders-list.tsx line 66). No pagination UI or "load more" button. Users with more than 50 orders cannot see older entries.
- **Note:** The API endpoint `GET /api/orders` supports `limit` and `offset` query params (route.ts lines 63-67), so the backend is ready. The frontend just needs pagination controls.
- **Files:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/orders/orders-list.tsx` (line 66)
- **Priority:** Fix in next sprint (likely part of OPH-11 order history dashboard)

#### NEW-BUG-3: Confirm endpoint file size fallback may store incorrect value
- **Severity:** Low
- **Steps to Reproduce:**
  1. Upload a file via signed URL
  2. Confirm step tries to get file metadata from Storage via `adminClient.storage.list()` (confirm/route.ts lines 143-145)
  3. If Supabase Storage `list()` returns empty or fails, `fileSizeBytes` defaults to `0` (confirm/route.ts line 148)
  4. The fallback inserts `fileSizeBytes > 0 ? fileSizeBytes : 1` (confirm/route.ts line 157)
  5. Expected: Accurate file size stored
  6. Actual: A 1-byte placeholder is stored, making the file appear nearly empty in the UI (order-file-list.tsx shows "1 B")
- **Note:** This is a defensive fallback for an unlikely scenario. The storage list call should normally succeed since the file was just uploaded via signed URL. However, there is a race condition window.
- **Files:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/upload/confirm/route.ts` (lines 148, 157)
- **Priority:** Nice to have (consider passing file size from client in the confirm schema for redundancy)

---

### Summary

- **Build Status:** PASS (21 routes compiled, no errors)
- **Acceptance Criteria:** 8/10 passed, 2 partial pass (AC-6: OPH-4 extraction pending; AC-7: manual redirect)
- **Edge Cases:** 4/6 passed, 1 partial pass (EC-3: orphan cleanup), 1 deferred (EC-5: extraction failure)
- **Bugs Fixed Since Re-Test #3:** 3 of 12
  - NEW-BUG-5 (Low): Original filename now preserved via `originalFilename` field in confirm schema
  - NEW-BUG-7 (Medium): Path traversal sequences (`..`, `//`, `/`) now explicitly rejected
  - NEW-BUG-8 (High): `.env.local.example` restored with all required variables
- **Total Open Bugs:** 10
  - **Critical (0):** None
  - **High (0):** None (NEW-BUG-8 is FIXED)
  - **Medium (2):** REMAINING-BUG-2 (orphaned resources), NEW-BUG-1 (OPH-4 extraction deferred)
  - **Low (8):** REMAINING-BUG-1, -3, -4, -5, -6, -7; NEW-BUG-2 (no pagination), NEW-BUG-3 (file size fallback)
- **Security Audit:** PASS
  - Authentication: PASS
  - Authorization / Tenant Isolation: PASS
  - Input Validation (Zod): PASS
  - Path Traversal: PASS (FIXED)
  - XSS: PASS
  - SQL Injection: PASS
  - Rate Limiting: PASS (primary endpoint protected)
  - Secrets: PASS (.env.local.example FIXED)
- **Regression:** PASS -- No regression on OPH-1
- **Production Ready:** **CONDITIONAL YES**
  - No Critical or High bugs remain.
  - Both Medium bugs are operational concerns, not security or core functionality blockers:
    1. **REMAINING-BUG-2 (Medium):** Orphaned resources -- no immediate user impact; schedule background cleanup
    2. **NEW-BUG-1 (Medium):** OPH-4 extraction deferred -- expected, not blocking upload functionality
  - **Recommended post-deployment fixes:**
    1. REMAINING-BUG-2: Implement orphaned resource cleanup
    2. NEW-BUG-2: Add pagination to orders list
  - **Backlog:** All Low-severity items

## Deployment
- **Date:** 2026-02-28
- **Migrations:** 001_oph1_auth_rbac, 002_oph2_order_upload, 003_oph3_dealer_recognition
- **Cron:** Orphaned order cleanup runs hourly via Vercel Cron (`/api/cron/cleanup-orphaned-orders`)
