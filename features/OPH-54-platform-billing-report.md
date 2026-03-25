# OPH-54: Platform Admin Billing Report

## Status: In Progress (Frontend Complete)
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

### Layers affected

| Layer | What changes |
|---|---|
| API | New `POST /api/admin/reports/billing` endpoint |
| UI | New page `/admin/reports` + 3 new components + 3 export utilities |
| Packages | `jspdf`, `jspdf-autotable`, shadcn `calendar` (+ `react-day-picker`) |

### Component structure

```
/admin/reports (NEW page)
+-- Page Header ("Abrechnungsbericht")
+-- Filter Panel (Card)
|   +-- DateRangePicker (NEW)
|   |     Popover → dual-month Calendar (shadcn)
|   |     Click 1 = start, click 2 = end; range highlighted
|   |     Default: 1st of current month → today
|   +-- TenantMultiSelect (NEW)
|   |     Popover → Command list with checkboxes per tenant
|   |     "Alle Mandanten auswählen" shortcut
|   |     Trigger shows count: "3 Mandanten ausgewählt"
|   +-- "Preise anzeigen" Switch
|   +-- "Bericht anzeigen" Button (disabled until date + ≥1 tenant)
+-- [Skeleton — while loading]
+-- [Empty state — "Keine Bestellungen im Zeitraum"]
+-- BillingReportTable (NEW)
|   +-- Dynamic column headers (always: Mandant/Datum | Bestellungen | Bestellpositionen;
|   |     + Preis/Bestellung | Bestellungen×Preis | Grundgebühr if prices on)
|   +-- Data rows (tenants in multi-mode; days in single-mode)
|   +-- "Gesamt" summary row (always last, bold)
+-- Export Row (shown when table has data)
    +-- "Export CSV" | "Export XLS" | "Export PDF"
```

### API response shape

`POST /api/admin/reports/billing` — body: `{ from, to, tenantIds, includePrices }`

```
{
  mode: "multi-tenant" | "single-tenant",
  from, to,
  monthCount,          ← distinct (partial) months in range; used for monthly fee ×
  rows: [
    // Multi-tenant: { tenantId, tenantName, orderCount, lineItemCount,
    //                 costPerOrder?, transactionTotal?, monthlyFee? }
    // Single-tenant: { date, orderCount, lineItemCount, transactionTotal? }
  ],
  totals: { orderCount, lineItemCount, transactionTotal?, monthlyFeeTotal? }
}
```

Server pre-calculates all totals — the frontend does zero arithmetic.

### Export approach (all client-side)

| Format | Library | Notes |
|---|---|---|
| CSV | None | Plain string building + Blob download |
| XLS | `xlsx` (already installed) | Build worksheet from table data |
| PDF | `jspdf` + `jspdf-autotable` (new) | Formatted table, landscape for wide columns |

All exports prepend a header: report title, date range, tenant selection, generation timestamp.

### Multi-month fee calculation

Monthly fee is multiplied by `monthCount` (partial months count as full):
- March 15 → April 10 = 2 months → monthly_fee × 2
- `monthCount` is computed server-side and returned in the response so the UI can annotate (e.g. "€290 × 2 Monate")

### Key decisions

| Decision | Why |
|---|---|
| Client-side exports | Data already in browser; no round-trip. `jspdf` is ~300KB — acceptable. |
| `jspdf` + `jspdf-autotable` for PDF | Lightest table-to-PDF option; no headless Chrome; handles landscape + pagination. |
| CSV without a library | CSV is comma-separated text — a library would be over-engineering. |
| shadcn Calendar + Popover | Consistent with existing UI; `date-fns` already installed for range logic. |
| Command + Popover for multi-select | Standard shadcn pattern; no third-party library needed. |
| Server pre-calculates totals | Billing math belongs on the server — keeps the frontend dumb and correct. |

### New packages to install

| Package | Purpose |
|---|---|
| `jspdf` | Client-side PDF generation |
| `jspdf-autotable` | Table plugin for jsPDF |
| shadcn `calendar` | Date picker (via `npx shadcn@latest add calendar`, brings `react-day-picker`) |

## QA Test Results

**Tested:** 2026-03-24
**App URL:** http://localhost:3003
**Tester:** QA Engineer (AI) -- Code Review + Build Verification

### Acceptance Criteria Status

#### AC-1: Page exists at `/admin/reports`, accessible to platform_admin and platform_viewer
- [x] Page file exists at `src/app/(protected)/admin/reports/page.tsx`
- [x] Navigation link "Abrechnung" present in top-navigation.tsx with `adminOnly: true`
- [x] Frontend uses `useCurrentUserRole` hook and checks `isPlatformAdminOrViewer`
- [x] API uses `requirePlatformAdminOrViewer()` to gate access
- **PASS**

#### AC-2: Calendar date range picker allows click-start / click-end selection; selected range is highlighted
- [x] `DateRangePicker` uses shadcn `Calendar` in `mode="range"` with `numberOfMonths={2}`
- [x] Popover closes when both dates are selected
- [x] Range is displayed in DD.MM.YYYY format with German locale
- [x] Dates after today are disabled (`disabled={{ after: new Date() }}`)
- **PASS**

#### AC-3: Default date range is current month (1st to today)
- [x] State initialized with `{ from: startOfMonth(new Date()), to: new Date() }`
- **PASS**

#### AC-4: Tenant selector supports multi-select and has a "Alle Mandanten" shortcut
- [x] `TenantMultiSelect` uses Command + Popover pattern with checkboxes
- [x] "Alle Mandanten auswaehlen" option toggles all on/off
- [x] Search/filter input present
- [x] Trigger shows count label (e.g. "3 Mandanten ausgewaehlt")
- **PASS**

#### AC-5: "Bericht anzeigen" button is disabled until a date range and at least one tenant is selected
- [x] `canGenerate` requires `dateRange?.from && dateRange?.to && selectedTenantIds.length > 0 && !isLoading`
- [x] Button has `disabled={!canGenerate}`
- **PASS**

#### AC-6: Table renders with correct rows (tenants or days) and columns
- [x] Multi-tenant mode renders tenant name rows with orderCount and lineItemCount
- [x] Single-tenant mode renders date rows (formatted DD.MM.YYYY) with orderCount and lineItemCount
- [x] SQL uses `generate_series` for days and LEFT JOIN for tenants, so all selected entries appear
- **PASS**

#### AC-7: Pricing columns appear only when "Preise anzeigen" is toggled on
- [x] Table conditionally renders pricing columns based on `includePrices` prop
- [x] Multi-tenant shows 3 extra columns; single-tenant shows 1 extra column
- **PASS**

#### AC-8: Pricing values come from the tenant's configured billing model (OPH-52)
- [x] SQL reads `t.billing_model`, `t.cost_per_order`, `t.monthly_fee` from `tenants` table
- [x] Transaction total computed as `order_count * cost_per_order`
- **PASS**

#### AC-9: Tenants with no billing model show "---" in price columns (not an error)
- [x] SQL uses `CASE WHEN p_include_prices AND t.billing_model IS NOT NULL ... ELSE NULL END`
- [x] Frontend `formatCurrency(null)` returns em-dash character
- **PASS**

#### AC-10: A "Gesamt" summary row is always shown at the bottom
- [x] `TableFooter` always renders a bold "Gesamt" row with summed orderCount and lineItemCount
- [x] SQL computes totals server-side
- **PASS**

#### AC-11: Monthly fee column -- for multi-tenant, shown once per tenant; for single-tenant daily view, shown only in the Gesamt row
- [x] Multi-tenant: monthly fee shown per tenant row (multiplied by monthCount in SQL)
- [ ] BUG: Single-tenant: monthly fee is NOT displayed in the Gesamt row (see BUG-1)
- **FAIL**

#### AC-12: "Export CSV" button downloads the table as a .csv file
- [x] `exportCsv` builds CSV with BOM, headers, data rows, and totals
- [x] Proper CSV escaping for commas, quotes, newlines
- [x] File named `abrechnungsbericht-{from}-{to}.csv`
- **PASS**

#### AC-13: "Export XLS" button downloads the table as a .xlsx file
- [x] Uses `xlsx` library (dynamic import)
- [x] Includes meta header rows and data
- **PASS**

#### AC-14: "Export PDF" button downloads the table as a formatted .pdf file
- [x] Uses `jspdf` + `jspdf-autotable` (dynamic imports)
- [x] Landscape orientation for wide tables (multi-tenant with prices)
- [x] Title, date range, and tenant info in PDF header
- [x] Totals row bolded via `didParseCell`
- **PASS**

#### AC-15: All exports include the report title, date range, and tenant selection as a header
- [x] `buildMeta` creates title, dateRange, tenants, generated timestamp
- [x] All three export functions prepend this meta info
- **PASS**

#### AC-16: Loading state (skeleton or spinner) shown while the report is generating
- [x] Skeleton rows displayed when `isLoading` is true
- [x] Spinner icon on the "Bericht anzeigen" button during loading
- **PASS**

#### AC-17: Empty result (no orders in period for selected tenants) shows a clear message
- [x] Empty state card with icon and message "Keine Bestellungen im gewaehlten Zeitraum..."
- [x] Note: For multi-tenant mode, rows always exist (with 0 counts) per the SQL LEFT JOIN, so this message would only appear if an unexpected edge case produces zero rows. For single-tenant daily mode, `generate_series` always produces rows. The empty state is a safety net.
- **PASS** (defensive, unlikely to trigger in normal use)

### Edge Cases Status

#### EC-1: Date range spanning multiple months with "Preise anzeigen" on
- [x] `monthCount` computed server-side via `generate_series` + `EXTRACT(YEAR/MONTH)`
- [x] Monthly fee multiplied by `monthCount` in SQL
- [x] UI shows "(x N Mon.)" annotation when monthCount > 1
- **PASS**

#### EC-2: Tenant's billing model changes mid-period
- [x] SQL reads current billing model at query time (no snapshot history)
- [x] Matches spec: "Use the current billing model (snapshot at report generation time)"
- **PASS**

#### EC-3: Very long date range (>12 months)
- [x] API computes `monthsBetween` and returns a `warning` string
- [x] Frontend displays warning in an Alert component
- **PASS**

#### EC-4: Tenant with 0 orders but selected
- [x] SQL LEFT JOIN ensures tenant row appears with 0 counts
- [x] Monthly fee still shown (as per spec)
- **PASS**

#### EC-5: PDF export with many tenants
- [x] Landscape orientation when `includePrices && report.mode === 'multi-tenant'`
- [x] `jspdf-autotable` handles pagination automatically
- **PASS**

### Security Audit Results

#### Authentication
- [x] API endpoint uses `requirePlatformAdminOrViewer()` which verifies session exists
- [x] Unauthenticated requests receive 401
- **PASS**

#### Authorization
- [x] API checks role is `platform_admin` or `platform_viewer` (from `app_metadata`)
- [x] Frontend shows "Zugriff verweigert" for non-admin users
- [x] Inactive users receive 403
- [ ] BUG: RPC function `get_billing_report` is `SECURITY DEFINER` and granted to `authenticated` role -- any authenticated user can call it directly via Supabase client, bypassing the API layer's admin check (see BUG-2)

#### Input Validation
- [x] Zod schema validates date format (YYYY-MM-DD regex), UUID format for tenantIds, min 1 / max 200 tenants, boolean includePrices
- [x] Refine check ensures from <= to
- [x] SQL also validates inputs (RAISE EXCEPTION)
- **PASS**

#### Rate Limiting
- [x] `checkAdminRateLimit` applied: 60 requests per user per minute
- **PASS**

#### Data Exposure
- [x] API returns only aggregate counts and pricing -- no PII or order details
- [x] No file paths, user IDs, or sensitive data in the response
- **PASS**

#### Injection
- [x] SQL uses parameterized queries via Supabase RPC (no string interpolation)
- [x] Zod validates all inputs before they reach the database
- **PASS**

### Bugs Found

#### BUG-1: Single-tenant daily view does not show monthly fee in Gesamt row
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Go to `/admin/reports`
  2. Select exactly one tenant (that has a billing model with monthly_fee configured)
  3. Toggle "Preise anzeigen" on
  4. Click "Bericht anzeigen"
  5. Expected: Gesamt row should show the monthly fee (from the API's `totals.monthlyFeeTotal`) and cost per order (from `totals.costPerOrder`)
  6. Actual: Gesamt row only shows `transactionTotal`. The `monthlyFeeTotal` is returned by the API but not rendered in the table footer. Same issue in all three exports.
- **Affected files:**
  - `src/components/admin/billing-report-table.tsx` (lines 127-131 -- only renders transactionTotal, no monthlyFeeTotal column)
  - `src/lib/billing-report-exports.ts` (lines 59-65 -- single-tenant headers miss monthly fee; lines 106-108 -- totals miss monthly fee)
- **Priority:** Fix before deployment

#### BUG-2: RPC function callable by any authenticated user (authorization bypass)
- **Severity:** High
- **Steps to Reproduce:**
  1. Log in as a regular `tenant_user` or `tenant_admin`
  2. Use the Supabase client directly (e.g. from browser console) to call:
     `supabase.rpc('get_billing_report', { p_from: '2026-01-01', p_to: '2026-03-24', p_tenant_ids: ['<any-tenant-id>'], p_include_prices: true })`
  3. Expected: Request should be denied for non-platform-admin users
  4. Actual: The function is `SECURITY DEFINER` and granted to `authenticated`, so any logged-in user can execute it and retrieve billing data (order counts, pricing) for ANY tenant, including tenants they do not belong to.
- **Affected file:** `supabase/migrations/036_oph54_billing_report.sql` (lines 183-184)
- **Remediation:** Either (a) add a role check inside the PL/pgSQL function body (query `user_profiles` for the calling user's role), or (b) revoke the `authenticated` grant and only grant to `service_role`, relying exclusively on the API layer for access. Option (b) is simpler and consistent with the existing pattern where the API uses `adminClient` (service_role) to call the RPC.
- **Priority:** Fix before deployment

#### BUG-3: No "Detaillierter Bericht" link from KPI Dashboard (OPH-53 entry point)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Go to `/admin/dashboard` (OPH-53 KPI Dashboard)
  2. Expected: A "Detaillierter Bericht" button or link that navigates to `/admin/reports` (as stated in the spec's dependency section)
  3. Actual: No such link exists on the dashboard page
- **Note:** The page is still accessible via the top navigation "Abrechnung" link, so this is a minor UX gap rather than a functional issue.
- **Priority:** Nice to have

### Summary
- **Acceptance Criteria:** 16/17 passed (AC-11 failed)
- **Bugs Found:** 3 total (0 critical, 1 high, 1 medium, 1 low)
  - BUG-1 (Medium): Monthly fee missing from single-tenant Gesamt row and exports
  - BUG-2 (High): RPC function accessible to any authenticated user, bypassing admin authorization
  - BUG-3 (Low): Missing entry point link from KPI dashboard
- **Security:** 1 authorization bypass issue found (BUG-2)
- **Build:** Compiles successfully with `npm run build`
- **Production Ready:** NO -- BUG-2 (High) must be fixed before deployment. BUG-1 (Medium) should also be fixed as it causes incorrect billing display.

## Deployment
_To be added by /deploy_
