# OPH-105: Article RRP (Recommended Retail Price) Field

## Status: Planned
**Created:** 2026-05-17
**Last Updated:** 2026-05-17

## Dependencies
- OPH-39 (Manufacturer Article Catalog) — adds a field to the existing articles table and catalog UI

## Background

Discount rates (OPH-106) are stored as percentages. To compute the actual discounted price, the system needs the Recommended Retail Price (RRP) per article. This is a single price per product — the same for all customers — and is managed as part of the article catalog.

## User Stories

- As a tenant admin, I want to enter an RRP for each article in my catalog so that discounted prices can be computed automatically during extraction.
- As a tenant admin, I want the RRP to be visible in the article list so I can spot articles that are missing a price.
- As a tenant admin, I want to include the RRP in article CSV/Excel imports and exports so I can manage it in bulk alongside other article data.

## Acceptance Criteria

- [ ] The `articles` table has an `rrp` column (`NUMERIC(12,4)`, nullable, default null).
- [ ] The article form dialog (create/edit) includes an "RRP (€)" numeric input field.
- [ ] The article catalog table shows an "RRP" column (right-aligned, formatted as currency; blank if null).
- [ ] The article CSV/Excel export includes an `rrp` column.
- [ ] The article CSV/Excel import accepts an `rrp` column (numeric; invalid values are skipped with a row-level error).
- [ ] Articles without an RRP can still exist — the field is optional.
- [ ] DB migration adds `rrp NUMERIC(12,4) NULL` to the `articles` table.
- [ ] `npx tsc --noEmit` clean.

## Edge Cases

- **RRP = 0:** Treated as a valid explicit price of zero, not as "not set". Display as "€0.00".
- **RRP missing when price lookup fires:** If extraction tries to compute a discounted price but the article has no RRP, treat it the same as "no discount record found" — triggers Klärung (handled by OPH-108).
- **Currency:** Stored as a raw numeric value. Currency symbol display is always €; no multi-currency support in scope.
- **Import: negative RRP:** Reject with a row-level validation error ("RRP must be ≥ 0").

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
