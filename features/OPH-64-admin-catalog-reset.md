# OPH-64: Admin: Reset Artikelstamm / Kundenstamm for Tenant

## Status: Planned
**Created:** 2026-04-14
**Last Updated:** 2026-04-14

## Dependencies
- Requires: OPH-39 (Manufacturer Article Catalog) — `article_catalog` table
- Requires: OPH-46 (Manufacturer Customer Catalog) — `customer_catalog` table
- Requires: OPH-42 (Admin Tenant Detail Page) — host UI location

## Overview
When a tenant imports a wrong or corrupted catalog (articles or customers), the platform admin needs to reset the entire catalog to a clean state in one action — rather than selecting and deleting records one by one (OPH-62) or using filtered bulk delete. This feature adds a "Gesamten Stamm löschen" (Delete entire catalog) action in the Admin Tenant Detail page, separately for Artikelstamm and Kundenstamm.

This is a **platform admin only** action. Tenant users do not have access to this.

## User Stories

1. As a platform admin, I want to delete the entire Artikelstamm of a specific tenant in one action, so that I can reset the catalog after a bad import without selecting records individually.
2. As a platform admin, I want to delete the entire Kundenstamm of a specific tenant in one action, so that I can reset the customer base after wrong data has been imported.
3. As a platform admin, I want to see a confirmation dialog before the reset, showing the number of records that will be deleted, so that I do not accidentally wipe a catalog.
4. As a platform admin, I want to see a success message after the reset, confirming how many records were deleted, so that I can verify the operation completed correctly.
5. As a platform admin, I want both reset actions to be independent, so that I can reset only the articles without affecting the customers, and vice versa.

## Acceptance Criteria

### AC-1: Trigger — "Gesamten Stamm löschen" button
- [ ] On the Admin Tenant Detail page, within the Artikelstamm section, there is a "Gesamten Stamm löschen" button (destructive/danger style, e.g. outlined red variant)
- [ ] On the Admin Tenant Detail page, within the Kundenstamm section, there is a "Gesamten Stamm löschen" button (same destructive style)
- [ ] Both buttons are visible only when the catalog contains at least one record (hidden/disabled when catalog is already empty)
- [ ] The buttons are visible exclusively to platform admins; tenant users never see them

### AC-2: Confirmation dialog
- [ ] Clicking the button opens a confirmation dialog before any deletion occurs
- [ ] The dialog title is: "Gesamten Artikelstamm löschen?" (or "Gesamten Kundenstamm löschen?" respectively)
- [ ] The dialog body shows: "Alle {N} Artikel von {Tenant Name} werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."
- [ ] The record count `{N}` is the current total count in the catalog (not just visible/filtered rows)
- [ ] The dialog has two buttons: "Abbrechen" (cancel, default focus) and "Alles löschen" (destructive confirm)
- [ ] The dialog uses the shadcn `AlertDialog` component (consistent with OPH-62 bulk delete dialog)

### AC-3: Deletion execution
- [ ] Confirming the dialog triggers a single API call to delete all catalog records for the tenant
- [ ] The button and dialog show a loading state while the deletion is in progress (spinner, buttons disabled)
- [ ] The dialog cannot be closed while the deletion is in progress
- [ ] On success: dialog closes, success toast is shown ("X Artikel gelöscht." or "X Kunden gelöscht."), catalog table refreshes to empty state
- [ ] On failure: dialog stays open, inline error message shown, no records are deleted

### AC-4: API — Delete all articles for tenant
- [ ] New endpoint: `DELETE /api/admin/tenants/[id]/articles` (without the `/bulk` sub-resource — this replaces the full table, not a selection)
- [ ] Only accessible by platform admins (`requirePlatformAdmin()`)
- [ ] Deletes all `article_catalog` rows where `tenant_id = :id`
- [ ] Returns `{ success: true, data: { deleted: number } }`
- [ ] Returns 404 if the tenant does not exist
- [ ] Returns 400 if the catalog is already empty (0 records) — this shouldn't happen in practice since the button is hidden, but API-level guard is required

### AC-5: API — Delete all customers for tenant
- [ ] New endpoint: `DELETE /api/admin/tenants/[id]/customers` (full table reset)
- [ ] Only accessible by platform admins (`requirePlatformAdmin()`)
- [ ] Deletes all `customer_catalog` rows where `tenant_id = :id`
- [ ] Returns `{ success: true, data: { deleted: number } }`
- [ ] Returns 404 if the tenant does not exist
- [ ] Returns 400 if the catalog is already empty (0 records)

### AC-6: Access control
- [ ] Both endpoints return 403 if the caller is not a platform admin
- [ ] Both endpoints return 401 if no authenticated session exists
- [ ] RLS policies on `article_catalog` and `customer_catalog` already enforce tenant isolation; the admin endpoint bypasses RLS using the service role only when the caller is confirmed platform admin

### AC-7: No impact on other data
- [ ] Deleting the Artikelstamm does NOT affect orders, ERP configs, dealer rules, or any other table
- [ ] Deleting the Kundenstamm does NOT affect orders, tenants, or any other table
- [ ] Articles and customers referenced by existing orders are not linked via FK (matching is done by value at extraction time), so deletion is safe regardless of order history

## Edge Cases

- **Catalog already empty:** The "Gesamten Stamm löschen" button is hidden when count is 0. If the API is called directly on an empty catalog, it returns 400 and deletes nothing.
- **Concurrent import in progress:** If a CSV import is running while the admin triggers a reset, records imported after the DELETE query completes will survive. This is an acceptable race condition — the admin can run the reset again. No special locking is required.
- **Very large catalog (10k+ records):** A single `DELETE FROM ... WHERE tenant_id = :id` query handles this efficiently at the database level. No pagination or chunking needed.
- **Reset immediately after import (mistake recovery):** The primary use case. After a wrong import, the admin resets the catalog and runs the correct import. No cooldown or lock needed.
- **Both catalogs reset at once:** The two actions are independent. If the admin needs to reset both, they perform two separate confirmations.
- **Tenant is in trial mode:** The action is available for trial tenants too — they may also import wrong data during onboarding.

## Technical Notes (for Architecture)

- **New API endpoints:**
  - `DELETE /api/admin/tenants/[id]/articles/route.ts` — add DELETE handler alongside existing GET/POST
  - `DELETE /api/admin/tenants/[id]/customers/route.ts` — add DELETE handler alongside existing GET/POST
- **UI location:** Admin Tenant Detail page (`src/app/(protected)/admin/tenants/[id]/page.tsx`) — add button in the Artikelstamm and Kundenstamm tab sections
- **Confirmation dialog:** New reusable component or inline AlertDialog — keep consistent with `article-bulk-delete-dialog.tsx` style from OPH-62
- **Record count:** Fetch the total count (already available in the existing catalog list responses) to display in the confirmation dialog
- **No new DB migration required** — uses existing `article_catalog` and `customer_catalog` tables
- **No new Zod schema changes** — endpoint only uses the tenant ID from the URL param (already validated)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

The feature slots into the existing Admin Tenant Detail page, which already has an "Artikel" tab and a "Kunden" tab, each rendering the respective catalog page component. The reset button lives inside those existing catalog components — shown only when the caller is a platform admin with a specific tenant in scope.

```
Admin Tenant Detail Page  (admin/tenants/[id]/page.tsx — unchanged)
+-- Tabs: Profil | Benutzer | Artikel | Kunden
    +-- "Artikel" Tab
    |   +-- ArticleCatalogPage (article-catalog-page.tsx — add reset button)
    |       +-- Toolbar Row
    |       |   +-- Search Input
    |       |   +-- [existing] Import / Export / Hinzufügen Buttons
    |       |   +-- [NEW] "Gesamten Stamm löschen" Button  ← red/destructive, shown only in admin context when count > 0
    |       +-- Article Table  (unchanged)
    |       +-- Pagination  (unchanged)
    |       +-- [NEW] CatalogResetDialog  ← triggered by button above
    |           +-- AlertDialog (shadcn)
    |           +-- Title: "Gesamten Artikelstamm löschen?"
    |           +-- Body: "Alle {N} Artikel von {Tenant Name} werden unwiderruflich gelöscht."
    |           +-- [Abbrechen] / [Alles löschen] Buttons
    |           +-- Loading Spinner (while deletion in progress)
    |           +-- Inline Error (on failure)
    +-- "Kunden" Tab
        +-- CustomerCatalogPage (customer-catalog-page.tsx — add reset button)
            +-- Toolbar Row
            |   +-- Search Input
            |   +-- [existing] Import / Export / Hinzufügen Buttons
            |   +-- [NEW] "Gesamten Stamm löschen" Button  ← same treatment
            +-- Customer Table  (unchanged)
            +-- Pagination  (unchanged)
            +-- [NEW] CatalogResetDialog  ← same component, "Kundenstamm" variant
```

**New shared component:** `src/components/ui/catalog-reset-dialog.tsx`
Accepts: catalog type ("Artikelstamm" / "Kundenstamm"), record count, tenant name, delete handler. Reused by both catalog page components — no duplication.

### Data Model

No new database tables or columns. The existing tables are:

| Table | Relevant Fields | What gets deleted |
|-------|----------------|-------------------|
| `article_catalog` | `id`, `tenant_id`, all article fields | All rows matching the target `tenant_id` |
| `customer_catalog` | `id`, `tenant_id`, all customer fields | All rows matching the target `tenant_id` |

**Total count** is already available in both catalog pages (fetched as part of the paginated list response). It is read from the existing React state — no extra API call needed to populate the confirmation dialog.

**No browser state persists** after deletion — the catalog page refetches the (now empty) list and resets all selection state.

### API Design

Two new DELETE handlers, added to the **existing** route files (same URL, new HTTP method — standard REST):

| Endpoint | Method | Caller | What it deletes |
|----------|--------|--------|----------------|
| `/api/admin/tenants/[id]/articles` | DELETE | platform_admin only | All articles for the specified tenant |
| `/api/admin/tenants/[id]/customers` | DELETE | platform_admin only | All customers for the specified tenant |

Both endpoints:
- Verify platform admin access (same `requirePlatformAdmin()` check used everywhere in the admin API layer)
- Validate that the tenant ID in the URL is a valid UUID
- Perform a single bulk delete at the database level — one query, no looping
- Return `{ success: true, data: { deleted: number } }` — the count confirms how many rows were removed
- Return 404 if the tenant does not exist

No request body is needed — the tenant to wipe is fully specified by the URL parameter.

### Tech Decisions

| Decision | Rationale |
|----------|-----------|
| **DELETE handler on existing route file** | The `/api/admin/tenants/[id]/articles` route already exists for GET (list) and POST (create). Adding DELETE on the same route means "delete the whole collection" — standard REST semantics, no new files needed. |
| **Platform admin only (no tenant-side endpoint)** | This is a data recovery tool for admins assisting tenants after a bad import, not a self-service action. Tenant users already have OPH-62 bulk delete for selective cleanup. |
| **Shared `CatalogResetDialog` component** | Both Artikelstamm and Kundenstamm need identical dialog behaviour with only label differences ("Artikel" vs "Kunden"). A single parameterised component avoids duplicating logic and keeps future changes in one place. |
| **Button only shown when count > 0** | Prevents confusing "delete 0 records" actions. Total count is already in component state — no extra fetch needed to show/hide the button. |
| **Count shown in confirmation dialog** | "Alle 1.247 Artikel werden gelöscht" gives the admin a last sanity-check before confirming. Avoids silent wipes of unexpectedly large catalogs. |
| **No new packages** | `AlertDialog`, `Button`, `Badge` are all installed shadcn/ui components. No new dependencies. |

### Touch Points Summary

| File | Change |
|------|--------|
| `src/app/api/admin/tenants/[id]/articles/route.ts` | Add `DELETE` handler — delete all articles for tenant |
| `src/app/api/admin/tenants/[id]/customers/route.ts` | Add `DELETE` handler — delete all customers for tenant |
| `src/components/article-catalog/article-catalog-page.tsx` | Add "Gesamten Stamm löschen" button + `CatalogResetDialog` (shown only when `adminTenantId` is set and count > 0) |
| `src/components/customer-catalog/customer-catalog-page.tsx` | Same as above for customers |
| `src/components/ui/catalog-reset-dialog.tsx` | **New** — shared AlertDialog component for reset confirmation |

### No New DB Migration Required
Only application-layer code changes. Existing `article_catalog` and `customer_catalog` tables are unchanged.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
