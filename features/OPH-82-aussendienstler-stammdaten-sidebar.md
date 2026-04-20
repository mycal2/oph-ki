# OPH-82: Außendienstler Menu in Stammdaten Sidebar Section

## Status: In Review
**Created:** 2026-04-17
**Last Updated:** 2026-04-17
**PRD:** [docs/OPH-PRD.md](../docs/OPH-PRD.md)

## Dependencies
- OPH-74 (SF-3): Außendienstler page and management — the page that this nav item links to
- OPH-73 (SF-2): Sales Rep Role & Tenant Feature Flag — `salesforce_enabled` flag on tenants
- OPH-1: Multi-Tenant Auth — role-based access control

## User Stories
- As a tenant admin, I want the "Außendienstler" menu item to appear under "Stammdaten" in the sidebar when Salesforce is enabled for my tenant, so that all master data (articles, customers, dealers, sales reps) is grouped in one place.
- As a platform admin, I want to access the Außendienstler page for the tenant I am assigned to, so that I can manage and view their sales reps.
- As a tenant user (non-admin), I should NOT see or be able to access the Außendienstler menu item, so that sales rep management is restricted to admins.

## Acceptance Criteria
- [ ] The "Außendienstler" menu entry appears under the "Stammdaten" section in the sidebar.
- [ ] The entry is shown ONLY when `salesforce_enabled = true` for the user's tenant AND the user has role `tenant_admin` or `platform_admin`.
- [ ] A `tenant_user` or `sales_rep` navigating directly to `/settings/aussendienstler` is redirected to `/dashboard` (middleware-level guard — fixes OPH-74 BUG-3).
- [ ] The standalone "Außendienst" sidebar section is removed. The Außendienstler item lives exclusively under "Stammdaten".
- [ ] Tenant admin sees the Außendienstler of their own tenant.
- [ ] Platform admin sees the Außendienstler of the tenant they are assigned to (their `tenant_id`).
- [ ] If the platform admin has no tenant assigned (`tenant_id` is null) OR the assigned tenant has `salesforce_enabled = false`, the item is hidden for that platform admin.

## Edge Cases
- Platform admin with no `tenant_id` assigned: the `salesforceEnabled` flag resolves to `false` (no tenant to query), so the item does not appear.
- Salesforce is disabled mid-session for a tenant: on the next navigation the sidebar re-evaluates `salesforceEnabled` and the item disappears.
- A `platform_viewer` (read-only platform role): should also be hidden — the Außendienstler page is admin-only (tenant_admin or platform_admin).
- Tenant admin navigating to `/settings/aussendienstler` while `salesforce_enabled` is `false`: middleware guard redirects them to `/dashboard` (same as non-admin users).

---

## Tech Design (Solution Architect)

### Overview

OPH-82 is a pure **UI + middleware** change — no new API routes, no new database tables. All the data and logic already exist. The two affected files are:

1. `src/components/layout/app-sidebar.tsx` — sidebar navigation layout
2. `src/lib/supabase/middleware.ts` — route-level access control

---

### A) Component Structure

**Before (OPH-74 state):**
```
Sidebar
+-- Übersicht
|   +-- Dashboard
|   +-- Bestellungen
+-- Stammdaten
|   +-- Artikelstamm
|   +-- Kundenstamm
|   +-- Zuordnungen
+-- Einstellungen
|   +-- Eingangs-E-Mail
|   +-- Datenschutz
+-- Außendienst  ← standalone conditional section (TO BE REMOVED)
|   +-- Außendienstler
+-- Plattform (platform_admin only)
    +-- ...sub-groups...
```

**After (OPH-82):**
```
Sidebar
+-- Übersicht
|   +-- Dashboard
|   +-- Bestellungen
+-- Stammdaten
|   +-- Artikelstamm
|   +-- Kundenstamm
|   +-- Zuordnungen
|   +-- Außendienstler  ← moved here, conditional on salesforceEnabled + admin role
+-- Einstellungen
|   +-- Eingangs-E-Mail
|   +-- Datenschutz
+-- Plattform (platform_admin only)
    +-- ...sub-groups...
```

---

### B) What Changes and Why

#### 1. Sidebar (`app-sidebar.tsx`)

The `navGroups` array is currently a static list of items. "Stammdaten" has a fixed set of three items. To conditionally add "Außendienstler" to the group:

- The static `navGroups` definition stays intact for the base items.
- The "Stammdaten" group items are extended at render time with the "Außendienstler" entry when `showAussendienst` is true.
- The standalone "Außendienst" section block (currently lines 311–332) is **deleted entirely**.

**Why this approach:** The existing `navGroups` structure is clean and predictable. A conditional item appended at render time keeps all the "Stammdaten" items co-located without restructuring the whole nav definition.

#### 2. Middleware (`middleware.ts`)

The middleware currently enforces role checks only for:
- `/admin/*` → platform_admin or platform_viewer
- `/settings/team` → tenant_admin, platform_admin, or platform_viewer
- `/settings/aussendienstler` → tenant_admin, platform_admin (added in OPH-74 but missing — this is OPH-74 BUG-3)

OPH-82 adds the missing guard:
- `/settings/aussendienstler` → tenant_admin or platform_admin only

If a user with any other role hits this path directly, the middleware redirects them to `/dashboard` — the same pattern already used for `/settings/team`.

**Why in middleware rather than the page component:** Defense-in-depth. The page component already requires the correct role via API calls. Adding the check in middleware provides a clean redirect before any page content is rendered — consistent with how other protected settings routes behave.

---

### C) Data and State

No database or API changes needed. The existing `useCurrentUserRole` hook already:
- Returns `role` (tenant_admin, platform_admin, etc.)
- Returns `salesforceEnabled` (true if the user's tenant has `salesforce_enabled = true`)

Both values are already read by the sidebar to determine `showAussendienst`. The hook and its data fetching do not change.

---

### D) Files Changed

| File | Change Type | What Changes |
|------|------------|--------------|
| `src/components/layout/app-sidebar.tsx` | Modify | Move Außendienstler item into Stammdaten group; remove standalone Außendienst section |
| `src/lib/supabase/middleware.ts` | Modify | Add route guard for `/settings/aussendienstler` |

**No new files. No new npm packages. No database migrations.**

---

### E) Why No Backend Changes

The Außendienstler page (`/settings/aussendienstler`) was built in OPH-74. It already:
- Fetches only `sales_rep` users scoped to the current user's `tenant_id`
- Works for both `tenant_admin` and `platform_admin` (both have a `tenant_id` in their session)
- Blocks access from the API level if the caller isn't an admin

OPH-82 only changes where the navigation entry appears and adds the missing middleware guard.
