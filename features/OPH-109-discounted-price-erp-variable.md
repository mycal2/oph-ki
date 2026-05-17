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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
