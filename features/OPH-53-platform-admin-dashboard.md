# OPH-53: Platform Admin KPI Dashboard

## Status: Planned
**Created:** 2026-03-24
**Last Updated:** 2026-03-24

## Dependencies
- Requires: OPH-8 (Admin: Mandanten-Management) — tenant data
- Requires: OPH-2 (Bestellungs-Upload) — order data
- Requires: OPH-3 (Händler-Erkennung) — dealer data

## User Stories
- As a platform admin, I want a dashboard at `/admin/dashboard` showing platform-wide KPIs so that I can monitor the health and activity of the platform at a glance.
- As a platform admin, I want to filter KPIs by time period (current month, last month, current quarter, last quarter) so that I can compare activity across periods.
- As a platform admin, I want to see a histogram of order line distribution so that I understand the complexity of orders being processed.
- As a platform admin, I want a prominent "Detaillierter Bericht" button that takes me to the billing report page.

## KPIs

| KPI | Description |
|---|---|
| Anzahl Bestellungen | Total count of orders extracted in the selected period |
| Aktive Mandanten | Count of tenants with status = active or trial |
| Erkannte Händler | Count of distinct dealers from which orders were received in the period |
| Verteilung Bestellpositionen | Histogram: how many orders had 1 line, 2 lines, 3–5 lines, 6–10 lines, 11+ lines |

## Acceptance Criteria
- [ ] A new page exists at `/admin/dashboard`, accessible only to platform admins
- [ ] The page shows 4 prominent KPI cards (large numbers, clear labels, colored icons)
- [ ] A time period selector is shown: "Aktueller Monat", "Letzter Monat", "Aktuelles Quartal", "Letztes Quartal"
- [ ] All KPIs update when the time period is changed (except "Aktive Mandanten" which is always current)
- [ ] The "Verteilung Bestellpositionen" KPI is shown as a bar chart / histogram with buckets: 1, 2, 3–5, 6–10, 11+
- [ ] A clearly visible "Detaillierter Bericht →" button navigates to `/admin/reports`
- [ ] The page is only visible to platform_admin and platform_viewer roles
- [ ] KPIs load with a skeleton state while fetching
- [ ] The admin navigation includes a link to the dashboard

## Edge Cases
- What if there are no orders in the selected period? → Show "0" with a friendly empty state message
- What if a tenant was active part of the month and then deactivated? → "Aktive Mandanten" reflects current status, not historical
- Very large numbers (e.g. 10,000+ orders) → Format with thousands separator (e.g. 10.432)
- Slow API response → Show skeletons for up to 5 seconds, then an error state with retry

## Technical Requirements
- New API endpoint: `GET /api/admin/stats?period=current_month|last_month|current_quarter|last_quarter`
- Returns all 4 KPI values in a single request for efficiency
- Platform admin / platform viewer only
- Response time target: < 1 second

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
