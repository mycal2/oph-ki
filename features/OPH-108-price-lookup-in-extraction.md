# OPH-108: Price Lookup in AI Extraction

## Status: Planned
**Created:** 2026-05-17
**Last Updated:** 2026-05-17

## Dependencies
- OPH-104 (Price Lookup Feature Flag) — step only runs when `price_lookup_enabled = true`
- OPH-105 (Article RRP Field) — RRP required to compute discounted price
- OPH-106 (Customer Discount Rates Management) — discount data queried here
- OPH-47 (AI Customer Number Matching) — customer must be identified before rate lookup
- OPH-40 (AI Article Number Matching) — articles must be matched before rate lookup
- OPH-93 (Clarification Order Status) — Klärung flow used when lookup fails

## Background

After AI extraction produces line items with matched article numbers and a matched customer number, this step computes the discounted price for each line item. If any line item cannot be resolved (missing article, missing customer, missing RRP, or no discount rate for that combination), the order is sent to Klärung so a human can investigate.

**Lookup priority per line item:**
1. Explicit per-product discount for this customer (`customer_article_discounts`)
2. Customer default discount (`customer_default_discounts`)
3. Neither found → Klärung

**Discounted price formula:** `discounted_price = RRP × (1 − discount_rate / 100)`

## User Stories

- As a tenant admin, I want each extracted order line to include a `discounted_price` so I can use it in my ERP export format.
- As a tenant admin, I want orders that cannot be fully priced to be flagged for Klärung so my team can investigate rather than silently exporting wrong prices.
- As a tenant admin, I want the Klärung note to list exactly which products are missing a discount so my team knows what to fix.

## Acceptance Criteria

- [ ] The price lookup step only runs when `tenants.price_lookup_enabled = true` for the order's tenant.
- [ ] The step runs after article matching (OPH-40) and customer matching (OPH-47) complete.
- [ ] For each line item in the extracted JSON, the system:
  1. Attempts to find the article in the tenant's catalog by matched `article_number`.
  2. Looks up an explicit `customer_article_discounts` record for (tenant, customer, article).
  3. Falls back to `customer_default_discounts` for (tenant, customer) if no explicit record.
  4. Computes `discounted_price = article.rrp × (1 − discount_rate / 100)`.
- [ ] `discounted_price` is stored as a new field on each line item in the extracted JSON.
- [ ] If the article has no RRP, this counts as a lookup failure for that line item.
- [ ] If ALL line items resolve successfully: order proceeds to normal review status.
- [ ] If ANY line item fails to resolve:
  - [ ] Order status is set to **clarification**.
  - [ ] A structured Klärung note is written, listing each unresolved line item: article number + reason (e.g. "No discount rate found", "Article not in catalog", "Article has no RRP").
  - [ ] A Klärung notification email is sent (using the existing notification system from OPH-13/OPH-93).
- [ ] The `discounted_price` field is `null` on line items that could not be resolved (even when the order is moved to Klärung).
- [ ] If `price_lookup_enabled = false`: the step is skipped entirely, `discounted_price` is not added to the JSON, order flow is unchanged.
- [ ] Performance: price lookup adds < 500ms to total extraction time.

## Edge Cases

- **Customer not identified:** If AI extraction could not match a customer, all line items are unresolvable → entire order → Klärung. Note: "Customer not identified — cannot perform price lookup."
- **Partial match:** 8 of 10 line items resolve, 2 don't → order still goes to Klärung. The 8 successfully resolved items still have their `discounted_price` populated in the JSON.
- **Discount rate = 0%:** Valid. `discounted_price = RRP`. Not a failure.
- **RRP = 0:** Valid (product is free). `discounted_price = 0`. Not a failure.
- **Re-extraction:** If an order is re-extracted (e.g. after Klärung is resolved and rates are added), the price lookup step runs again with the current discount data.
- **Concurrent flag toggle:** Extraction uses the flag value at job-start time; a toggle mid-flight does not affect the running job.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
