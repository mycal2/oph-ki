# OPH-108: Price Lookup in AI Extraction

## Status: In Progress
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

### Overview
OPH-108 inserts a new **price-lookup step** into the existing extraction pipeline, between customer matching (OPH-47) and the final `extracted_data` write. The step enriches each line item with a `discounted_price` and aggregates any per-line lookup failures into a structured Klärung note. No new tables, no new routes — everything plugs into the existing extract route.

### Integration Point in Pipeline

```
extract/route.ts current flow:
  1. Fetch order + files
  2. Run Claude extraction → canonical JSON
  3. matchArticleNumbers()     ← line 611
  4. matchCustomerNumber()      ← line 710
  5. (NEW) priceLookup()        ← inserted here
  6. Compute confidence
  7. UPDATE orders.extracted_data + status   ← line 759
```

The step runs only when `tenant.price_lookup_enabled = true`; otherwise it's a no-op and the line items are written unchanged.

### New Helper Module

```
src/lib/price-lookup.ts
  ├─ priceLookupForOrder(input):
  │   ├─ input: { tenantId, extractedData, supabaseAdmin }
  │   └─ output: { extractedData, allResolved, unresolvedItems[] }
  └─ One internal helper resolveLineItem() per line.
```

A single function — pure (no I/O after the lookup queries). The extract route calls it, gets back the enriched JSON + a verdict, and decides whether to move to Klärung.

### Lookup Algorithm (per line item)

```
Given a line_item with article_number and a matched customer_id:

1. If !customer_id:                    → unresolved, reason="customer_not_identified"
2. If !article_number:                 → unresolved, reason="article_not_matched"
3. Find article in article_catalog WHERE
     tenant_id = T AND article_number = N
   If not found:                       → unresolved, reason="article_not_in_catalog"
4. If article.rrp IS NULL:             → unresolved, reason="article_missing_rrp"
5. Look up override:
     customer_article_discounts WHERE
       tenant_id=T AND customer_id=C AND article_id=A
   If found:                            → effective_rate = override.discount_rate
6. Else look up default:
     customer_default_discounts WHERE
       tenant_id=T AND customer_id=C
   If found:                            → effective_rate = default.discount_rate
7. Else:                                → unresolved, reason="no_discount_rate"
8. discounted_price = round(article.rrp × (1 − rate/100), 4)
```

### Query Batching

To stay under the 500 ms budget for orders with many line items:

| Query | Scope | Notes |
|-------|-------|-------|
| `article_catalog` WHERE `tenant_id=T AND article_number IN (...)` | One batch SELECT for all line items | Already needed by OPH-40 — can reuse the matched articles cache if available, else one extra query. |
| `customer_article_discounts` WHERE `tenant_id=T AND customer_id=C AND article_id IN (...)` | One batch SELECT for all overrides for this customer + this batch of articles | Single query, indexed by `(tenant_id, customer_id)`. |
| `customer_default_discounts` WHERE `tenant_id=T AND customer_id=C` | Single row, single query | |

Total: 3 SELECTs regardless of line-item count. For 50-line orders this stays well under 500 ms.

### Data Shape Changes

**CanonicalLineItem** gains:
```
discounted_price: number | null
price_lookup_reason?: "ok" | "customer_not_identified" | "article_not_matched"
                     | "article_not_in_catalog" | "article_missing_rrp"
                     | "no_discount_rate"
```

`discounted_price` is `null` whenever resolution failed. The reason is stored on the line so the UI can display it later (and to help build the Klärung note).

### Klärung Note Format

When any line item is unresolved, the extract route sets:
- `order.status = "clarification"`
- `order.clarification_note = formatted multi-line string`

```
Beispiel-Klärungsnotiz:

Preisermittlung unvollständig:
- Position 1, Art.Nr. 142.1EM: Kein Rabattsatz für diesen Kunden hinterlegt.
- Position 3, Art.Nr. 108/060HD: Artikel hat keinen UVP.
- Position 7: Artikel nicht im Katalog gefunden.
```

The note is built from the structured `unresolvedItems[]` list. Capped at 500 chars (existing constraint); if exceeded, truncate with "…und N weitere".

### Notification

A Klärung notification email is fired via the existing `sendOrderNotification()` path (OPH-13/OPH-93) only when the status transitions to `clarification` due to price lookup. No new email template — reuses the existing clarification email.

### Tech Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Where to hook in | Inline in `extract/route.ts` after customer matching | Minimal indirection; price lookup is conceptually part of extraction. |
| Single helper module | `src/lib/price-lookup.ts` | Keeps the route file from growing further; pure function is easy to unit-test. |
| Failure mode | One Klärung per order (not per line) | Matches existing flow (OPH-93). Per-line failures are listed inside the note. |
| Re-extraction support | None special needed | The new step runs every time extraction runs; current discount data is always used. |
| Performance budget | 3 batched SELECTs total | Beats the 500 ms acceptance criterion comfortably. |
| Flag check timing | Read `tenant.price_lookup_enabled` at job start | Acceptance criterion: mid-flight toggles don't affect running jobs. |

### New Packages
None.

### No DB Changes
Reuses tables from OPH-105/106. No new columns; `discounted_price` lives inside the existing `orders.extracted_data` JSON blob.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
