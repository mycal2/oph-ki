# OPH-54: Platform Admin Billing Report

## Status: Planned
**Created:** 2026-03-24
**Last Updated:** 2026-03-24

## Dependencies
- Requires: OPH-52 (Tenant Billing Model) — billing model + pricing data per tenant
- Requires: OPH-53 (Platform Admin KPI Dashboard) — entry point via "Detaillierter Bericht" button

## User Stories
- As a platform admin, I want to select a date range and one or more tenants to generate a billing report so that I can prepare monthly invoices.
- As a platform admin, I want to see a table with order counts and line item counts per tenant in the selected period so that I have the data I need for invoicing.
- As a platform admin, I want to optionally include pricing columns in the report so that I can see the calculated invoice amount directly.
- As a platform admin, I want to export the report as CSV, XLS, and PDF so that I can send or archive it.
- As a platform admin, I want daily granularity when only one tenant is selected so that I can trace activity day by day.

## Report Filter Controls

| Control | Description |
|---|---|
| Date range | Calendar picker — click start date, click end date (like Google Calendar). Shows current month by default. |
| Tenant selector | Multi-select dropdown with "Alle Mandanten auswählen" option. At least one tenant required. |
| Preise anzeigen | Toggle (on/off). Off = no pricing columns. On = adds pricing columns. |
| "Bericht anzeigen" button | Generates the table. |

## Report Table

**Multi-tenant mode** (more than one tenant selected):

| Mandant | Bestellungen | Bestellpositionen | [Preis pro Bestellung] | [Bestellungen × Preis] | [Monatliche Grundgebühr] |
|---|---|---|---|---|---|
| Tenant A | 42 | 187 | €1,00 | €42,00 | €0,00 |
| Tenant B | 18 | 93 | €0,35 | €6,30 | €290,00 |
| **Gesamt** | **60** | **280** | | **€48,30** | **€290,00** |

- Last row "Gesamt" sums Bestellungen, Bestellpositionen, and all price columns
- Pricing columns only shown when "Preise anzeigen" is active
- Monthly fee is shown once per tenant (not multiplied by days)

**Single-tenant mode** (exactly one tenant selected):
- Same columns, but rows = individual days in the date range
- Last row = totals across the period
- Days with zero orders are still shown (with 0s)

## Acceptance Criteria
- [ ] Page exists at `/admin/reports`, accessible to platform_admin and platform_viewer
- [ ] Calendar date range picker allows click-start / click-end selection; selected range is highlighted
- [ ] Default date range is current month (1st to today)
- [ ] Tenant selector supports multi-select and has a "Alle Mandanten" shortcut
- [ ] "Bericht anzeigen" button is disabled until a date range and at least one tenant is selected
- [ ] Table renders with correct rows (tenants or days) and columns
- [ ] Pricing columns appear only when "Preise anzeigen" is toggled on
- [ ] Pricing values come from the tenant's configured billing model (OPH-52)
- [ ] Tenants with no billing model show "—" in price columns (not an error)
- [ ] A "Gesamt" summary row is always shown at the bottom
- [ ] Monthly fee column: for multi-tenant, shown once per tenant; for single-tenant daily view, shown only in the Gesamt row
- [ ] "Export CSV" button downloads the table as a .csv file
- [ ] "Export XLS" button downloads the table as a .xlsx file
- [ ] "Export PDF" button downloads the table as a formatted .pdf file
- [ ] All exports include the report title, date range, and tenant selection as a header
- [ ] Loading state (skeleton or spinner) shown while the report is generating
- [ ] Empty result (no orders in period for selected tenants) shows a clear message

## Edge Cases
- What if the date range spans multiple months and "Preise anzeigen" is on? → Monthly fee is multiplied by the number of months in the range (or pro-rated for partial months — show full month fee for any partial month)
- What if a tenant's billing model changes mid-period? → Use the current billing model (snapshot at report generation time)
- What if the date range is very long (e.g. 1 year) with many tenants? → Backend paginates or limits; frontend shows a warning if >12 months
- What if a tenant has 0 orders but is selected? → Still show the row with 0s and the monthly fee (they still owe it)
- PDF export with many tenants → Landscape orientation, paginated if needed

## Technical Requirements
- New API endpoint: `POST /api/admin/reports/billing` with body `{ from, to, tenantIds, includePrices }`
- Returns structured data: rows with per-tenant (or per-day) order counts, line item counts, and pricing
- Platform admin / platform viewer only
- CSV and XLS generation server-side (or client-side with a library)
- PDF generation: use a client-side library (e.g. jsPDF + autotable) or server-side (puppeteer/html-to-pdf)

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
