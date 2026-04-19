# OPH-88: Salesforce App — Order History Search & Date Filter

## Status: In Review
**Created:** 2026-04-18
**Last Updated:** 2026-04-18
**PRD:** [Salesforce App PRD](../docs/salesforce-prd.md)

## Dependencies
- OPH-81 (SF-10): Order History — the order list component and `/api/sf/orders` endpoint this feature enhances

## User Stories
- As a sales rep with many orders, I want to search by dealer name or customer number so that I can quickly find a specific order without scrolling through hundreds of results.
- As a sales rep, I want to filter orders by date so that I can narrow down orders from a specific time period.
- As a sales rep, I want to clear my search and filters with one tap so that I can return to the full order list.
- As a sales rep, I want pagination to still work when I search or filter so that I can load more matching results if there are many.

## Acceptance Criteria
- [ ] A search input is displayed above the order list on the order history page (`/sf/[slug]/orders`).
- [ ] Typing in the search input filters orders by dealer name or customer number (partial match, case-insensitive). The search is sent to the server — not filtered client-side — so all pages are searched, not just the loaded ones.
- [ ] Search is debounced: the API is called only after the user stops typing for 400ms (to avoid excessive requests).
- [ ] A date filter is displayed next to (or below) the search input. The filter offers quick preset options: **Alle** (default), **Dieser Monat**, **Letzte 3 Monate**, **Dieses Jahr**.
- [ ] When a search term or date filter is applied, the order list resets to page 1 (previous results cleared).
- [ ] When a search term is active, the total count shown reflects the filtered result count, not the total order count.
- [ ] The "Mehr laden" button continues to work when search or date filter is active, loading more matching results.
- [ ] A "Zurücksetzen" (reset) control clears both search and date filter and reloads the full list.
- [ ] If the search/filter combination returns no results, the empty state reads: **"Keine Bestellungen gefunden."** with the reset control visible.
- [ ] The search input and date filter are NOT shown on the embedded order history on the profile page — they appear only on the dedicated `/orders` page.

## Edge Cases
- Search term is whitespace only: treat as empty (no filter applied).
- Search returns 0 results: show "Keine Bestellungen gefunden." with a reset button; do NOT show the "Noch keine Bestellungen" CTA to start a new order.
- Network error while searching: show existing inline error state with a retry button.
- User changes filter while a previous request is still in flight: cancel/ignore the stale response (use an abort controller or ignore stale results).
- Date preset "Dieser Monat" on the first day of the month: should include today.
- Very fast typing: debounce ensures only one request fires per pause.
- Search + date filter combined: both filters are applied simultaneously (AND logic).

---

## Tech Design (Solution Architect)

### Overview
Two focused changes: (1) the `GET /api/sf/orders` endpoint gains two new optional query parameters (`search` and `datePreset`), and (2) the `SalesforceOrderHistory` component gains a search bar and date preset selector that trigger a fresh fetch when changed.

The profile page embedding is unchanged — the component will accept a new `showSearch` prop (default `false`) so the profile page gets no controls.

No new routes, no database table changes.

### Component Changes

```
SalesforceOrderHistory (MODIFY)
  ├── props: slug, showSearch (new, default false)
  ├── Search bar (shown only when showSearch=true)
  │   +-- Input with search icon
  │   +-- 400ms debounce before firing API call
  │   +-- "Zurücksetzen" link (shown when search or filter is active)
  ├── Date filter (shown only when showSearch=true)
  │   +-- Button group / segmented control: Alle | Dieser Monat | Letzte 3 Monate | Dieses Jahr
  ├── Order list (unchanged)
  └── "Mehr laden" button (works with filters active)

sf/[slug]/orders/page.tsx (MODIFY)
  └── Pass showSearch={true} to SalesforceOrderHistory

sf/[slug]/profile/page.tsx (no change)
  └── Continues to render SalesforceOrderHistory without showSearch (defaults to false)
```

### API Changes

`GET /api/sf/orders` gains two new optional query params:

| Param | Type | Example | Behaviour |
|---|---|---|---|
| `search` | string | `?search=meisinger` | Filters by dealer name or customer number (ILIKE `%value%` on JSONB fields) |
| `datePreset` | string | `?datePreset=thisMonth` | `thisMonth`, `last3Months`, `thisYear`; absent = no filter |

Both params are optional and backward-compatible. Existing calls without these params return all orders as before.

### Files

| File | Change |
|---|---|
| `src/app/api/sf/orders/route.ts` | Add `search` and `datePreset` param handling to the GET handler |
| `src/components/salesforce/salesforce-order-history.tsx` | Add `showSearch` prop, search input, date preset selector, reset control; refetch on change |
| `src/app/sf/[slug]/orders/page.tsx` | Pass `showSearch={true}` to the component |

## QA Test Results

**Tested:** 2026-04-18
**Tester:** QA Engineer (AI)
**Method:** Code review + build verification (production build passes)

### Acceptance Criteria Status

#### AC-1: Search input displayed above order list on /sf/[slug]/orders
- [x] PASS: `SalesforceOrderHistory` renders a search `<Input>` when `showSearch=true`. The orders page passes `showSearch` (boolean shorthand for `true`) on line 33 of `src/app/sf/[slug]/orders/page.tsx`.

#### AC-2: Server-side search by dealer name or customer number (partial, case-insensitive)
- [x] PASS: API route applies ILIKE filter on `extracted_data->order->dealer->>name`, `extracted_data->order->sender->>company_name`, and `extracted_data->order->sender->>customer_number` using OR logic. Search is server-side, not client-side.
- [ ] BUG-1 (see below): PostgREST filter injection risk due to unescaped special characters in search input.

#### AC-3: Search is debounced at 400ms
- [x] PASS: Debounce timer of 400ms is implemented in the `useEffect` on `searchInput` (line 188).

#### AC-4: Date filter with quick presets (Alle, Dieser Monat, Letzte 3 Monate, Dieses Jahr)
- [x] PASS: `DATE_PRESET_OPTIONS` array defines exactly these four options. Button group renders them. API route handles `thisMonth`, `last3Months`, `thisYear` presets.
- [ ] BUG-2 (see below): "Letzte 3 Monate" date calculation can overflow when current day exceeds the number of days in the target month.

#### AC-5: Search/date filter resets to page 1
- [x] PASS: Both `handleDatePresetChange` (line 209) and the debounced search callback (line 191) call `setPage(1)` and `setOrders([])` before fetching.

#### AC-6: Total count reflects filtered results
- [x] PASS: API query uses `{ count: "exact" }` which returns count reflecting all applied filters. Component shows `{total} Bestellungen gefunden` when filter is active (line 388).

#### AC-7: "Mehr laden" works with active search/date filter
- [x] PASS: `handleLoadMore` (line 224) passes `activeSearch` and `datePreset` to `fetchOrders`, and `append=true` concatenates new results.

#### AC-8: "Zurucksetzen" control clears both search and date filter
- [x] PASS: `handleReset` (line 215) clears `searchInput`, `activeSearch`, `datePreset`, resets page, and refetches with empty filters. Shown when `isFilterActive` is true (line 273).

#### AC-9: Empty state shows "Keine Bestellungen gefunden." with reset control when filter returns 0
- [x] PASS: When `orders.length === 0` and `isFilterActive` is true, the component renders "Keine Bestellungen gefunden." with a "Zurucksetzen" button (lines 339-357). The CTA to start a new order is NOT shown in this case.

#### AC-10: Search/filter NOT shown on profile page
- [x] PASS: `salesforce-profile.tsx` line 63 renders `<SalesforceOrderHistory slug={slug} />` without `showSearch`, which defaults to `false`. The search controls are gated behind `showSearch ? (...) : null` (line 233).

### Edge Cases Status

#### EC-1: Whitespace-only search
- [x] PASS: Server trims the search param (line 87 of route.ts). Client trims before comparing with `activeSearch` (line 186). Whitespace-only input is treated as empty.

#### EC-2: 0 results with active filter
- [x] PASS: Shows "Keine Bestellungen gefunden." with reset button. Does NOT show the "Noch keine Bestellungen" CTA.

#### EC-3: Network error while searching
- [x] PASS: `catch` block sets `setError("Netzwerkfehler...")`. When `error && orders.length === 0`, the error state renders with "Erneut versuchen" button.

#### EC-4: User changes filter while request in flight (stale response)
- [x] PASS: AbortController cancels previous request (lines 121-125). Stale responses checked via `controller.signal.aborted` (line 145). Abort errors are caught and ignored (line 161).

#### EC-5: "Dieser Monat" on first day of month
- [x] PASS: `new Date(now.getFullYear(), now.getMonth(), 1)` gives start of current month at 00:00:00. `gte("created_at", dateFrom)` includes orders from today.

#### EC-6: Debounce ensures only one request per pause
- [x] PASS: Timer is cleared on each keystroke (line 182-183) and new timer set. Only fires after 400ms pause.

#### EC-7: Search + date filter combined (AND logic)
- [x] PASS: Both filters are applied to the same query object. Date via `query.gte()` and search via `query.or()`. Both are applied as AND conditions in the resulting SQL.

### Security Audit Results

- [x] Authentication: API verifies user session (line 36-46 of route.ts). Page redirects unauthenticated users to login.
- [x] Authorization: Query scoped to `uploaded_by: user.id` and `tenant_id` from app_metadata. Users cannot see other users' orders.
- [x] Role check: Enforced -- only `sales_rep` role allowed (line 65-69).
- [ ] BUG-1: PostgREST filter injection via search parameter (see below).
- [ ] BUG-3: No Zod validation on query parameters `search` and `datePreset` (see below).
- [ ] BUG-4: No input length limit on search parameter (see below).
- [x] Inactive user/tenant blocked: Checked before processing (lines 50-63).
- [x] Admin client used for queries (bypasses RLS): Acceptable here because auth+authorization checks are done manually above and the query is scoped to the user's own tenant+user ID.

### Cross-Browser & Responsive (Code Review)
- [x] Search input uses shadcn/ui `<Input>` with Tailwind classes -- responsive by default.
- [x] Date preset buttons use `flex-wrap` (line 259) -- wraps on smaller screens.
- [x] "Zurucksetzen" button uses `ml-auto` to align right. On small screens with wrapping, this may not look ideal but is functional.
- [x] Overall layout uses `flex flex-col gap-3` -- stacks vertically and adapts to all viewports.

### Bugs Found

#### BUG-1: PostgREST Filter Injection via Search Parameter
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Open the orders page at `/sf/[slug]/orders`
  2. In the search input, type a value containing PostgREST filter syntax delimiters, e.g.: `test,tenant_id.neq.abc`
  3. The search value is interpolated directly into the PostgREST `.or()` filter string without escaping commas, periods, or parentheses
  4. Expected: Search term is treated as a literal string value for ILIKE matching
  5. Actual: The comma in the search term may be parsed as an OR-condition separator by PostgREST, potentially injecting additional filter conditions
- **Impact:** Low practical risk because the query is already scoped to `uploaded_by: user.id` and `tenant_id`, so cross-tenant data leakage is unlikely. However, an attacker could potentially manipulate query behavior or cause unexpected errors.
- **Fix:** Escape PostgREST filter syntax characters (commas, periods, parentheses, backslashes) in the search term before building the `.or()` string. Alternatively, use a PostgreSQL function or RPC call with parameterized inputs instead of string interpolation in the filter.
- **Priority:** Fix before deployment

#### BUG-2: "Letzte 3 Monate" Date Calculation Overflow
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Assume today is May 31, 2026
  2. The code computes: `new Date(2026, 5-1-3, 31)` = `new Date(2026, 1, 31)`
  3. February 31 does not exist; JavaScript rolls forward to March 3, 2026
  4. Expected: The filter should include all orders from approximately February 28 onward
  5. Actual: Orders from February 28, March 1, and March 2 are excluded
- **Impact:** On certain days of the month (29th, 30th, 31st), the "Letzte 3 Monate" preset will exclude a few days of orders near the start of the range.
- **Fix:** After computing the date, cap the day to the last day of the target month. For example: `const start = new Date(now.getFullYear(), now.getMonth() - 3, 1)` (use day 1 of that month) which is simpler and avoids overflow entirely. This also gives a more intuitive boundary.
- **Priority:** Fix before deployment

#### BUG-3: No Zod Validation on GET Query Parameters
- **Severity:** Low
- **Steps to Reproduce:**
  1. Call `GET /api/sf/orders?search=<any-string>&datePreset=<any-string>&page=NaN`
  2. The `search` and `datePreset` params are not validated with Zod
  3. The `page` param is parsed with `parseInt` which returns `NaN` for invalid input; `Math.max(1, NaN)` returns `NaN`, causing the offset calculation to produce `NaN`
  4. Expected: Invalid inputs should be rejected with a 400 response
  5. Actual: `page=NaN` propagates to the database query, `datePreset=garbage` is silently ignored
- **Impact:** The `page=NaN` bug can cause a database error or unexpected behavior. Invalid `datePreset` values are harmless (silently ignored).
- **Fix:** Add Zod validation for all query parameters. Use `z.coerce.number().int().min(1).default(1)` for page, `z.string().max(200).optional()` for search, and `z.enum(["", "thisMonth", "last3Months", "thisYear"]).optional()` for datePreset.
- **Priority:** Fix before deployment (the `page=NaN` part is the critical aspect)

#### BUG-4: No Input Length Limit on Search Parameter
- **Severity:** Low
- **Steps to Reproduce:**
  1. Call `GET /api/sf/orders?search=<10000-character-string>`
  2. The entire string is passed to the database ILIKE filter
  3. Expected: Search should be capped at a reasonable length (e.g., 200 characters)
  4. Actual: Arbitrarily long strings are accepted
- **Impact:** Could slow down database queries or be used for denial-of-service. Low practical risk because the query is limited to the user's own orders.
- **Fix:** Add a `maxLength` check on the search parameter (server-side, e.g., `.max(200)` in Zod schema). Also add `maxLength={200}` to the `<Input>` on the client.
- **Priority:** Fix in next sprint

#### BUG-5: Stale datePreset Closure in Debounced Search Callback
- **Severity:** Low
- **Steps to Reproduce:**
  1. On the orders page, type a search term
  2. Within the 400ms debounce window, also change the date preset
  3. The debounce timer fires with the `datePreset` value captured at the time the timer was set, not the current value
  4. Expected: The debounced search should use the most recent datePreset value
  5. Actual: It may use a stale datePreset value if the preset was changed after the last keystroke
- **Impact:** Minimal -- the date preset change triggers its own immediate fetch which overwrites the stale result. The stale debounced fetch fires 400ms later with the wrong date preset but the abort controller may cancel it. Race condition is unlikely to surface in practice.
- **Fix:** Include `datePreset` in the debounce effect dependency array, or use a ref to always read the current value.
- **Priority:** Nice to have

### Summary
- **Acceptance Criteria:** 10/10 passed (all criteria met in the implementation)
- **Bugs Found:** 5 total (0 critical, 2 medium, 3 low)
- **Security:** 1 filter injection concern (BUG-1), 1 missing input validation (BUG-3), 1 missing length limit (BUG-4)
- **Production Ready:** NO
- **Recommendation:** Fix BUG-1 (PostgREST filter injection), BUG-2 (date overflow), and BUG-3 (NaN page param) before deployment. BUG-4 and BUG-5 can be deferred to the next sprint.

## Deployment
_To be added by /deploy_
