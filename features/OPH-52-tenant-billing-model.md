# OPH-52: Tenant Billing Model Configuration

## Status: Planned
**Created:** 2026-03-24
**Last Updated:** 2026-03-24

## Dependencies
- Requires: OPH-8 (Admin: Mandanten-Management) — billing fields added to the tenant profile in admin

## User Stories
- As a platform admin, I want to assign a billing model to each tenant so that I can calculate what to invoice them each month.
- As a platform admin, I want the pricing fields to be pre-filled with default values when I select a billing model so that I don't have to look up the standard rates.
- As a platform admin, I want to override the default pricing values per tenant so that I can accommodate custom deals.
- As a platform admin, I want to see the billing model and pricing on the tenant detail page so that I always have the contract details at a glance.

## Billing Models & Default Values

| Model | Setup Fee (€) | Monthly Fee (€) | Cost per Order (€) |
|---|---|---|---|
| pay-per-use | 799 | 0 | 1.00 |
| license-based | 6,999 | 290 | 0.35 |
| flat-rate | 9,999 | 390 | 0.00 |

## Acceptance Criteria
- [ ] The tenant profile page in admin (`/admin/tenants/[id]`) shows a "Billing" section with:
  - A dropdown to select billing model: Pay-per-use, License-based, Flat-rate (or "Not set")
  - Three numeric input fields: Setup Fee (€), Monthly Fee (€), Cost per Order (€)
- [ ] When a billing model is selected, the three input fields are pre-filled with the default values for that model
- [ ] The pre-filled values can be manually overridden (custom deal)
- [ ] Changing the billing model dropdown to a different model re-fills the fields with that model's defaults (with a confirmation if the user has already changed the values)
- [ ] Billing data is saved alongside other tenant profile data
- [ ] All three price fields accept decimal values (e.g. 0.35)
- [ ] A tenant with no billing model set shows "—" in any billing-related displays
- [ ] Only platform admins can view or edit billing fields (not tenant users)

## Edge Cases
- What if a tenant has a custom price and the admin accidentally switches the model dropdown? → Show a confirmation: "Preise werden auf Standardwerte zurückgesetzt. Fortfahren?"
- What if a field is left empty? → Treat as 0.00 for calculations
- What if setup fee is 0 for an existing tenant? → Store 0 explicitly (not null)
- Tenant with no billing model selected should not break the billing report (skip or show as "—")

## Technical Requirements
- New columns on `tenants` table: `billing_model` (enum or text), `setup_fee` (numeric), `monthly_fee` (numeric), `cost_per_order` (numeric)
- Security: billing fields only readable/writable via admin API (platform_admin role required)

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
