# OPH-106: Customer Discount Rates Management

## Status: Planned
**Created:** 2026-05-17
**Last Updated:** 2026-05-17

## Dependencies
- OPH-104 (Price Lookup Feature Flag) — UI only visible when flag is enabled
- OPH-105 (Article RRP Field) — articles need RRPs before discounts are meaningful
- OPH-46 (Manufacturer Customer Catalog) — discount rates live inside the customer detail view

## Background

Each customer of a tenant may have negotiated discount rates for the tenant's products. Discounts are stored as percentages. A customer can have:

1. A **default discount rate** — applies to all products that have no explicit override.
2. **Per-product overrides** — a specific rate for individual articles that differs from the default.

The system looks up the discount using: explicit per-product rate → customer default rate → missing (triggers Klärung in OPH-108).

## User Stories

- As a tenant admin, I want to open a customer in my customer catalog and see a "Discount Rates" tab so I can manage their pricing.
- As a tenant admin, I want to set a default discount rate for a customer so that all products automatically receive that rate during price lookup.
- As a tenant admin, I want to add a per-product override for a customer so that specific articles have a different discount than the default.
- As a tenant admin, I want to edit or delete any explicit per-product override so I can correct mistakes.
- As a tenant admin, I want to see the effective discount rate for every article (whether it comes from an explicit override or the customer default) in one table.

## Acceptance Criteria

- [ ] `price_lookup_enabled = true` on the tenant is required to see the Discount Rates tab; it is hidden otherwise.
- [ ] The customer detail view has a "Discount Rates" tab alongside existing customer info.
- [ ] The tab shows:
  - A **Default Discount Rate** field at the top (editable; format: percentage e.g. "15.00 %").
  - A table of all articles in the tenant's article catalog, each row showing: Article Number, Article Name, RRP, Effective Discount Rate (%), Computed Discounted Price (= RRP × (1 − rate)), Override Source ("Default" or "Override").
- [ ] Rows with an explicit per-product override are visually distinguished from rows using the default (e.g. bold or badge).
- [ ] Tenant admin can click any row to set or edit an explicit override for that article.
- [ ] Tenant admin can delete an explicit override (row reverts to the customer default).
- [ ] Saving the default discount rate does NOT create/modify existing explicit override records — it only changes the fallback value.
- [ ] If no default discount rate is set and no explicit override exists for an article, the Effective Discount Rate shows "—" (no rate).
- [ ] A new article added to the catalog after the default is set automatically appears in this table and resolves to the default rate (dynamic lookup, no record creation).
- [ ] All operations are tenant-scoped (no cross-tenant data access).
- [ ] `npx tsc --noEmit` clean.

## Data Model (conceptual)

**`customer_default_discounts`** — one row per (tenant, customer):
- `tenant_id`, `customer_id`, `discount_rate` (%)

**`customer_article_discounts`** — one row per explicit (tenant, customer, article) override:
- `id` (UUID), `tenant_id`, `customer_id`, `article_id`, `discount_rate` (%)

Both tables have DB migrations added by the backend skill.

## Edge Cases

- **Customer has no default and no overrides:** Table shows all articles with "—" for discount — no Klärung at this point (Klärung fires during extraction in OPH-108, not in the management UI).
- **Delete the default:** All articles with no explicit override revert to "—". The explicit overrides remain intact.
- **Article removed from catalog:** Its discount records become orphaned; they should be CASCADE-deleted when the article is deleted.
- **Discount rate = 0%:** Valid — the customer pays full RRP. Displayed as "0.00 %", discounted price = RRP.
- **Discount rate > 100%:** Rejected with validation error ("Discount rate must be between 0 and 100").
- **Large catalog:** Table is paginated or virtualized if the tenant has > 100 articles.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
