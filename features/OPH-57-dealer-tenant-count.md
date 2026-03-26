# OPH-57: Tenant Count per Dealer in Händler-Verwaltung

## Status: In Review
**Created:** 2026-03-25
**Last Updated:** 2026-03-25

## Dependencies
- OPH-3 (Händler-Erkennung & Händler-Profile) — dealer list page exists
- OPH-8 (Admin: Mandanten-Management) — tenant data exists

## User Stories
- As a platform admin, I want to see how many distinct tenants have sent orders via each dealer, so that I can understand which dealers are shared across multiple tenants vs. exclusive to one.
- As a platform admin, I want the tenant count displayed in the dealer list table, so that I can assess dealer reach at a glance without clicking into each dealer profile.
- As a platform admin, I want dealers with zero tenant orders to show "0", so that new or unused dealers are clearly identifiable.

## Acceptance Criteria

### Dealer list table
- [ ] A new column "Mandanten" is added to the dealer table in `/admin/dealers`
- [ ] The column shows the count of distinct tenants that have at least one order attributed to this dealer
- [ ] The column is visible on desktop and hidden on small screens (consistent with other hidden columns like "Letzte Bestellung")
- [ ] Dealers with no orders show `0`
- [ ] The count reflects all-time data (not period-filtered)

### Data
- [ ] The tenant count is returned by the `GET /api/admin/dealers` API alongside the existing `order_count` and `last_order_at`
- [ ] The count is computed efficiently (aggregated in the database, not in application code)

## Edge Cases
- Dealer has orders from only one tenant → shows `1`
- Dealer has orders from multiple tenants → shows the correct distinct count
- Dealer exists but has never been matched to any order → shows `0`
- Two orders from the same tenant for the same dealer → counts as `1`, not `2`

## Technical Notes
- Extend the existing `get_dealer_order_stats` RPC (or equivalent query) to also return `tenant_count` per dealer
- Add `tenant_count: number` to the `DealerAdminListItem` type
- Add the column to `dealer-admin-table.tsx`

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results

**Tested:** 2026-03-25
**App URL:** http://localhost:3003
**Tester:** QA Engineer (AI)

### Acceptance Criteria Status

#### AC-1: Dealer list table -- "Mandanten" column
- [x] A new column "Mandanten" is added to the dealer table in `/admin/dealers` (line 132 in dealer-admin-table.tsx)
- [x] The column shows the count of distinct tenants (`COUNT(DISTINCT o.tenant_id)` in the RPC)
- [x] The column is visible on desktop (`lg:table-cell`) and hidden on small screens -- consistent with "Letzte Bestellung" column which also uses `hidden lg:table-cell`
- [x] Dealers with no orders show `0` (API defaults to `stats?.tenantCount ?? 0`, line 80)
- [x] The count reflects all-time data (the SQL query has no date filter)

#### AC-2: Data -- API and efficient computation
- [x] The tenant count is returned by `GET /api/admin/dealers` as the `tenant_count` field on `DealerAdminListItem`
- [x] The count is computed in the database via `get_dealer_order_stats()` RPC using `COUNT(DISTINCT o.tenant_id)` -- no N+1 or application-side aggregation

### Edge Cases Status

#### EC-1: Dealer has orders from only one tenant
- [x] Handled correctly -- `COUNT(DISTINCT o.tenant_id)` returns 1

#### EC-2: Dealer has orders from multiple tenants
- [x] Handled correctly -- `COUNT(DISTINCT o.tenant_id)` returns the correct distinct count

#### EC-3: Dealer exists but has never been matched to any order
- [x] Handled correctly -- dealer will not appear in the RPC result set, so `statsByDealer.get(d.id)` returns undefined, and `stats?.tenantCount ?? 0` defaults to `0`

#### EC-4: Two orders from the same tenant for the same dealer
- [x] Handled correctly -- `COUNT(DISTINCT o.tenant_id)` counts distinct, so duplicate tenant orders still yield `1`

### Cross-Browser / Responsive (Code Review)
- [x] Column header uses `hidden lg:table-cell` -- hidden below 1024px (mobile 375px, tablet 768px), visible on desktop 1440px
- [x] Cell uses matching `hidden lg:table-cell text-right tabular-nums` -- consistent rendering
- [x] No browser-specific CSS or JS used -- standard Tailwind classes, cross-browser safe

### Security Audit Results
- [x] Authentication: `GET /api/admin/dealers` is gated by `requirePlatformAdmin()` -- non-admins cannot access
- [x] Authorization: The RPC is `SECURITY DEFINER` and called via the admin service-role client -- regular users cannot invoke it
- [x] Input validation: No new user inputs introduced by this feature (read-only column)
- [x] Data exposure: `tenant_count` is an integer count, not a list of tenant names/IDs -- no data leakage risk
- [ ] BUG: Migration 039 missing `SET search_path = public` on SECURITY DEFINER function (see BUG-1)
- [ ] BUG: Fallback path when RPC fails silently shows 0 for all tenant counts (see BUG-2)

### Regression Testing
- [x] Build passes (`npm run build` succeeds with no errors)
- [x] Existing columns (Name, Ort, Format, Bestellungen, Letzte Bestellung, Status) unchanged in the table component
- [x] `DealerAdminListItem` type extended additively -- no breaking changes to existing consumers
- [x] The RPC `get_dealer_order_stats` return signature extended (new column added) -- existing consumers that only read `dealer_id`, `order_count`, `last_order_at` will continue to work as before
- [x] Bootstrap schema updated to match the migration (line 92-101 in schema-bootstrap.sql)

### Bugs Found

#### BUG-1: Migration 039 missing `SET search_path = public` on SECURITY DEFINER function
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Open `supabase/migrations/039_oph57_dealer_tenant_count.sql`
  2. The function is declared with `SECURITY DEFINER` but does NOT include `SET search_path = public`
  3. The bootstrap schema version of the same function DOES include `SET search_path = public`
  4. Expected: Migration should match bootstrap and include `SET search_path = public` to prevent search_path hijacking
  5. Actual: `SET search_path = public` is missing from the migration
- **Priority:** Fix before deployment -- security best practice for SECURITY DEFINER functions. Without it, a malicious schema could shadow the `orders` table if the function is called in a context where the search_path includes untrusted schemas.

#### BUG-2: Fallback path silently returns tenant_count=0 for all dealers when RPC fails
- **Severity:** Low
- **Steps to Reproduce:**
  1. If the `get_dealer_order_stats` RPC call fails (e.g., function not yet deployed, transient DB error), the code falls back to a raw query on `orders` (lines 48-66 in route.ts)
  2. The fallback query only fetches `dealer_id` -- it does NOT fetch `tenant_id` and cannot compute `tenant_count`
  3. The fallback sets `tenantCount: 0` for all dealers
  4. Expected: Fallback should either also compute tenant_count or clearly indicate the count is unavailable
  5. Actual: Silently shows 0, which could be misleading (admin might think no tenants use the dealer)
- **Priority:** Fix in next sprint -- the RPC should always be available in production; this is only a concern during migration rollout or if the RPC is dropped. Low probability but misleading when it occurs.

### Summary
- **Acceptance Criteria:** 7/7 passed
- **Edge Cases:** 4/4 passed
- **Bugs Found:** 2 total (0 critical, 0 high, 1 medium, 1 low)
- **Security:** 1 medium issue (missing search_path on SECURITY DEFINER function in migration)
- **Production Ready:** YES (with recommendation to fix BUG-1 before deployment as a quick one-line fix)

## Deployment
_To be added by /deploy_
