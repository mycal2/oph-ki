# OPH-50: Dealer Count per Tenant on Admin Mandanten-Verwaltung

## Status: Planned

## Created: 2026-03-24

## Summary
Show the count of distinct dealers from which each tenant has received orders, on the admin Mandanten-Verwaltung (tenant management) page.

## Problem
Platform admins currently have order count statistics per tenant, but no visibility into how many distinct dealers are sending orders to each tenant. This makes it hard to understand a tenant's dealer footprint at a glance.

## User Stories

1. **As a platform admin**, I want to see how many distinct dealers have sent orders to each tenant, so I can quickly assess a tenant's dealer footprint without drilling into each tenant.

2. **As a platform admin**, I want the dealer count shown in the tenant list table alongside other order stats, so all key metrics are visible in one place.

3. **As a platform admin**, I want tenants with zero recognized dealers to show "0" (not blank), so it's clear no dealer recognition has happened yet.

4. **As a platform admin**, I want the dealer count to reflect only orders where a dealer was actually recognized (dealer_id is not null), so unrecognized orders don't inflate the number.

5. **As a platform admin**, I want the dealer count to update in real time as I refresh the tenant list, so it reflects the current state of the data.

## Acceptance Criteria

### AC-1: New "Händler" column in tenant table
- [ ] The tenant admin table has a new column "Händler" (or "Erkannte Händler")
- [ ] The column shows the count of distinct dealers from which the tenant has received at least one order with a recognized `dealer_id`
- [ ] The count is a non-negative integer; tenants with no recognized dealer orders show `0`

### AC-2: Data accuracy
- [ ] Only orders where `dealer_id IS NOT NULL` are counted
- [ ] Each distinct `dealer_id` is counted once per tenant, regardless of how many orders that dealer sent
- [ ] The count matches the result of: `SELECT COUNT(DISTINCT dealer_id) FROM orders WHERE tenant_id = $1 AND dealer_id IS NOT NULL`

### AC-3: Performance
- [ ] The dealer count is fetched in a single efficient query alongside existing order stats (not N+1 queries)
- [ ] Ideally added to the existing `get_tenant_order_stats` RPC or fetched in a parallel query

### AC-4: Display
- [ ] The column is visible on large screens (hidden on mobile like similar stats columns)
- [ ] The value is right-aligned and uses `tabular-nums` for alignment
- [ ] No loading state needed beyond the existing table skeleton

### AC-5: CSV export
- [ ] The tenant CSV export includes the dealer count column as "Händler (erkannt)"

## Edge Cases

1. **Tenant with no orders** → dealer count = 0
2. **Tenant with orders but no recognized dealers** → dealer count = 0 (all orders have `dealer_id = NULL`)
3. **Same dealer sends 100 orders** → dealer count = 1 (distinct count)
4. **Tenant just created** → dealer count = 0

## Out of Scope
- Listing which specific dealers a tenant has orders from (that's on the tenant detail page)
- Filtering the tenant list by dealer count
- Showing dealer count in the tenant detail page (separate concern)

## Dependencies
- Requires: OPH-8 (Admin Tenant Management) — adds a column to the existing tenant table
- Related: OPH-3 (Dealer Recognition) — orders get a `dealer_id` when a dealer is recognized

---

## Tech Design (Solution Architect)

### Component Structure

```
Admin Mandanten-Verwaltung Page (unchanged)
+-- TenantAdminTable (existing)
    +-- Toolbar (unchanged)
    +-- Table
        +-- TableHeader
        |   +-- ... existing columns ...
        |   +-- [NEW] "Händler" column header (hidden on small screens)
        +-- TableBody
            +-- TableRow (per tenant)
                +-- ... existing cells ...
                +-- [NEW] dealer_count cell (right-aligned, tabular-nums, hidden sm)
```

Only the table component and the data feeding it need to change.

---

### Data Flow

```
Database (orders table)
  → get_tenant_order_stats RPC  [EXTEND: add dealer_count]
  → GET /api/admin/tenants      [EXTEND: read dealer_count from RPC]
  → TenantAdminListItem type    [EXTEND: add dealer_count field]
  → TenantAdminTable component  [EXTEND: render new column]
  → CSV export                  [EXTEND: add "Händler (erkannt)" column]
```

No new tables, no new API routes. Every layer is a small extension of existing code.

---

### Data Model Extension

The existing `TenantAdminListItem` gains one new field:

```
dealer_count: number
  - How many distinct dealers have sent recognized orders to this tenant
  - A dealer is "recognized" when an order has a non-null dealer_id
  - Count is 0 if no recognized orders exist for the tenant
```

Stored in: PostgreSQL `orders` table (already exists). No schema migration needed — this is a read-only aggregate.

---

### Tech Decisions

**Extend the existing RPC, don't create a new query**
The `get_tenant_order_stats` database function already aggregates order stats per tenant in one efficient query. Adding `COUNT(DISTINCT dealer_id)` to that same aggregation is free — it runs in the same scan. Creating a separate query would double the database round-trips for no benefit.

**No schema migration needed**
The `dealer_id` column on orders already exists (added in OPH-3). This feature only reads existing data with a new aggregation — no table changes required.

**Column hidden on small screens**
Consistent with the existing pattern: `orders_last_month`, `last_upload_at`, and `created_at` are all hidden on small/medium screens. The dealer count follows the same responsive pattern.

---

### Dependencies
No new packages required. All UI primitives (Table, TableHead, TableCell) are already in use.

---

### Build Plan
1. **Backend:** Extend the `get_tenant_order_stats` Supabase RPC to include `dealer_count`
2. **Type:** Add `dealer_count: number` to `TenantAdminListItem`
3. **API route:** Read `dealer_count` from RPC result and include it in the response
4. **Frontend:** Add "Händler" column to `TenantAdminTable`
5. **CSV export:** Add dealer count to the admin tenant CSV export
