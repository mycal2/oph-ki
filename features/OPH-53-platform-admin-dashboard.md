# OPH-53: Platform Admin KPI Dashboard

## Status: In Progress
**Created:** 2026-03-24
**Last Updated:** 2026-03-24 (amended: revenue KPIs added)

## Dependencies
- Requires: OPH-8 (Admin: Mandanten-Management) — tenant data
- Requires: OPH-2 (Bestellungs-Upload) — order data
- Requires: OPH-3 (Händler-Erkennung) — dealer data
- Requires: OPH-52 (Tenant Billing Model Configuration) — pricing data for revenue KPIs

## User Stories
- As a platform admin, I want a dashboard at `/admin/dashboard` showing platform-wide KPIs so that I can monitor the health and activity of the platform at a glance.
- As a platform admin, I want to filter KPIs by time period (current month, last month, current quarter, last quarter) so that I can compare activity across periods.
- As a platform admin, I want to see a histogram of order line distribution so that I understand the complexity of orders being processed.
- As a platform admin, I want to see the current month's revenue (as of yesterday) split into transaction turnover and monthly fee turnover so that I can track in-month progress.
- As a platform admin, I want to see last month's total revenue split into transaction turnover and monthly fee turnover so that I have a clean closed-period figure for accounting.
- As a platform admin, I want a prominent "Detaillierter Bericht" button that takes me to the billing report page.

## KPIs

### Activity KPIs (filtered by selected time period)
| KPI | Description |
|---|---|
| Anzahl Bestellungen | Total count of orders extracted in the selected period |
| Aktive Mandanten | Count of tenants with status = active or trial (always current, not period-filtered) |
| Erkannte Händler | Count of distinct dealers from which orders were received in the period |
| Verteilung Bestellpositionen | Histogram: how many orders had 1 line, 2 lines, 3–5 lines, 6–10 lines, 11+ lines |

### Revenue KPIs (always fixed, not affected by time period selector)
| KPI | Description |
|---|---|
| Umsatz aktueller Monat (Stand gestern) | Total revenue from 1st of current month through yesterday. Split into: Transaction Turnover (Σ orders × cost_per_order per tenant) and Monthly Fee Turnover (Σ monthly_fee per active tenant). Shown as: total + breakdown. |
| Umsatz letzter Monat | Total revenue for the complete previous calendar month. Same split: Transaction Turnover + Monthly Fee Turnover. |

**Revenue calculation:**
- Transaction Turnover = Σ (order_count × tenant.cost_per_order) across all tenants
- Monthly Fee Turnover = Σ tenant.monthly_fee across all tenants with ≥1 order in the period (or all active tenants — see edge cases)
- Total Revenue = Transaction Turnover + Monthly Fee Turnover
- Tenants with no billing model set are excluded from revenue totals (not counted as €0)

## Acceptance Criteria
- [ ] A new page exists at `/admin/dashboard`, accessible only to platform admins
- [ ] The page shows activity KPI cards (Bestellungen, Mandanten, Händler, Verteilung) filtered by the selected time period
- [ ] A time period selector is shown: "Aktueller Monat", "Letzter Monat", "Aktuelles Quartal", "Letztes Quartal"
- [ ] Activity KPIs update when the time period is changed (except "Aktive Mandanten" which is always current)
- [ ] The "Verteilung Bestellpositionen" KPI is shown as a bar chart / histogram with buckets: 1, 2, 3–5, 6–10, 11+
- [ ] Two revenue KPI cards are shown, always fixed regardless of time period selector:
  - "Umsatz Aktueller Monat (Stand gestern)" — displays total revenue + sub-line showing "davon Transaktionen: €X | Grundgebühren: €Y"
  - "Umsatz Letzter Monat" — displays total revenue + same sub-line breakdown
- [ ] Revenue KPI cards show a label making it clear they are not period-filtered (e.g. a small "nicht periodengefiltert" badge or fixed label)
- [ ] A clearly visible "Detaillierter Bericht →" button navigates to `/admin/reports`
- [ ] The page is only visible to platform_admin and platform_viewer roles
- [ ] KPIs load with a skeleton state while fetching
- [ ] The admin navigation includes a link to the dashboard

## Edge Cases
- What if there are no orders in the selected period? → Show "0" with a friendly empty state message
- What if a tenant was active part of the month and then deactivated? → "Aktive Mandanten" reflects current status, not historical
- Very large numbers (e.g. 10,000+ orders) → Format with thousands separator (e.g. 10.432)
- Slow API response → Show skeletons for up to 5 seconds, then an error state with retry
- What if today is the 1st of the month? → "Umsatz Aktueller Monat (Stand gestern)" shows yesterday = last day of previous month; display a note: "Stand: [datum]"
- What if a tenant has no billing model set? → Exclude from revenue totals; do not treat as €0 (would skew the numbers)
- Should monthly fee be charged even if the tenant had 0 orders that month? → Yes, monthly fee is always charged if the tenant is active (it's a fixed fee per contract)

## Technical Requirements
- API endpoint: `GET /api/admin/stats?period=current_month|last_month|current_quarter|last_quarter`
- Returns activity KPIs (period-filtered) + revenue KPIs (always current month YTD and last month, fixed) in a single response
- Revenue KPI calculation: join orders with tenant billing config; compute per-tenant subtotals; aggregate
- Platform admin / platform viewer only
- Response time target: < 1 second

---

## Tech Design (Solution Architect)

### Layers affected

| Layer | What changes |
|---|---|
| Database | New Supabase RPC function for line distribution bucketing (JSONB array length grouping) |
| API | New `GET /api/admin/stats?period=...` — platform admin/viewer only |
| UI | New page `/admin/dashboard` + 4 new components |
| Navigation | One new entry added to `top-navigation.tsx` admin links |

### Component structure

```
/admin/dashboard (NEW page)
+-- Page Header ("Plattform-Dashboard")
+-- PeriodSelector (NEW)
|     [Aktueller Monat] [Letzter Monat] [Aktuelles Quartal] [Letztes Quartal]
+-- Activity KPI Row (4 cards, period-filtered)
|   +-- AdminKpiCard: Anzahl Bestellungen
|   +-- AdminKpiCard: Aktive Mandanten  (always current)
|   +-- AdminKpiCard: Erkannte Händler
|   +-- OrderLineHistogram              (CSS bar chart, 5 buckets)
+-- Revenue KPI Row (2 cards, fixed — not period-filtered)
|   +-- AdminRevenueCard: Umsatz Aktueller Monat
|   |     Total + "Transaktionen: €X | Grundgebühren: €Y" sub-line
|   |     "Stand: TT.MM.YYYY" label
|   +-- AdminRevenueCard: Umsatz Letzter Monat
|         Total + same sub-line
+-- "Detaillierter Bericht →" Button  (→ /admin/reports)
```

### New components

| Component | Purpose |
|---|---|
| `AdminKpiCard` | Reusable card: large number, label, icon, skeleton state |
| `AdminRevenueCard` | KpiCard variant with total + transaction/fee sub-line + "nicht periodengefiltert" badge |
| `OrderLineHistogram` | CSS-only bar chart (Tailwind flex) — 5 fixed buckets. Heights proportional to counts. Hover tooltip shows exact count. |
| `PeriodSelector` | 4-button segmented control; changing selection refetches activity KPIs |

### API response shape

`GET /api/admin/stats?period=current_month|last_month|current_quarter|last_quarter`

```
Activity section (recalculated per period):
  orderCount          — total orders in period
  activeTenantCount   — always current (period ignored)
  dealerCount         — distinct dealers with ≥1 order in period
  lineDistribution    — { "1": n, "2": n, "3-5": n, "6-10": n, "11+": n }

Revenue section (always fixed, period parameter ignored):
  revenueCurrentMonth:
    total               — €
    transactionTurnover — Σ (orders × cost_per_order per tenant)
    monthlyFeeTurnover  — Σ monthly_fee (active/trial tenants with billing set)
    asOf                — ISO date string of "yesterday"
  revenueLastMonth:
    total, transactionTurnover, monthlyFeeTurnover  (same structure)
```

Revenue formula:
1. Query active/trial tenants with `billing_model IS NOT NULL`
2. Count orders per tenant in period → × `cost_per_order` → sum = transaction turnover
3. Sum `monthly_fee` across those tenants = monthly fee turnover
4. Tenants with no billing model are excluded entirely

### Histogram note

Line items are stored in `extracted_data->'line_items'` (JSONB array) on `orders`. Bucketing by array length requires a Postgres-side computation. Solution: a Supabase RPC function runs the grouping in the DB — avoids shipping all order rows to the app server.

### Navigation change

Add to the admin links array in `top-navigation.tsx`:
```
{ href: "/admin/dashboard", label: "Dashboard", adminOnly: true }
```
Placed first in the admin-only section — natural landing page for platform admins.

### Key decisions

| Decision | Why |
|---|---|
| CSS-only histogram | 5 fixed static buckets = 5 Tailwind divs. No need for ~40KB recharts for this. |
| Single API call for all KPIs | Avoids double fetch / double skeleton flicker on period change. |
| RPC for line distribution | JSONB array length cannot be aggregated with simple Supabase filter queries. |
| Revenue KPIs not period-filterable | These are billing snapshots (current month YTD, full last month); changing their period would require a billing model redesign — out of scope. |
| "Stand: [datum]" always shown on current-month card | On the 1st, "yesterday" = last month. The label prevents confusion. |

### New packages required

None — `Card`, `Button`, `Skeleton`, `Badge`, `Tabs` are already installed.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
