# OPH-92: Platform Admin Tenant Context Switcher

## Status: Deployed
**Created:** 2026-04-20
**Last Updated:** 2026-04-21

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) — platform_admin role in app_metadata
- Requires: OPH-8 (Admin: Mandanten-Management) — tenant list already exists
- Related: OPH-51 (Tenant Company Logo) — tenant logo in header is the click target

---

## Overview

Platform admins need to view Stammdaten (Article Catalog, Customer Catalog, Dealer Mappings, Außendienstler) scoped to a specific tenant. Currently these pages are scoped by the logged-in user's own `tenant_id`. This feature lets a platform admin pick any tenant as their active "context", so Stammdaten pages display data for that tenant.

---

## User Stories

1. As a platform admin, I want to click the tenant logo in the top navigation to open a tenant switcher modal, so I can select which tenant's data I want to view.
2. As a platform admin, I want to search tenants by name in the modal, so I can quickly find the right tenant from a long list.
3. As a platform admin, I want to see which tenant is currently active in the header, so I always know whose data I'm looking at.
4. As a platform admin, I want to be asked for confirmation before the tenant context switches, so I don't accidentally change it mid-workflow.
5. As a platform admin, I want the Article Catalog, Customer Catalog, Dealer Mappings, and Außendienstler pages to show data for my selected tenant context, so I can review and support tenant data without needing a separate login.

---

## Acceptance Criteria

### Security — platform_admin only (HIGH PRIORITY)
- [ ] AC-S1: The tenant switcher modal is ONLY available to users with `role === "platform_admin"`. The role check MUST use `app_metadata.role` from the authenticated session (not the `user_profiles` table, which could be tampered with via RLS bypass).
- [ ] AC-S2: `tenant_admin`, `tenant_user`, and all other roles MUST NOT see, trigger, or interact with the tenant switcher in any way. The logo remains a static image for them.
- [ ] AC-S3: The `usePlatformTenantContext` hook MUST return `null` and refuse to set a context for any non-`platform_admin` user — even if `localStorage` contains a stale value from a previous session.
- [ ] AC-S4: The admin tenant APIs (`/api/admin/tenants/[id]/articles`, etc.) already enforce `platform_admin` role server-side. This feature does NOT bypass that — Stammdaten pages use the admin API only when `platform_admin` context is active. A `tenant_admin` calling the admin API directly receives a 403.

### Trigger — clicking the tenant logo
- [ ] AC-1: On all pages, the tenant logo in the top navigation is rendered as a clickable button ONLY for `platform_admin` users.
- [ ] AC-2: Clicking the logo opens the "Mandant wechseln" modal.
- [ ] AC-3: For `tenant_admin`, `tenant_user`, and all other roles, the logo remains non-clickable (no regression).

### Modal — tenant selection
- [ ] AC-4: The modal lists all tenants with their name and logo (if available).
- [ ] AC-5: The modal has a search field that filters tenants by name in real time (case-insensitive).
- [ ] AC-6: The currently active tenant is highlighted (e.g., checkmark or distinct styling).
- [ ] AC-7: The modal has a "Mandant wechseln" primary button that is disabled until a different tenant is selected.
- [ ] AC-8: The modal has a "Abbrechen" secondary button that closes without making a change.

### Confirmation step
- [ ] AC-9: Clicking "Mandant wechseln" in the modal shows a second confirmation prompt: "Möchten Sie wirklich zu [Tenant Name] wechseln?" with "Bestätigen" and "Abbrechen" buttons.
- [ ] AC-10: Clicking "Abbrechen" in the confirmation returns to the selection modal (not closes it entirely).
- [ ] AC-11: Clicking "Bestätigen" applies the tenant context and closes the modal.

### Active tenant context
- [ ] AC-12: After switching, the tenant logo in the header updates to show the newly selected tenant's logo.
- [ ] AC-13: The selected tenant context is persisted in `localStorage` so it survives page navigation within the same browser session.
- [ ] AC-14: On first load (no stored context), no tenant is pre-selected — the admin must explicitly pick one.
- [ ] AC-15: A visible indicator (e.g., badge or label beneath/beside the logo) shows the active tenant name to the platform admin.

### Stammdaten pages — scoped to active tenant
- [ ] AC-16: The Article Catalog page (`/admin/tenants/[id]/articles` or equivalent Stammdaten route) fetches and displays articles for the active tenant context.
- [ ] AC-17: The Customer Catalog page fetches and displays customers for the active tenant context.
- [ ] AC-18: The Dealer Mappings page fetches and displays mappings for the active tenant context.
- [ ] AC-19: The Außendienstler page fetches and displays sales reps for the active tenant context.
- [ ] AC-20: If no tenant context is selected, Stammdaten pages show an empty state prompt: "Bitte wählen Sie zuerst einen Mandanten aus."

### Non-Stammdaten pages — unaffected
- [ ] AC-21: The Orders pages, Admin Händler-Verwaltung, Admin Mandanten-Verwaltung, and all other admin pages are NOT affected by the tenant context switcher — they continue to work as before.

---

## Edge Cases

- **Tenant admin tries to access switcher:** Not possible — the clickable button, the modal component, and the context hook all guard on `role === "platform_admin"` from `app_metadata`. Even if a tenant admin manually sets `localStorage`, the hook ignores it and the admin APIs return 403.
- **Role downgrade mid-session:** If a user's role changes from `platform_admin` to `tenant_admin` while logged in, the hook re-checks the role on mount. Stale `localStorage` is ignored because the role guard rejects it.
- **No tenants exist:** Modal shows empty state "Keine Mandanten gefunden."
- **Search returns no results:** Modal shows "Kein Mandant gefunden" beneath the search field.
- **Selected tenant is deleted:** On next page load, stored context is invalid; fall back to no selection and show the empty state prompt on Stammdaten pages.
- **Logo URL broken:** Show placeholder (initials or generic icon) for tenants without a logo in the modal list.
- **Platform admin has own tenant_id:** The switcher overrides context for Stammdaten; their own `tenant_id` from `app_metadata` is irrelevant for this flow.
- **Concurrent tabs:** Switching tenant in one tab does not affect other tabs (localStorage is per-tab-readable but we don't need cross-tab sync for this feature).

---

## Technical Notes (for Architecture)

- Tenant context should be stored as `platform_admin_tenant_context` in `localStorage` (key: `{ tenantId, tenantName, tenantLogoUrl }`).
- A React context/hook (e.g. `usePlatformTenantContext`) should expose the active tenant to Stammdaten pages.
- The hook is only used on Stammdaten pages; all other pages ignore it.
- The modal fetches the tenant list from an existing API (e.g. `GET /api/admin/tenants`).
- No new database tables are needed — this is purely client-side session state.

---

## Tech Design (Solution Architect)

### Overview

This is a **frontend-only feature** — no new API routes, no database changes, no migrations needed. All the backend APIs required already exist.

The key insight is that `useArticleCatalog`, `useCustomerCatalog`, and related hooks already support an `adminTenantId` option that switches them to use `/api/admin/tenants/[id]/...` instead of the user's own tenant APIs. This feature simply wires up a globally-shared tenant selection to feed that existing `adminTenantId` parameter.

---

### Component Structure

```
TopNavigation (layout/top-navigation.tsx)
  +-- TenantLogoDisplay (layout/tenant-logo-display.tsx)  [MODIFIED]
  |     Platform admins: wrapped in a clickable button
  |     Non-admins: unchanged (no regression)
  |
  +-- TenantSwitcherModal (layout/tenant-switcher-modal.tsx)  [NEW]
        +-- Search Input (shadcn/ui Input)
        +-- Tenant List
        |     +-- TenantListItem (logo + name + checkmark if active)
        |     +-- Empty State ("Keine Mandanten gefunden")
        |
        Step 1: Selection View
          +-- "Mandant wechseln" Button (disabled until different tenant picked)
          +-- "Abbrechen" Button
        Step 2: Confirmation View (inline, replaces list)
          +-- "Möchten Sie wirklich zu [Name] wechseln?"
          +-- "Bestätigen" Button  →  applies context, closes modal
          +-- "Zurück" Button  →  returns to Step 1

Stammdaten Pages  [MODIFIED — consume context]
  /settings/article-catalog/page.tsx
  /settings/customer-catalog/page.tsx
  /settings/dealer-mappings/page.tsx
  /settings/aussendienstler/page.tsx
    Each page:
      +-- "Kein Mandant ausgewählt" empty state  (when no context selected)
      +-- Tenant context badge/label at top      (when context is set)
      +-- Normal page content scoped to selected tenant

Context & Hooks  [NEW]
  hooks/use-platform-tenant-context.ts   — reads/writes localStorage, exposes state
  context/platform-tenant-context.tsx    — React Context Provider wrapping AppLayout
```

---

### Data Model

**No database tables.** The selected tenant context lives entirely in the browser.

**localStorage key:** `platform_admin_tenant_context`

**Stored value (JSON):**
- `tenantId` — the UUID of the selected tenant
- `tenantName` — display name (so we can show it without an extra API call)
- `tenantLogoUrl` — logo URL for the header (null if none)

**Tenant list** (fetched on demand when the modal opens):
- Comes from the existing `GET /api/admin/tenants` API
- Each entry: `id`, `name`, `logo_url`
- Fetched fresh each time the modal opens (no caching needed)

---

### How the Stammdaten Pages Change

The existing `ArticleCatalogPage` component already accepts an `adminTenantId` prop — it switches the API calls from `/api/articles` (user's own tenant) to `/api/admin/tenants/[id]/articles` (admin access for another tenant). The same pattern exists in `useCustomerCatalog`.

For this feature, the Stammdaten page routes simply read the active tenant context and pass it as `adminTenantId`. When the context is `null` (no tenant selected), the pages show an empty state instead of the normal content.

Dealer Mappings and Außendienstler follow the same pattern — their hooks already accept a tenant override or can be extended to do so.

---

### Tech Decisions

| Decision | Why |
|----------|-----|
| `localStorage` (not server session) | No backend changes needed. Context survives page navigation. Platform admins work in a single browser — cross-device sync is not needed. |
| React Context Provider | Makes the selected tenant available to any component in the tree without prop-drilling through AppLayout → Page → Component. |
| 2-step confirmation (in-modal, not a separate Dialog) | Keeps the flow tight. The spec calls for confirmation but a full second Dialog would be heavy. An inline view swap in the same modal is simpler and less disruptive. |
| Reuse existing `adminTenantId` pattern | `useArticleCatalog` and `useCustomerCatalog` already support this. Zero new API surface; just wire up the context. |
| Fetch tenants fresh on modal open | The tenant list rarely changes. A fresh fetch on each open avoids stale data without needing cache invalidation. |
| **Role check via `app_metadata` (not `user_profiles`)** | **SECURITY:** `app_metadata` is set server-side by Supabase Auth and cannot be modified by the client. `user_profiles` is a regular table with RLS — relying on it for authorization would be weaker. The `useCurrentUserRole` hook already reads from `app_metadata`, so we reuse that. |
| **Defense in depth: client guard + server guard** | **SECURITY:** Even though the UI is guarded to `platform_admin` only, the actual data APIs (`/api/admin/tenants/[id]/...`) independently verify `platform_admin` role server-side. A `tenant_admin` cannot get another tenant's data even if they manipulate `localStorage` or call the API directly. |

---

### No New Dependencies

All needed UI components are already installed: `Dialog`, `Input`, `Button`, `Badge`, `Separator`, `Skeleton` from shadcn/ui.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
