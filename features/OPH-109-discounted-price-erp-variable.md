# OPH-109: Discounted Price ERP Export Variable

## Status: Planned
**Created:** 2026-05-17
**Last Updated:** 2026-05-17

## Dependencies
- OPH-108 (Price Lookup in AI Extraction) — produces the `discounted_price` value
- OPH-32 (Visual Field Mapper for ERP Output Format) — variable surfaces in field mapper
- OPH-31 (Variable Click-to-Insert in XML Template Editor) — variable surfaces in XML template editor
- OPH-104 (Price Lookup Feature Flag) — variable is only meaningful when flag is enabled

## Background

Once OPH-108 populates `discounted_price` on extracted line items, tenant admins need to be able to map it to their ERP export format. This feature exposes `discounted_price` as a first-class variable in all export format editors (field mapper, XML template, CSV column mapping) and makes it visible in the order review UI.

## User Stories

- As a tenant admin, I want to map `discounted_price` to a column in my ERP CSV export so my ERP receives the correct negotiated price.
- As a tenant admin, I want to use `{{discounted_price}}` in my XML ERP template so the exported XML includes the discounted price per line.
- As a tenant admin, I want to see the discounted price for each line item on the order review page so I can verify it before export.

## Acceptance Criteria

- [ ] `discounted_price` is available as a line-item variable in the Visual Field Mapper (OPH-32).
- [ ] `{{line_items[].discounted_price}}` is available as a click-to-insert variable in the XML template editor (OPH-31).
- [ ] `discounted_price` is listed as a mappable source field in CSV column mapping.
- [ ] The variable panel / variable list shows `discounted_price` only when `price_lookup_enabled = true` for the tenant; it is hidden otherwise.
- [ ] On the order review page (line items table), a "Discounted Price" column is shown when `price_lookup_enabled = true`.
- [ ] If `discounted_price` is `null` for a line item (lookup failed → Klärung), the review page shows "—" and the export emits an empty value for that field.
- [ ] The display format for `discounted_price` in the review UI is currency (e.g. "€ 12.50").
- [ ] DE/EN i18n keys added for all new labels ("Discounted Price", "Rabattierter Preis").
- [ ] `npx tsc --noEmit` clean.

## Edge Cases

- **Flag disabled mid-mapping:** If a tenant has an ERP config that maps `discounted_price` and the flag is later turned off, the mapping remains in the config but exports emit an empty value (null). No config changes needed.
- **Field mapper with null value:** When the source field is null, the export format should emit an empty string (CSV), `null` (JSON), or empty element (XML) — consistent with other nullable fields.
- **Order exported before price lookup runs (legacy orders):** Old orders without `discounted_price` in their JSON will show "—" in the review UI and export empty — no re-extraction required.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview
OPH-109 is a UI surfacing task on top of OPH-108. The `discounted_price` field already exists on `CanonicalLineItem` (added by OPH-108) and is populated by the price-lookup step. This feature exposes it in three places: (1) the export-value resolver so it can flow to CSV/XML/JSON exports, (2) the three variable-list UIs so tenant admins can map it, and (3) the order review line-items table so users can verify the price before export.

No new tables, no new APIs, no new packages. Pure additive UI/library glue.

### Touch Points

```
Export resolver:
  src/lib/export-utils.ts → getLineItemValue()   ← add "discounted_price" case

Variable lists (the 3 mapping UIs):
  src/components/admin/field-mapper-panel.tsx       ← add to VARIABLE_GROUPS (line items)
  src/components/admin/erp-xml-template-editor.tsx  ← add to AVAILABLE_VARIABLES
  src/components/admin/erp-csv-column-builder.tsx   ← add to SOURCE_FIELD_SUGGESTIONS

Review UI:
  src/components/orders/preview/line-items-table.tsx ← add "Rabattierter Preis" column
                                                       (conditional on price_lookup_enabled)

i18n:
  messages/de.json + messages/en.json  ← discountedPrice label
```

### Feature-Flag Gating

The variable must only appear in the mapping UIs when the **tenant** has `price_lookup_enabled = true`. Two design choices here:

- **Variable list (admin pages):** The variable list arrays are currently static module constants. To gate them, the components must read the flag and filter at render time. Since these editors are platform-admin tools that may serve multiple tenants (shared ERP configs from OPH-29), the cleanest gate is on the **tenant the config belongs to** (or, for shared configs, "any tenant using this config has the flag").

  Pragmatic decision: **always show the variable** in the admin UIs, with a tooltip explaining "only populates when the tenant's price_lookup add-on is active." This avoids the cross-tenant flag-resolution problem on the admin side, and the variable simply emits empty when the flag is off (matches AC: "exports emit an empty value").

- **Review UI (tenant pages):** Easy — the tenant is unambiguous. Hide the column when the tenant's flag is false.

### Display Format

In the review table: `Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" })` — same helper used for RRP in the article catalog (OPH-105). Null shows as "—" (matching the existing column convention).

In exports: numeric value with the tenant's `decimal_separator` from `erp_configs` (already handled generically by the export-utils for unit_price/total_price). No special-case formatting needed.

### Tech Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Variable visibility in admin UIs | Always visible with explanatory tooltip | Avoids resolving tenant flag from inside shared configs; null-on-export degrades gracefully. |
| Variable visibility in review UI | Strictly flag-gated | Tenant context is unambiguous; cleaner UX. |
| Variable path in field mapper | `this.discounted_price` (line items) | Matches existing per-item variable naming. |
| Variable path in CSV builder | `items[].discounted_price` | Matches existing items[] convention. |
| Display format | Intl.NumberFormat de-DE EUR | Consistent with RRP display in OPH-105. |
| Null handling | "—" in UI, empty in CSV, null/omitted in JSON/XML | Matches existing nullable-field conventions. |

### New Packages
None.

### No DB Changes
Reuses the `discounted_price` field already on `CanonicalLineItem` from OPH-108.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
