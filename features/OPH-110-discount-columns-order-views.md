# OPH-110: Discount & Net Price Columns in Order Line-Item Views

## Status: Deployed

## Created: 2026-05-18

## Overview
When a tenant has the Price Lookup add-on enabled (`price_lookup_enabled = true`), show two additional columns — **Rabatt (%)** and **Rabattierter Preis** — in both the order detail overview and the review/edit form.

On the overview the columns are read-only.  
On the review form the user can edit the **Rabatt (%)** field; **Rabattierter Preis** auto-recalculates (read-only) using the stored RRP: `discounted_price = rrp × (1 − discount_rate / 100)`.

## Dependencies
- OPH-104: Tenant Price Lookup Feature Flag — gate condition
- OPH-105: Article RRP Field — RRP needed for recalculation
- OPH-106: Customer Discount Rates — source of discount rates
- OPH-108: Price Lookup in AI Extraction — populates `discounted_price` + `discount_rate` on line items
- OPH-109: Discounted Price ERP Export Variable — `discounted_price` already stored on `CanonicalLineItem`

## User Stories

1. **As a tenant user** viewing an order, I want to see the applied discount rate and net price per position so I can verify pricing without opening each article.
2. **As a tenant user** in review mode, I want to correct the discount rate if the AI applied the wrong one, so that the exported price is accurate.
3. **As a tenant user** in review mode, I want the net price to recalculate instantly when I change the discount, so I don't have to do mental arithmetic.
4. **As a tenant user**, I want the form to be wide enough that the extra columns don't feel cramped.

## Acceptance Criteria

### Data layer
- [ ] `CanonicalLineItem` gains `discount_rate?: number | null` — the percentage used (0–100)
- [ ] `CanonicalLineItem` gains `rrp?: number | null` — the article RRP used for the calculation
- [ ] `priceLookupForOrder()` populates both fields on every successfully resolved line item

### Overview table (`LineItemsTable`)
- [ ] When `priceLookupEnabled=true`, shows "Rabatt (%)" column (formatted DE: "25,00 %") right of Einzelpreis
- [ ] When `priceLookupEnabled=true`, shows "Rabattierter Preis" column right of Rabatt (already partially implemented in OPH-109, now appears alongside the discount column)
- [ ] Both columns are absent when flag is false
- [ ] Null discount or price shows "—"

### Review form (`OrderEditForm` / `LineItemRow`)
- [ ] When `priceLookupEnabled=true`, each line item shows an editable "Rabatt (%)" input (0–100, German decimal)
- [ ] Changing the discount updates `discount_rate` and recalculates `discounted_price = rrp × (1 − rate/100)` in memory immediately
- [ ] "Rabattierter Preis" is a read-only display field below or beside the discount input
- [ ] When `rrp` is null, "Rabattierter Preis" shows "—" (cannot calculate)
- [ ] Recalculated value is saved to the order JSON via auto-save (existing mechanism)
- [ ] Both fields are absent when flag is false

### Layout
- [ ] Review page max-width increased from current value to accommodate extra columns without horizontal scroll on ≥ 1280 px screens

## Edge Cases
- Line item with `price_lookup_reason ≠ "ok"` (no price resolved) → discount field editable but Rabattierter Preis shows "—" unless RRP is available
- `discount_rate = 0` → net price = RRP (no discount); renders as "0,00 %" not "—"
- `discount_rate = 100` → net price = 0,00 €; valid edge case
- Existing orders without `discount_rate` / `rrp` on line items (pre-OPH-110 orders) → both show "—"
- Tenant with flag disabled → columns hidden, inputs hidden; no visual change

## Tech Design

### Types (`src/lib/types.ts`)
Add to `CanonicalLineItem`:
```
discount_rate?: number | null;   // percent 0–100
rrp?: number | null;             // article list price used for calculation
```

### `priceLookupForOrder()` (`src/lib/price-lookup.ts`)
On successful resolution, also return `discount_rate: effectiveRate` and `rrp: article.rrp`.

### `LineItemsTable` (`src/components/orders/preview/line-items-table.tsx`)
- Add "Rabatt (%)" `<th>` and `<td>` between Einzelpreis and Rabattierter Preis
- Format using `toFixed(2).replace(".", ",") + " %"`

### `OrderEditForm` / `LineItemRow` (`src/components/orders/review/order-edit-form.tsx`)
- Replace the read-only footer row with two fields in a new grid row:
  - Editable `Input` for "Rabatt (%)" — updates `discount_rate`; triggers recalculation of `discounted_price` using stored `rrp`
  - Read-only display for "Rabattierter Preis"

### Layout
- Review page: increase `max-w-*` class or switch container to wider preset
