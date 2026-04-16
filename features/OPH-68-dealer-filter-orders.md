# OPH-68: Dealer Filter Dropdown on Orders Page

## Status: In Progress
**Created:** 2026-04-15
**Last Updated:** 2026-04-16

## Dependencies
- Requires: OPH-11 (Bestellhistorie & Dashboard) — provides the orders list page and filter state
- Requires: OPH-18 (Admin: Cross-Tenant Order View) — established server-side filter pattern this feature follows
- Requires: OPH-3 (Händler-Erkennung & Händler-Profile) — dealers table and dealer data

## Problem Context

The `/orders` page has filters for status, date range, and (for platform admins) tenant. There is no way to filter orders by dealer. Tenant admins and platform admins frequently need to see all orders from a specific dealer — for example, to spot-check a dealer's extraction quality or investigate a recurring issue. Without this filter, they must scroll through pages of orders or rely on the search field which matches loosely across all fields.

## User Stories

- As a **tenant admin**, I want to filter the orders list by dealer so that I can quickly see all orders from a specific dealer without scrolling through the full list.
- As a **platform admin**, I want to filter orders by dealer (across all tenants or within a selected tenant) so that I can investigate dealer-specific issues across the platform.
- As a **tenant admin**, I want the dealer dropdown to only show dealers that appear in my tenant's orders so that the list is not cluttered with irrelevant dealers.
- As a **platform admin**, I want the dealer dropdown to update when I change the tenant filter so that dealers shown are relevant to the selected tenant.
- As a **tenant user**, I do not see the dealer filter at all — it is a management-level view not relevant to my daily work.

## Acceptance Criteria

### Dealer Filter Dropdown
- [ ] A "Händler" dropdown appears in the orders filter bar, visible only to `tenant_admin` and `platform_admin` roles. `tenant_user` does not see this filter.
- [ ] The dropdown shows a "Alle Händler" option (default) that shows orders regardless of dealer.
- [ ] The dropdown lists all dealers that have at least one order for the current tenant scope (not all dealers in the system).
- [ ] Selecting a dealer filters the orders list server-side to show only orders associated with that dealer.
- [ ] The dealer filter is applied server-side (not by slicing the current page client-side).
- [ ] The dealer filter works in combination with all other filters (status, date range, tenant, search).
- [ ] The selected dealer filter persists across page navigation (page 2, page 3 etc.) until cleared.
- [ ] When the platform admin changes the tenant filter, the dealer dropdown resets to "Alle Händler" and its options refresh to reflect the newly selected tenant's dealers.
- [ ] The dealer list is loaded once on mount (not re-fetched on every filter change).

### API Changes
- [ ] `GET /api/orders` accepts an optional `dealerId` query parameter.
- [ ] When `dealerId` is provided, the count query and data query both apply `eq("dealer_id", dealerId)`.
- [ ] A tenant_admin can only filter by dealers within their own tenant — passing a `dealerId` from a different tenant returns no results (the existing tenant scoping in the query handles this automatically).
- [ ] A platform admin can filter by any dealer (or dealer within the currently selected tenant).

### Dealer Options Endpoint
- [ ] The existing `GET /api/dealers` endpoint (or a new lightweight variant) returns the list of dealer options for the dropdown.
- [ ] For tenant admins, only dealers that appear in their tenant's orders are returned.
- [ ] For platform admins, when a tenantId filter is active, only dealers for that tenant are returned; with no tenant filter, all dealers with at least one order are returned.
- [ ] Each option contains `id` and `name`.

## Edge Cases

- **Tenant with no orders yet:** Dealer dropdown shows only "Alle Händler" — no dealer options.
- **Order with no dealer recognised (dealer_id is null):** These orders are shown when "Alle Händler" is selected. There is no "Unbekannter Händler" option — unrecognised orders are simply visible in the unfiltered view.
- **Platform admin with no tenant selected:** Dropdown shows all dealers that have at least one order across all tenants.
- **Dealer filter with zero results:** The orders table shows the empty state ("Keine Bestellungen gefunden.") — same as any other filter with no results.
- **Changing tenant filter resets dealer filter:** When a platform admin switches from Tenant A to Tenant B, the dealer filter reverts to "Alle Händler" because Tenant B may not have any orders from the previously selected dealer.
- **Role change mid-session:** If a user's role changes, the page re-fetches and the dealer dropdown visibility updates accordingly.

## Technical Requirements

- **No new database migrations** — dealer_id already exists on orders; dealers table already exists.
- **Server-side filtering only** — dealer filter applied in the Supabase query, not in JavaScript after fetch.
- **Dealer options** — fetched once per page load (or when tenant filter changes). Can reuse `GET /api/dealers` or query directly with a distinct `dealer_id` from the orders table scoped to the current tenant.
- **OrdersFilterState** in `src/lib/types.ts` needs `dealerId?: string` added.
- **Component reuse:** Follow the exact same pattern as the tenant filter dropdown in `src/components/orders/orders-list.tsx`.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

```
OrdersList (src/components/orders/orders-list.tsx)  ← only file that changes
+-- OrdersFilterBar (existing, unchanged)
+-- Tenant Filter Row (existing, platform_admin only)
+-- Dealer Filter Row  ← NEW (tenant_admin + platform_admin)
|   +-- Store icon + "Händler:" label
|   +-- Select dropdown (shadcn/ui Select — already installed)
|       +-- "Alle Händler" option (default)
|       +-- [DealerOption, DealerOption, ...]
+-- Orders Table (existing, unchanged)
+-- Pagination (existing, unchanged)
```

No new component files are needed — the dealer filter row is added inline inside `OrdersList`, exactly mirroring the tenant filter row directly above it.

### Data Flow

```
Page load / tenant filter changes
  → fetch GET /api/orders/dealers?tenantId=X   (new lightweight endpoint)
  → populate dealer dropdown options

User selects a dealer
  → dealerId stored in filters state + sessionStorage
  → triggers re-fetch of GET /api/orders?dealerId=X&...
  → orders table re-renders with filtered results

User changes tenant filter (platform admin)
  → dealer filter resets to "Alle Händler"
  → dealer options re-fetched with new tenantId
```

### What Gets Built

**1. New API endpoint — `GET /api/orders/dealers`**

A lightweight read-only endpoint that returns the distinct dealers (id + name) that have at least one order within the caller's scope:
- For a `tenant_admin`: scoped automatically to their own `tenant_id` from the JWT.
- For a `platform_admin`: accepts an optional `?tenantId=X` query param; without it, returns all dealers that appear in any order.

This is a new endpoint rather than modifying the existing `GET /api/dealers` because that endpoint returns all globally active dealers (not scoped to orders). We need "dealers that have orders here", which is a different query.

**2. Updated `GET /api/orders` — add `dealerId` param**

One new optional query param `dealerId` added to the existing orders API. When present, both the count query and the data query gain `.eq("dealer_id", dealerId)`. The existing tenant scoping ensures a `tenant_admin` cannot leak orders from another tenant even if they craft a request manually.

**3. Updated `OrdersFilterState` type**

`dealerId?: string` added to the existing interface in `src/lib/types.ts` — same pattern as `tenantId` added for OPH-18.

**4. Updated `OrdersList` component**

Three additions inside the existing client component:
- State for `dealerOptions` (array of `{id, name}`)
- Effect to fetch dealer options on mount and when the tenant filter changes
- A rendered dealer filter row (visible to `tenant_admin` and `platform_admin`, hidden from `tenant_user`)

The `handleTenantChange` callback is also extended to reset `dealerId` to `ALL_DEALERS` and re-fetch dealer options when the tenant switches.

### Why This Approach

**Separate endpoint, not modifying `/api/dealers`:** The existing dealers endpoint is a global catalogue (used in recognition settings, column mapping etc.). We don't want to couple it to order history. The new `/api/orders/dealers` endpoint answers a specific question: "which dealers appear in this tenant's orders?"

**Server-side filtering (not client-side):** The existing orders list is paginated. Filtering client-side would only filter the current page's 25 results, not the full dataset — the same problem that caused the OPH-18 bug. All filtering must happen in the Supabase query.

**SessionStorage persistence:** The dealer filter is stored in `sessionStorage` (same as the tenant filter), so navigating to an order detail page and returning preserves the filter selection.

**Reset on tenant change:** When a platform admin switches tenants, the dealer list for the old tenant is irrelevant. Resetting the dealer filter to "Alle Händler" before re-fetching options avoids showing a stale dealer selection that doesn't match the new tenant's data.

### No New Packages

All UI components needed (Select, Badge, icon) are already installed. No new dependencies.

### Files Changed

| File | Change |
|------|--------|
| `src/app/api/orders/dealers/route.ts` | New endpoint — returns distinct dealers from orders |
| `src/app/api/orders/route.ts` | Add `dealerId` query param support |
| `src/lib/types.ts` | Add `dealerId?: string` to `OrdersFilterState` |
| `src/components/orders/orders-list.tsx` | Add dealer filter state, fetch, and dropdown UI |

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
