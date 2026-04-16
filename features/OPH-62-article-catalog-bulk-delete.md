# OPH-62: Article Catalog Bulk Delete

## Status: In Review
**Created:** 2026-03-31
**Last Updated:** 2026-03-31

## Dependencies
- Requires: OPH-39 (Manufacturer Article Catalog) — existing article table and delete API

## Overview
Tenant admins and platform admins can select multiple articles in the catalog table and delete them in a single action. Useful for cleaning up catalogs after a bad import or removing discontinued product lines.

## User Stories
- As a tenant_admin, I want to select multiple articles via checkboxes and delete them in one action so that I can clean up the catalog efficiently without deleting one by one.
- As a platform_admin, I want to bulk-delete articles from any tenant's catalog (via Admin → Tenant detail) so that I can assist with catalog cleanup during onboarding or corrections.
- As a tenant_admin, I want to select all visible articles with a single click so that I can quickly delete an entire filtered result set.
- As a tenant_admin, I want to see a confirmation dialog before bulk deletion so that I don't accidentally delete the wrong articles.
- As a tenant_admin, I want to see how many articles were successfully deleted so that I can verify the operation completed correctly.

## Acceptance Criteria

### Selection
- [ ] A checkbox column appears as the first column in the article table
- [ ] Clicking a row's checkbox selects/deselects that article
- [ ] A "select all" checkbox in the column header selects/deselects all currently visible rows (respecting active search filter)
- [ ] Selected row count is shown in the table toolbar (e.g. "3 Artikel ausgewählt")
- [ ] Selection is cleared when the search filter changes

### Bulk Delete Action
- [ ] A "Auswahl löschen" button appears in the toolbar when at least one article is selected
- [ ] Clicking the button opens a confirmation dialog showing: "X Artikel löschen? Diese Aktion kann nicht rückgängig gemacht werden."
- [ ] Confirming the dialog sends a bulk delete request and shows a loading state
- [ ] On success: all selected articles are removed from the table, selection is cleared, success toast is shown ("X Artikel gelöscht")
- [ ] On partial failure: error toast shows how many succeeded and how many failed
- [ ] On full failure: error toast shown, table unchanged

### Access Control
- [ ] Works for tenant_admin on their own catalog (Settings → Artikelstamm)
- [ ] Works for platform_admin on any tenant's catalog (Admin → Tenant detail → Artikelstamm)
- [ ] RLS ensures tenants cannot delete articles belonging to other tenants

### API
- [ ] A new `DELETE /api/articles` endpoint accepts an array of article IDs and deletes them in bulk (tenant_admin)
- [ ] A new `DELETE /api/admin/tenants/[id]/articles` endpoint does the same for platform_admin
- [ ] Only articles belonging to the authenticated tenant (or specified tenant for platform_admin) are deleted — IDs belonging to other tenants are silently ignored
- [ ] Response includes count of deleted articles

## Edge Cases
- **Empty selection:** "Auswahl löschen" button is not shown when no articles are selected
- **All articles deleted:** Table shows empty state after deletion
- **Filter active during selection:** "Select all" only selects filtered rows, not the entire catalog
- **Article used in active order:** Currently no constraint — deletion proceeds regardless (articles are matched by value, not FK reference in orders)
- **Concurrent deletion:** If another user deletes an article already in the selection, the bulk delete succeeds for the remaining IDs without error
- **Large selection:** No hard UI limit; backend processes all IDs in a single query with `.in()` clause (Supabase supports up to ~10k IDs)

## Technical Requirements
- Bulk delete uses a single `DELETE FROM articles WHERE id = ANY($1) AND tenant_id = $2` query — no N+1 loops
- No new DB migration required (uses existing `articles` table)
- RLS policy on articles already enforces tenant isolation

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

```
Artikelstamm Page (article-catalog-page.tsx)
+-- Toolbar Row
|   +-- Search Input
|   +-- [When ≥1 selected] Selection Count Badge ("X Artikel ausgewählt")
|   +-- [When ≥1 selected] "Auswahl löschen" Button  ← NEW
|   +-- Import Button
|   +-- Export Button
|   +-- "Artikel hinzufügen" Button
+-- Article Table
|   +-- [NEW] Checkbox Column (header: select-all, rows: per-article)
|   +-- Artikelnummer Column
|   +-- Bezeichnung Column
|   +-- Einheit Column
|   +-- Actions Column
+-- Pagination
+-- [NEW] Article Bulk Delete Dialog (article-bulk-delete-dialog.tsx)
    +-- AlertDialog (shadcn)
    +-- Title: "X Artikel löschen?"
    +-- Body: "Diese Aktion kann nicht rückgängig gemacht werden."
    +-- [Cancel] / [Alles löschen] Buttons
    +-- Inline Error (on failure)
```

The `article-catalog-page.tsx` component is used in two contexts via props:
- **Tenant view:** Settings → Artikelstamm (read/write for tenant_admin, read-only for tenant_user)
- **Admin view:** Admin → Tenant Detail → Artikelstamm (always read/write for platform_admin, `adminTenantId` prop set)

The `readOnly` prop gates all mutation actions (checkboxes, bulk delete, add/edit/delete).

### Data Model

No new database tables. Uses the existing `article_catalog` table:

| Field | Purpose |
|-------|---------|
| `id` | UUID — used as the selection key and delete target |
| `tenant_id` | UUID — ensures only the correct tenant's articles are deleted |
| `article_number` | Shown in the table |
| `description` | Shown in the table |
| `unit` | Shown in the table |

**Selection state** is held entirely in the browser (React `useState` with a `Set<string>` of selected IDs). No database state is modified until the admin confirms the dialog.

### API Design

Two parallel endpoints handle the same operation for different caller roles:

| Endpoint | Caller Role | Tenant Scope |
|----------|------------|--------------|
| `DELETE /api/articles/bulk` | tenant_admin | Own tenant (from JWT) |
| `DELETE /api/admin/tenants/[id]/articles/bulk` | platform_admin | Any tenant (from URL) |

Both accept a JSON body with an array of article UUIDs and return `{ success: true, data: { deleted: number } }`.

Tenant isolation is enforced at two levels: RLS policy on the `article_catalog` table, plus an explicit `tenant_id` filter in the application query (defence in depth).

### Tech Decisions

| Decision | Rationale |
|----------|-----------|
| **Selection stored in React state (not database)** | Ephemeral UI state — no need to persist which rows are checked. Cleared on search change and page change to prevent stale selections. |
| **Single bulk DELETE query** | One `DELETE WHERE id IN (...)` query handles any number of IDs without N+1 loops. Supabase supports up to ~10k IDs in a single `.in()` call — more than sufficient for any realistic catalog size. |
| **Two separate API endpoints (tenant vs admin)** | Clean separation of concerns. The tenant endpoint enforces the caller's own `tenant_id` from the JWT; the admin endpoint takes the target `tenant_id` from the URL. Neither endpoint accepts `tenant_id` in the request body (prevents spoofing). |
| **`AlertDialog` (shadcn) for confirmation** | Blocks interaction with the page while open, requiring an explicit confirm/cancel. More appropriate than a regular Dialog for a destructive action. Consistent with shadcn patterns already used in `article-delete-dialog.tsx`. |
| **`/bulk` sub-resource, not `DELETE /api/articles`** | Avoids ambiguity: the same base route handles GET (list) and POST (create). A separate `/bulk` sub-resource keeps routing unambiguous and makes the destructive intent explicit in the URL. |
| **No new DB migration** | Bulk delete operates on the existing `article_catalog` table. Only application-layer code changed. |

### Touch Points Summary

| File | Change |
|------|--------|
| `src/components/article-catalog/article-catalog-page.tsx` | Added checkbox column, selection state, toolbar badge, "Auswahl löschen" button, dialog trigger |
| `src/components/article-catalog/article-bulk-delete-dialog.tsx` | New component — AlertDialog for bulk delete confirmation |
| `src/app/api/articles/bulk/route.ts` | New route — tenant_admin bulk delete |
| `src/app/api/admin/tenants/[id]/articles/bulk/route.ts` | New route — platform_admin bulk delete |

### No New Dependencies
All UI primitives used (`Checkbox`, `AlertDialog`, `Button`, `Badge`) are already installed shadcn/ui components.

## QA Test Results

**Tested:** 2026-03-31
**App URL:** http://localhost:3003
**Tester:** QA Engineer (AI)
**Method:** Code review + build verification (static analysis)

### Acceptance Criteria Status

#### AC-1: Selection -- Checkbox column as first column
- [x] Checkbox column renders as first column in the article table (line 376-382 of article-catalog-page.tsx)
- [x] Checkbox hidden in readOnly mode (wrapped in `!readOnly` guard)

#### AC-2: Selection -- Row checkbox selects/deselects article
- [x] `toggleSelect(id)` correctly toggles individual article IDs in the `selectedIds` Set (lines 107-117)
- [x] Row data-state reflects selection: `data-state={selectedIds.has(article.id) ? "selected" : undefined}`

#### AC-3: Selection -- "Select all" checkbox in header
- [x] Header checkbox present with `checked={allVisibleSelected}` and `onCheckedChange={toggleSelectAll}` (line 378)
- [x] `toggleSelectAll` selects only visible (filtered) rows via `articles.map(a => a.id)` (lines 99-105)
- [x] Deselects all when all visible are already selected

#### AC-4: Selection -- Selected row count shown in toolbar
- [x] When `someSelected` is true, toolbar shows `{selectedIds.size} Artikel ausgewaehlt` (lines 298-301)

#### AC-5: Selection -- Selection cleared on search filter change
- [x] `useEffect` clears `selectedIds` when `search` changes (lines 85-87)
- [x] Selection also cleared on page change (lines 89-92) -- good extra behavior

#### AC-6: Bulk Delete -- "Auswahl loeschen" button appears when selected
- [x] Button conditionally rendered: `{someSelected && !readOnly && (...)}`  (lines 309-319)
- [x] Button not shown when `selectedIds.size === 0` (`someSelected` is false)

#### AC-7: Bulk Delete -- Confirmation dialog with correct text
- [x] Dialog shows title: `{count} Artikel loeschen?` (line 58-59 of article-bulk-delete-dialog.tsx)
- [x] Dialog shows description: `Diese Aktion kann nicht rueckgaengig gemacht werden.` (line 61)
- [x] Uses shadcn AlertDialog component correctly

#### AC-8: Bulk Delete -- Loading state during deletion
- [x] `isDeleting` state disables both buttons and shows Loader2 spinner (lines 69-83 of dialog)
- [x] Dialog cannot be closed while deleting (`handleOpenChange` blocked when `isDeleting`)

#### AC-9: Bulk Delete -- Success handling
- [x] On success: toast shows `{deleted} Artikel geloescht.` (line 173 of catalog page)
- [x] Selection cleared after success: `setSelectedIds(new Set())` (line 174)
- [x] Table refetched via `fetchArticles()` in the hook (line 211 of use-article-catalog.ts)

#### AC-10: Bulk Delete -- Partial failure handling
- [ ] BUG: No partial failure detection. When `result.ok === true` but `result.deleted < selectedIds.size` (some IDs already deleted by another user or belong to different tenant), the code shows a success toast with the actual count but does NOT warn the user that some articles were not deleted. See BUG-1 below.

#### AC-11: Bulk Delete -- Full failure handling
- [x] When `result.ok === false`, the dialog stays open and shows error inline (line 39-40 of dialog)
- [ ] BUG: No toast shown on full failure. The error is only displayed inside the dialog. The spec says "error toast shown, table unchanged." See BUG-2 below.

#### AC-12: Access Control -- tenant_admin on own catalog
- [x] API at `/api/articles/bulk` checks role is `tenant_admin` or `platform_admin` (line 58 of bulk/route.ts)
- [x] Filters by `tenant_id` from JWT metadata (line 89-90)

#### AC-13: Access Control -- platform_admin on any tenant's catalog
- [x] API at `/api/admin/tenants/[id]/articles/bulk` uses `requirePlatformAdmin()` (line 37 of admin bulk/route.ts)
- [x] `adminTenantId` prop passed from admin tenant detail page (line 381 of admin tenants/[id]/page.tsx)

#### AC-14: Access Control -- RLS tenant isolation
- [x] RLS DELETE policy on `article_catalog` restricts to own tenant (migration 028, lines 74-84)
- [x] API additionally filters by `tenant_id` at application level (belt-and-suspenders)

#### AC-15: API -- Bulk delete endpoint for tenant_admin
- [ ] BUG: Spec says `DELETE /api/articles` but implementation is at `DELETE /api/articles/bulk`. This is a spec-vs-implementation mismatch. The implementation path `/api/articles/bulk` is actually a better REST design. See BUG-3 below (spec issue, not code bug).

#### AC-16: API -- Bulk delete endpoint for platform_admin
- [ ] BUG: Same mismatch. Spec says `DELETE /api/admin/tenants/[id]/articles` but implementation is at `DELETE /api/admin/tenants/[id]/articles/bulk`. See BUG-3 below.

#### AC-17: API -- Cross-tenant IDs silently ignored
- [x] Both endpoints filter by `tenant_id` in the DELETE query, so IDs belonging to other tenants simply won't match and are silently ignored

#### AC-18: API -- Response includes deleted count
- [x] Response returns `{ success: true, data: { deleted: number } }` (line 103-106 of bulk/route.ts)

### Edge Cases Status

#### EC-1: Empty selection
- [x] "Auswahl loeschen" button not rendered when `someSelected` is false (line 309)

#### EC-2: All articles deleted
- [x] After deletion, `fetchArticles()` is called, which will return empty list, triggering the empty state UI (lines 333-366)

#### EC-3: Filter active during selection
- [x] "Select all" uses `articles.map(a => a.id)` which only contains currently visible (filtered + paginated) rows

#### EC-4: Article used in active order
- [x] No FK constraint exists between orders and article_catalog; deletion proceeds without issue

#### EC-5: Concurrent deletion
- [x] If another user already deleted some IDs, the `.in("id", ids).eq("tenant_id", tenantId)` query simply deletes fewer rows. The response `deleted` count will be lower but no error is thrown. However, see BUG-1 about missing partial failure UX.

#### EC-6: Large selection
- [x] Zod schema allows up to 10,000 IDs (line 13 of bulk/route.ts)
- [x] Single `.in()` query, no N+1 loops

### Security Audit Results

#### Authentication
- [x] Both endpoints verify user session via `supabase.auth.getUser()` or `requirePlatformAdmin()`
- [x] Returns 401 if not authenticated

#### Authorization
- [x] Tenant endpoint checks role is `tenant_admin` or `platform_admin` (line 58)
- [x] Admin endpoint uses `requirePlatformAdmin()` which only allows `platform_admin` role
- [x] Inactive users rejected (user_status === "inactive", line 43)
- [x] Inactive tenants rejected (tenant_status === "inactive", line 50)
- [x] `tenant_user` role correctly blocked from deletion (both at API level and UI level via `readOnly` prop)

#### Tenant Isolation
- [x] RLS policy enforces tenant isolation at database level
- [x] Application code additionally filters by tenant_id (defense in depth)
- [x] Admin endpoint uses provided `tenantId` from URL param, not from JWT, which is correct for cross-tenant admin access

#### Input Validation
- [x] Zod schema validates IDs are valid UUIDs (regex check)
- [x] Minimum 1 ID required, maximum 10,000
- [x] Admin endpoint validates tenant ID is valid UUID before proceeding (line 30)

#### Injection Resistance
- [x] All inputs validated via Zod before use
- [x] Supabase client uses parameterized queries (no raw SQL)

#### IDOR (Insecure Direct Object Reference)
- [x] Cannot delete articles from another tenant by passing their IDs -- the `tenant_id` filter prevents this
- [x] Cannot use the tenant endpoint to target a different tenant (tenant_id comes from JWT, not request body)

#### Rate Limiting
- [ ] BUG: No rate limiting on bulk delete endpoint. An attacker with valid credentials could repeatedly call the endpoint. This is a low-severity issue since authentication is required. See BUG-4 below.

#### Data Leakage
- [x] Error messages do not expose internal details
- [x] Response only includes `deleted` count, no article data returned

#### Admin Endpoint Tenant ID Validation
- [x] Tenant ID in URL validated as UUID before use (line 30-35 of admin route)

### Cross-Browser Compatibility
- [x] Uses standard shadcn/ui Checkbox component (Radix UI primitive) -- works across Chrome, Firefox, Safari
- [x] No browser-specific APIs used in the bulk delete flow
- [x] AlertDialog from Radix UI is cross-browser compatible

### Responsive Design
- [x] Checkbox column uses fixed width `w-[40px]` -- works at all breakpoints
- [x] Selection toolbar uses flex layout with wrapping (`flex-wrap`)
- [x] "Auswahl loeschen" button uses `size="sm"` for compact display on mobile

### Bugs Found

#### BUG-1: Partial failure not communicated to user
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Select 5 articles
  2. Have another user delete 2 of those articles concurrently
  3. Click "Auswahl loeschen" and confirm
  4. Expected: Warning toast saying "3 von 5 Artikeln geloescht. 2 konnten nicht gefunden werden."
  5. Actual: Success toast says "3 Artikel geloescht." with no indication that 2 were skipped
- **Location:** `src/components/article-catalog/article-catalog-page.tsx` lines 169-177
- **Fix:** Compare `result.deleted` with `selectedIds.size`; if they differ, show a warning toast instead of success toast
- **Priority:** Fix in next sprint

#### BUG-2: Full failure shows error only in dialog, not as toast
- **Severity:** Low
- **Steps to Reproduce:**
  1. Select articles
  2. Click "Auswahl loeschen" and confirm
  3. Simulate a server error (e.g., database down)
  4. Expected: Error toast shown per spec ("error toast shown, table unchanged")
  5. Actual: Error displayed inline in the dialog; no toast. User must read the dialog.
- **Location:** `src/components/article-catalog/article-bulk-delete-dialog.tsx` lines 36-41
- **Note:** The current behavior (inline error in dialog) is arguably better UX than a toast since the user is already looking at the dialog. This is a spec-vs-implementation deviation rather than a true bug.
- **Priority:** Nice to have

#### BUG-3: API endpoint paths differ from spec
- **Severity:** Low (spec documentation issue, not a code bug)
- **Details:**
  - Spec says: `DELETE /api/articles` -- Implementation: `DELETE /api/articles/bulk`
  - Spec says: `DELETE /api/admin/tenants/[id]/articles` -- Implementation: `DELETE /api/admin/tenants/[id]/articles/bulk`
- **Note:** The implementation paths are actually better REST design. Having a separate `/bulk` sub-resource avoids ambiguity with the existing `GET /api/articles` and `POST /api/articles` on the same route. The spec should be updated to match the implementation.
- **Priority:** Nice to have (update spec)

#### BUG-4: No rate limiting on bulk delete endpoint
- **Severity:** Low
- **Details:** Neither bulk delete endpoint implements rate limiting. A malicious authenticated user could send rapid repeated requests. Mitigated by the fact that authentication is required and the 10,000 ID limit exists per request.
- **Priority:** Fix in next sprint (applies to many other endpoints too, not specific to OPH-62)

### Summary
- **Acceptance Criteria:** 14/18 passed (3 are spec-documentation mismatches, 1 is a real UX gap)
- **Bugs Found:** 4 total (0 critical, 0 high, 1 medium, 3 low)
- **Security:** PASS -- tenant isolation is solid with defense in depth (RLS + application-level filtering). Input validation is thorough. No injection vectors found.
- **Build:** PASS -- `npm run build` completes without errors
- **Production Ready:** YES (with caveat)
- **Recommendation:** Deploy. BUG-1 (partial failure UX) should be addressed in the next sprint but is not a blocker since it is a cosmetic/UX issue -- data integrity is not affected.

## Deployment
_To be added by /deploy_
