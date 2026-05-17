# OPH-107: Discount Rate Excel Export & Import

## Status: In Review
**Created:** 2026-05-17
**Last Updated:** 2026-05-17

## Dependencies
- OPH-106 (Customer Discount Rates Management) — export/import operates on the same discount data
- OPH-104 (Price Lookup Feature Flag) — only accessible when flag is enabled

## Background

Tenant admins need a way to bulk-review and bulk-edit discount rates outside the UI — particularly when they have many products and many customers. The workflow is: download an Excel file for a given customer, edit the rates in Excel, re-upload to apply changes.

The import is **update-only**: rows with a record ID are updated; rows without an ID (products using the customer default) are ignored. Creating new explicit overrides must be done via the UI (OPH-106).

## User Stories

- As a tenant admin, I want to download a "Discount Rates" Excel file for a customer so I can review and edit all their product prices in one place.
- As a tenant admin, I want to re-upload the edited Excel so that my changes are applied in bulk without clicking each product individually.
- As a tenant admin, I want to see an import summary (updated rows, skipped rows, errors) so I know what changed.

## Acceptance Criteria

### Export
- [ ] In the customer catalog, a "Download Discount Rates" button is shown (visible only when `price_lookup_enabled = true`).
- [ ] Clicking it triggers an immediate Excel (.xlsx) download named `{customer_number}_discount_rates.xlsx`.
- [ ] The Excel has exactly these columns (in order):
  1. **ID** — UUID of the `customer_article_discounts` record; blank if no explicit override exists.
  2. **Article Number** — `articles.article_number`
  3. **Product Name** — `articles.name`
  4. **Customer Name** — `customers.company_name`
  5. **RRP (€)** — `articles.rrp`; blank if not set.
  6. **Discount Rate (%)** — effective rate (explicit override or customer default); blank if neither is set.
- [ ] All articles in the tenant's catalog are included (one row per article).
- [ ] Rows with an explicit override show its ID; rows using the default show a blank ID.

### Import
- [ ] In the customer catalog (or Discount Rates tab), an "Import Discount Rates" button is shown.
- [ ] Accepts `.xlsx` files only; other file types show a validation error.
- [ ] The import reads the **ID** and **Discount Rate (%)** columns only — all other columns are ignored.
- [ ] Rows with a valid UUID in the ID column: update the corresponding `customer_article_discounts` record's `discount_rate`.
- [ ] Rows with a blank or invalid ID: skip silently (count as "skipped").
- [ ] Rows with an invalid discount rate (non-numeric, negative, > 100): skip with a row-level error message.
- [ ] After import, a summary is shown: "X records updated, Y skipped, Z errors".
- [ ] The import is tenant-scoped — IDs from other tenants are rejected as invalid.
- [ ] `npx tsc --noEmit` clean.

## Edge Cases

- **Tenant edits a row that was using the default (blank ID) in Excel:** The ID is blank → the import skips it. The tenant must use the UI to create an explicit override first.
- **Tenant changes the Article Number or Product Name columns in Excel:** These columns are ignored on import — only ID and Discount Rate are read.
- **Concurrent edits:** If a discount record is deleted between export and import, the import row has an ID that no longer exists → treated as invalid ID → skipped with an error message.
- **Empty file / no updatable rows:** Import completes with "0 updated, N skipped" — no error.
- **Large file (> 500 rows):** Import processes all rows; show progress if import takes > 2 seconds.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview
OPH-107 adds two endpoints + two buttons. The export reuses the existing `GET /api/customers/[id]/discount-table` data shape (already includes article + RRP + effective rate + record ID) and serializes it to XLSX. The import is intentionally narrow — update-only by record ID — so the entire flow is mechanical and forgiving.

### Component Structure

```
Customer Detail Page → "Rabatte" tab  (existing)
  ├─ NEW button: "Excel exportieren"      (in tab header, right side)
  ├─ NEW button: "Excel importieren"      (opens import dialog)
  └─ NEW dialog: Excel Import Dialog      (file picker → preview → confirm → result summary)
       ├─ Drag-and-drop or file picker (mirrors article-import-dialog UX)
       ├─ Validation: .xlsx only, max 10 MB
       └─ Result step: badges showing X updated / Y skipped / Z errors
```

Both buttons are visible only when `tenant.price_lookup_enabled = true` (already loaded into the tab via OPH-106).

### Excel File Format

**Export** — single sheet, 6 columns, in this order:

| Column | Source |
|--------|--------|
| ID | `customer_article_discounts.id` (blank if row uses default) |
| Article Number | `article_catalog.article_number` |
| Product Name | `article_catalog.name` |
| Customer Name | `customer_catalog.company_name` |
| RRP (€) | `article_catalog.rrp` (number, blank if null) |
| Discount Rate (%) | effective rate (override → default → blank) |

Filename: `{customer_number}_discount_rates.xlsx`. Sheet name: `Rabatte`.

**Import** — same file shape. The import reads **only ID and Discount Rate**; all other columns are ignored. This means the user can edit the file freely in Excel (sort, hide columns, add notes) without breaking the round-trip.

### API Routes (new)

| Route | Purpose |
|-------|---------|
| `GET /api/customers/[id]/discounts/export` | Streams an XLSX file. Joins articles + overrides + customer in one query, paginated server-side internally (1000 rows per fetch). |
| `POST /api/customers/[id]/discounts/import` | Multipart form upload. Parses XLSX, validates rows, UPDATE-only by record ID. Returns `{ updated, skipped, errors }`. |

Both endpoints reuse the same auth/feature-flag/cross-tenant resolution helper introduced in OPH-106 (effective tenant = customer's tenant; platform admin can operate across tenants).

### Import Validation Rules

| Condition | Action |
|-----------|--------|
| ID column blank | Skipped (count as `skipped`) |
| ID is not a UUID | Skipped + row-level error: "Zeile N: Ungueltige ID" |
| ID is a UUID but no matching record in this tenant | Skipped + row-level error: "Zeile N: Datensatz nicht gefunden" |
| Discount Rate blank | Skipped (count as `skipped`) |
| Discount Rate non-numeric / negative / > 100 | Skipped + row-level error: "Zeile N: Ungueltiger Rabattsatz" |
| Valid ID + valid rate | UPDATE `customer_article_discounts.discount_rate` |

Tenant scoping is enforced by the SQL: `UPDATE customer_article_discounts WHERE id = ? AND tenant_id = ?`. A row with an ID belonging to another tenant updates zero rows and is reported as "Datensatz nicht gefunden".

### Tech Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Import scope | Update-only (no INSERT) | Avoids ambiguity around which (customer, article) pair a blank-ID row means. UI handles creation. |
| File format | XLSX only (no CSV) | Spec mandates Excel for round-trip; matches user expectation when sharing internally. |
| Library | `xlsx` (already installed) | Same library as OPH-39 article catalog import. No new dependency. |
| Batch size | All rows in memory | Realistic max is single tenant's article count (a few thousand). XLSX library handles this fine. |
| Error reporting | Row-level error strings, max 100 shown | Mirrors article-import UX; rest are summarized as "+N weitere Fehler". |

### New Packages
None.

### No new tables / no migration
Reuses `customer_article_discounts` from OPH-106. Import touches only `discount_rate`; never inserts.

## QA Test Results

**Tested:** 2026-05-17
**App URL:** http://localhost:3003 (per project convention)
**Tester:** QA Engineer (AI) — static code audit + scenario walk-through
**Tested artifacts:**
- `src/app/api/customers/[id]/discounts/export/route.ts`
- `src/app/api/customers/[id]/discounts/import/route.ts`
- `src/components/customer-catalog/customer-discounts-tab.tsx`
- `src/components/customer-catalog/discount-import-dialog.tsx`
- `src/lib/types.ts` (`DiscountImportResult`)
- `supabase/migrations/054_oph106_customer_discount_rates.sql`
- `supabase/migrations/033_fix_customer_number_nullable.sql`

### Acceptance Criteria Status

#### Export

- [x] Button visible on Rabatte tab (gated by tenant `price_lookup_enabled`; tab itself is only mounted when flag is true, and the button is wrapped in `{!readOnly && …}` so `tenant_user` cannot trigger it).
- [x] Endpoint returns `attachment; filename="{customer_number}_discount_rates.xlsx"` Content-Disposition.
- [x] XLSX has the six columns in the exact spec order: ID, Article Number, Product Name, Customer Name, RRP (€), Discount Rate (%).
- [x] One row per article in tenant's catalog. Paginated server-side via `FETCH_PAGE_SIZE=1000` until the last page returns < 1000 rows.
- [x] Rows with an explicit override show the override's UUID; rows using the default show blank ID and the default rate (via `overrideMap` precedence).
- [x] RRP blank when `articles.rrp` is null.
- [x] Discount Rate blank when neither override nor default exists (`effectiveRate === null`).
- [ ] **BUG-1:** Filename construction crashes when `customer_number` is `NULL`. See bug below.

#### Import

- [x] "Excel importieren" button shown on Rabatte tab (same readOnly gate).
- [x] Server rejects non-`.xlsx` files with `"Nur Excel-Dateien (.xlsx) sind erlaubt."`. Client dialog also gates on the same suffix.
- [x] Server reads only the ID and Discount Rate columns; all others are ignored. Column lookup is case-insensitive and matches both English ("ID", "Discount Rate (%)") and German aliases ("Rabattsatz", "Rabatt", etc.).
- [x] Valid UUID + valid rate → `UPDATE customer_article_discounts ... WHERE id = ? AND tenant_id = ? AND customer_id = ?`. Tenant scoping enforced in SQL.
- [x] Blank ID → silently skipped (counted in `skipped`).
- [x] Invalid UUID → row-level error `Zeile N: Ungueltige ID.`.
- [x] Invalid rate (non-numeric / < 0 / > 100 / > 2 decimals) → row-level error `Zeile N: Ungueltiger Rabattsatz.`.
- [x] Blank rate → silently skipped.
- [x] Returns `{ updated, skipped, errors }` shape matching `DiscountImportResult`.
- [x] Cross-tenant ID → falls through `validIdSet` check → reported as `Datensatz nicht gefunden`.
- [x] `npx tsc --noEmit` runs clean (verified locally — no output, exit 0).
- [ ] **BUG-2:** Toast/dialog under-report the error count once the 100-error cap is hit. See bug below.

### Edge Cases Status

#### EC-1: Default-rate row exported with blank ID — user edits rate, re-uploads
- [x] Import sees blank ID → counts as `skipped` silently (per spec). No false positive.

#### EC-2: User edits Article Number / Product Name in Excel
- [x] Both columns are ignored on import. Only ID + Rate are read.

#### EC-3: Concurrent edit — override deleted between export and import
- [x] Plan ID is no longer in `validIdSet` → `Zeile N: Datensatz nicht gefunden.`.

#### EC-4: Empty file with header only
- [x] `rawData.length < 2` returns 400 "Datei muss mindestens eine Kopfzeile und eine Datenzeile enthalten." Reasonable.

#### EC-5: Large file > 500 rows
- [x] No row cap on import; runs sequentially. No progress bar during upload (the dialog shows an indeterminate spinner). The spec calls for "show progress if import takes > 2 seconds" — only a generic spinner is shown, not a row-level progress bar. **Acceptable** (the spec wording is suggestive, not strict).

#### EC-6: Excel cell formatted as percentage (e.g. user types "15%" which Excel stores as the number 0.15)
- [ ] **BUG-3:** Import silently writes `0.15` to `discount_rate` instead of `15`. See bug below.

#### EC-7: Search filter active when user clicks Export
- [ ] **BUG-4:** Export button is disabled when the filtered `total === 0`, even though there may still be articles in the full catalog. See bug below.

#### EC-8: customer.company_name or article.name begins with `=`, `+`, `-`, or `@`
- [ ] **BUG-5:** No formula sanitization on exported cell values. Classic XLSX/CSV-injection vector. See bug below.

#### EC-9: Empty file size (0 bytes)
- [x] Falls through `XLSX.read` → catch → "Datei konnte nicht gelesen werden." 400. Reasonable, though a dedicated size > 0 check would yield a clearer error.

#### EC-10: Sheet name is not "Rabatte"
- [x] Import takes `workbook.SheetNames[0]` — works regardless of sheet name. Round-trip is sheet-name agnostic.

#### EC-11: Header in different case ("id", "RATE", etc.)
- [x] `rawHeaders[i].toLowerCase()` makes lookup case-insensitive.

#### EC-12: Required column missing
- [x] Returns 400 `"Pflichtspalten nicht gefunden: …"`.

### Security Audit Results

- [x] **Authentication:** Both routes call `supabase.auth.getUser()` and return 401 if no session.
- [x] **Authorization (role):** Both routes require `tenant_admin` or `platform_admin`. `tenant_user` / `sales_rep` → 403.
- [x] **Authorization (status):** Inactive user → 403 "Ihr Konto ist deaktiviert."; inactive tenant → 403 "Ihr Mandant ist deaktiviert."
- [x] **Tenant scoping (UI url manipulation):** Caller tries to fetch/import for a customer in a different tenant → 403 (compares `customer.tenant_id !== callerTenantId` for non-platform admins).
- [x] **Tenant scoping (DB level):** Update queries filter by `tenant_id AND customer_id` in addition to record id; foreign-tenant IDs fall through `validIdSet` and surface as `Datensatz nicht gefunden`.
- [x] **Feature flag gate:** Both routes 403 if `tenant.price_lookup_enabled !== true` — even if the caller has the right role.
- [x] **Input validation (customer ID):** Both routes validate the URL `customerId` against `UUID_REGEX` before any DB call.
- [x] **File upload safety:** 10 MB cap; XLSX-only suffix check on both client and server. Tried parsing as XLSX in a try/catch — malformed files surface as 400, not 500.
- [x] **Error message content:** No tenant IDs / user IDs / DB primary keys leak in error envelopes. Server-side console errors (`console.error(...)`) are not returned to client.
- [x] **Rate limiting:** No new rate-limit decorator. Pre-existing app-level limits apply, plus an attacker is already authenticated as `tenant_admin`. The most expensive op is import-with-many-rows, capped at 10 MB file + ~65k Excel rows max. Acceptable.
- [ ] **BUG-5 (SEC):** No formula-injection sanitization in exported cells — a malicious user with `tenant_admin` could put `=…` formulas into `customer.company_name` or `article.name`, then export and share the file with someone outside the platform. See bug below.

### Regression Audit (touched / adjacent surface)

- [x] **OPH-106 (Discount Rates tab):** `customer-discounts-tab.tsx` adds two buttons but does not change the existing default-rate flow, search box, or override dialog wiring. After import, `refetch()` is called via the existing `useCustomerDiscounts` hook contract.
- [x] **OPH-104 (Price Lookup flag):** Tab is only mounted when the flag is true; both new endpoints re-verify the flag. No leak when flag is off — `403 "Price-Lookup-Modul ist fuer diesen Mandanten nicht aktiviert."`.
- [x] **OPH-105 (RRP):** Export uses `articles.rrp` via `toNumberOrNull`; no impact on RRP UI.
- [x] **OPH-39 (Article catalog import):** Uses the same `xlsx` library and a similar dialog UX, no shared state, no regression risk.
- [x] **`customer_default_discounts` / `customer_article_discounts` RLS (migration 054):** Both routes use the admin client and enforce tenant scoping in user-space; the RLS policies remain intact for direct client access.
- [x] **`tenant_user` role:** Discount tab loads in read-only mode and both new buttons are hidden behind `{!readOnly && ...}`. Even if a tenant_user crafts a direct API call, both routes return 403 (role check).

### Bugs Found

#### BUG-1: Export crashes with TypeError when customer_number is NULL
- **Severity:** High
- **Where:** `src/app/api/customers/[id]/discounts/export/route.ts:347`
- **Root cause:** The local `CustomerRow` interface declares `customer_number: string`, but migration `033_fix_customer_number_nullable.sql` made the column nullable. The code calls `customer.customer_number.replace(/[^a-zA-Z0-9_.-]/g, "_")` without a null guard.
- **Steps to Reproduce:**
  1. As `tenant_admin`, open a customer where `customer_number IS NULL` (e.g. an auto-created dealer-linked customer per OPH-49).
  2. Open the Rabatte tab and click "Excel exportieren".
  3. **Expected:** XLSX downloads with filename like `customer_discount_rates.xlsx` (fallback name).
  4. **Actual:** Server throws `TypeError: Cannot read properties of null (reading 'replace')`. The route catches it in the outer try/catch and returns 500 "Interner Serverfehler.". The user sees the toast `Export fehlgeschlagen.` with no clear cause.
- **Fix sketch:** Replace line 346-347 with `const raw = customer.customer_number ?? ""; const safeCustomerNumber = raw.replace(...) || "customer";`. Also relax the interface to `customer_number: string | null`.
- **Priority:** Fix before deployment.

#### BUG-2: Error count under-reports once 100-error cap is hit
- **Severity:** Low
- **Where:** `src/app/api/customers/[id]/discounts/import/route.ts` — `addError()` overflow logic + result toast in `customer-discounts-tab.tsx:236`.
- **Root cause:** After 100 errors, additional errors only bump the `+N weitere Fehler.` line but do not change `errors.length`. The success toast and the result dialog both read `errors.length`, so an import with 250 errors reports "101 Fehler" in the toast and shows 101 entries in the badge.
- **Steps to Reproduce:**
  1. Upload an XLSX with 250 rows, each carrying a random non-UUID string in the ID column.
  2. **Expected:** Toast says "0 aktualisiert, 250 Fehler" (or at minimum the badge in the dialog matches the actual count, even if the listed errors are capped).
  3. **Actual:** Toast says "0 aktualisiert, 101 Fehler" and the dialog badge shows 101.
- **Fix sketch:** Track a separate `totalErrorCount` integer alongside the bounded `errors` array, return both, and have the UI render the count from `totalErrorCount` while still listing only the first 100 strings + overflow tail.
- **Priority:** Fix in next sprint.

#### BUG-3: Excel percentage-formatted cells silently produce 100x-smaller rates
- **Severity:** Medium
- **Where:** `src/app/api/customers/[id]/discounts/import/route.ts:452` (`parseRate` for numeric input).
- **Root cause:** When a user types `15%` in Excel, the underlying numeric value is `0.15` (Excel applies a *percentage display format* to a fractional number). `parseRate` accepts this as a valid value in `[0, 100]` and writes `0.15` into `customer_article_discounts.discount_rate`. The user sees a 99% reduction in their intended discount (0.15% instead of 15%) with no warning.
- **Steps to Reproduce:**
  1. Export the discount sheet for a customer.
  2. In the Excel file, manually re-format the `Discount Rate (%)` column as "Prozent" (or paste a value with the percent format).
  3. Type `15` into a row that has a valid UUID. Excel may show `15%` but stores `0.15`.
  4. Re-upload the file.
  5. **Expected:** Either a row-level error ("Possible percentage-formatted cell") or the same UX as typing `15` (write 15.00).
  6. **Actual:** The override silently becomes 0.15%.
- **Fix sketch:** Either (a) read the cell's *number format* via `XLSX.utils.format_cell` and multiply by 100 for percent-formatted cells, or (b) reject sub-decimal values when the export format itself never produces them (i.e. error on any rate < 1 unless the user has explicitly opted in). Option (a) is more user-friendly, option (b) is mechanically safer.
- **Priority:** Fix before deployment (silent data corruption).

#### BUG-4: Export disabled when search returns 0 matches even if catalog has articles
- **Severity:** Low
- **Where:** `src/components/customer-catalog/customer-discounts-tab.tsx:338` — `disabled={isExporting || isLoading || total === 0}`.
- **Root cause:** `total` reflects the *filtered* count from `useCustomerDiscounts` (it equals search-result count). The export endpoint, however, always returns the full catalog regardless of search.
- **Steps to Reproduce:**
  1. Open Rabatte tab for a customer with 50 articles.
  2. Type "xyzabc" into the article search box.
  3. **Expected:** Export button remains enabled; clicking it exports all 50 articles.
  4. **Actual:** Export button becomes disabled with no tooltip explaining why.
- **Fix sketch:** Gate the export button on an "are there any articles at all?" condition rather than the filtered total — e.g. expose `unfilteredTotal` from the hook, or compare against `total === 0 && search === ""`.
- **Priority:** Fix in next sprint.

#### BUG-5 (SEC): Formula-injection in exported XLSX
- **Severity:** Medium
- **Where:** `src/app/api/customers/[id]/discounts/export/route.ts:290-297` (sheet rows).
- **Root cause:** Cell values are written verbatim from the DB. If `customer.company_name` or `articles.name` starts with `=`, `+`, `-`, `@`, or `\t`, Excel will treat the cell as a formula when the recipient opens the file. An attacker who has any write access to those fields (e.g. a tenant_admin in tenant A who later shares the file with someone outside the platform, or a compromised tenant_admin account in any tenant) can plant formulas that exfiltrate data via `=WEBSERVICE(...)`, `=HYPERLINK(...)`, or shell out via DDE.
- **Steps to Reproduce:**
  1. As tenant_admin, edit a customer's `company_name` to `=cmd|'/c calc'!A1`.
  2. Export the discount sheet.
  3. Open the file in Excel on a Windows host with DDE enabled.
  4. **Expected:** Cell content displays as the literal string `=cmd|'/c calc'!A1` with a leading apostrophe or similar escape.
  5. **Actual:** Excel attempts to evaluate the formula and prompts to run `calc.exe`.
- **Fix sketch:** Prefix any cell value that starts with `=`, `+`, `-`, `@`, `\t`, or `\r` with a leading apostrophe `'` (Excel's standard "text" escape). Apply to `Product Name`, `Customer Name`, and any future free-text column.
- **Priority:** Fix before deployment (security).

### Minor / Cosmetic (no bug ticket)

- The dialog blocks outside-click closing via `onPointerDownOutside={(e) => e.preventDefault()}`. Users have to use the X button or "Abbrechen". Consistent with `ArticleImportDialog`, no fix needed.
- "Importieren" button is not disabled while `isExporting`. Independent operations, but UX could be tightened by serializing them.
- The error list area uses `max-h-40 overflow-y-auto` with `text-xs` — readable but small. Consider `text-sm` for a hundred-line error list.
- The XLSX is built fully in memory before responding (no streaming). For the realistic max (~5000 articles × 6 columns), memory cost is trivial; flagged only as future-proofing.

### Summary

- **Acceptance Criteria:** 19/22 passed (3 failed: BUG-1 filename crash, BUG-2 error-count under-report, BUG-3 percentage cell handling — note that BUG-2 only fails one sub-bullet of the import AC).
- **Bugs Found:** 5 total — 0 Critical, 1 High (BUG-1), 2 Medium (BUG-3, BUG-5), 2 Low (BUG-2, BUG-4).
- **Security:** One injection issue (BUG-5). Authentication, authorization, tenant scoping, and feature-flag gating are correctly implemented.
- **Production Ready:** **NO** — BUG-1 (export crash on null customer_number), BUG-3 (silent data corruption from percentage-formatted cells), and BUG-5 (XLSX formula injection) must be fixed first.
- **Recommendation:** Fix BUG-1, BUG-3, and BUG-5 before deployment. BUG-2 and BUG-4 can ship in the next sprint.

## Deployment
_To be added by /deploy_
