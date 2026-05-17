# OPH-104: Tenant Price Lookup Feature Flag

## Status: Planned
**Created:** 2026-05-17
**Last Updated:** 2026-05-17

## Dependencies
- OPH-8 (Admin: Mandanten-Management) — flag lives on the tenant record
- OPH-42 (Admin Tenant Detail Page) — toggle surface in admin UI

## Background

Price lookup (OPH-106–109) is a paid add-on service. Before any discount-rate functionality is visible to a tenant, a platform admin must explicitly enable it on that tenant. Tenants with the flag disabled see no discount-related UI and the extraction pipeline skips the price-lookup step entirely.

## User Stories

- As a platform admin, I want to enable the price lookup add-on for a specific tenant so that their team can manage customer discount rates.
- As a platform admin, I want to disable the price lookup add-on for a tenant so that the feature is hidden and extraction skips the lookup.
- As a tenant admin, I want to see clearly whether price lookup is active on my account so I know whether discount rates will be applied during extraction.

## Acceptance Criteria

- [ ] The `tenants` table has a `price_lookup_enabled` boolean column (default: `false`).
- [ ] The platform admin tenant detail page (OPH-42) shows a "Price Lookup" toggle with the current state.
- [ ] A platform admin can flip the toggle; the change persists immediately.
- [ ] When `price_lookup_enabled = false`: no discount-rate UI is shown to the tenant, and the extraction pipeline does not attempt a price lookup.
- [ ] When `price_lookup_enabled = true`: the Discount Rates tab in the customer catalog (OPH-106) and the extraction price-lookup step (OPH-108) become active.
- [ ] Tenant admins can see "Price Lookup: Active / Inactive" read-only on their own settings page — they cannot change it themselves.
- [ ] DB migration adds the column with `DEFAULT false NOT NULL`.

## Edge Cases

- **Disabling mid-use:** If a tenant has discount rate records and the flag is turned off, the records are preserved — they just become dormant. Re-enabling restores full functionality without data loss.
- **New tenants:** Flag defaults to `false`; platform admins explicitly opt them in.
- **Extraction in-flight:** An order that begins extraction while the flag is `true` but the flag is toggled to `false` before the extraction completes: extraction uses the flag value captured at job start — no partial lookups.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
