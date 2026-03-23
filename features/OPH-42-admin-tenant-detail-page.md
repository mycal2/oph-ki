# OPH-42: Admin Tenant Detail Page (Full-Page Layout)

## Status: In Progress
**Created:** 2026-03-21
**Last Updated:** 2026-03-21

## Dependencies
- Requires: OPH-8 (Admin: Mandanten-Management) — existing Sheet being replaced
- Requires: OPH-39 (Manufacturer Article Catalog) — Articles tab content
- Requires: OPH-38 (Admin: Resend Invite & Password Reset) — user action menu

## Overview
Replace the current side-Sheet tenant editor with a dedicated full-page view at `/admin/tenants/[id]`. The tenant list becomes a navigation list; clicking a row navigates to the detail page. All existing tabs (Profil, Benutzer, Artikelstamm) are preserved in the full-page layout. The sheet is retained only for creating new tenants (compact form, no tabs needed).

## User Stories
- As a platform_admin, I want to click a tenant in the list and navigate to a dedicated full-page view, so I have enough space to manage all tenant data comfortably.
- As a platform_admin, I want to manage tenant articles in a full-width table with all columns visible, so I don't have to scroll horizontally.
- As a platform_admin, I want a breadcrumb/back navigation ("← Mandanten"), so I can easily return to the list.
- As a platform_admin, I want to create a new tenant from the list page via a compact dialog/sheet (just name + slug + contact email), so the creation flow stays quick.
- As a platform_admin, I want the Profil and Benutzer tabs to work exactly as they do today, just with more available width.
- As a platform_admin, I want to open a specific tab directly via URL (e.g. `?tab=articles`), so I can share or bookmark deep links.

## Acceptance Criteria
- [ ] `/admin/tenants` list: clicking a tenant row navigates to `/admin/tenants/[id]`
- [ ] `/admin/tenants/[id]` renders a full-page layout with tabs: Profil, Benutzer, Artikelstamm
- [ ] Back button / breadcrumb navigates back to `/admin/tenants`
- [ ] "Neuer Mandant" button on the list page opens a compact Sheet with only profile fields (name, slug, contact email, status, ERP type, allowed domains) — no Benutzer or Artikelstamm tabs
- [ ] After creating a new tenant, redirect to `/admin/tenants/[id]` of the newly created tenant
- [ ] All existing functionality works on the new page: edit profile, invite users, resend invite, password reset, deactivate/reactivate users, manage articles, import/export articles
- [ ] Artikelstamm tab uses full page width — all columns visible on desktop without horizontal scrolling
- [ ] `?tab=profile|users|articles` query param controls the active tab and is updated on tab change
- [ ] Navigating to a non-existent tenant ID shows a "Nicht gefunden" error state with a back button
- [ ] Deactivate/reactivate tenant action is accessible from the detail page (button in header area)
- [ ] Page title in browser tab shows the tenant name

## Edge Cases
- EC-1: User navigates directly to `/admin/tenants/[id]` via URL → page loads the tenant data directly from API
- EC-2: Tenant ID does not exist → show "Nicht gefunden" with back button
- EC-3: `?tab=articles` in URL → page opens directly on Artikelstamm tab
- EC-4: New tenant creation → after save, redirect to the new tenant's detail page
- EC-5: Network error loading tenant → show error state with retry button
- EC-6: Tenant deactivated from list (toggle button) → still navigable to detail page; status badge reflects current state

## Tech Design (Solution Architect)

### Component Structure

```
/admin/tenants/page.tsx  (LIST — unchanged except row click behavior)
+-- TenantAdminTable  (add onRowClick → router.push)
+-- TenantCreateSheet  (NEW: slim sheet for name/slug/email only)
    (replaces TenantFormSheet for create flow)
+-- AlertDialog  (deactivate/reactivate confirmation — unchanged)

/admin/tenants/[id]/page.tsx  (NEW: DETAIL PAGE)
+-- Back button ("← Mandanten")
+-- Tenant header (name, status badge, deactivate/reactivate button)
+-- Tabs [Profil | Benutzer | Artikelstamm]
    +-- Profil tab
    |   +-- TenantProfileForm  (extracted from TenantFormSheet)
    +-- Benutzer tab
    |   +-- TenantUsersTab  (extracted from TenantFormSheet)
    |   +-- TenantInviteDialog  (unchanged)
    +-- Artikelstamm tab
        +-- ArticleCatalogPage  (existing, adminTenantId prop, no `compact`)
```

### Data Flow
- Detail page loads tenant via existing `GET /api/admin/tenants/[id]`
- Users loaded via existing `GET /api/admin/tenants/[id]/users`
- All mutations use existing API routes (no new routes needed)
- Tab state stored in URL query param `?tab=` via `useSearchParams` / `router.replace`

### Tech Decisions
- **No new API routes** — all data comes from existing endpoints
- **URL-based tab state** — `?tab=articles` makes tabs bookmarkable and shareable
- **Extract tab content from TenantFormSheet** — `TenantProfileForm` and `TenantUsersTab` become standalone components reusable in both the old sheet (create mode) and new page (edit mode)
- **TenantFormSheet** is slimmed to create-only (no tabs, profile fields only); renamed `TenantCreateSheet`
- **Follow ERP config pattern** — `/admin/erp-configs/[configId]/page.tsx` is the exact precedent

### No new packages needed
All existing dependencies cover this feature.
