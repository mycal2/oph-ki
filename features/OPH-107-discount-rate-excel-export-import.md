# OPH-107: Discount Rate Excel Export & Import

## Status: Planned
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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
