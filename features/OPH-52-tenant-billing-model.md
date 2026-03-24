# OPH-52: Tenant Billing Model Configuration

## Status: In Review
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

### Layers affected

| Layer | What changes |
|---|---|
| Database | 4 new nullable columns on `tenants` table |
| TypeScript types | `Tenant` interface extended with billing fields |
| Validation | `updateTenantSchema` extended with billing fields |
| UI | New "Abrechnung" section added to `TenantProfileForm` |
| API | No structural change — existing `PATCH /api/admin/tenants/[id]` passes through new fields automatically once schema is updated |

### Component structure

```
/admin/tenants/[id] (existing page — no changes to tabs or layout)
+-- Profile Tab
    +-- TenantProfileForm (existing — extended)
        +-- [existing fields: name, email, ERP type, status, ...]
        +-- ── Abrechnung ── (NEW card section)
            +-- Billing Model dropdown
            |     Options: Pay-per-use | License-based | Flat-rate | Nicht gesetzt
            +-- Setup Fee (€) — numeric input, pre-filled on model select
            +-- Monthly Fee (€) — numeric input, pre-filled on model select
            +-- Cost per Order (€) — numeric input, pre-filled on model select
            +-- [Saved together with the rest of the form on "Speichern"]
        +-- Confirmation Dialog (appears when switching model
                                 after prices were manually edited)
```

### Data model

4 new nullable columns on `tenants`:

| Column | Type | Notes |
|---|---|---|
| `billing_model` | text, nullable | `pay-per-use` \| `license-based` \| `flat-rate` \| null |
| `setup_fee` | numeric(10,2), nullable | null = not configured; 0.00 stored explicitly |
| `monthly_fee` | numeric(10,2), nullable | null = not configured |
| `cost_per_order` | numeric(10,2), nullable | null = not configured |

Default values are hardcoded in the frontend (3-row lookup — no DB table needed):

| Model | Setup Fee | Monthly Fee | Cost per Order |
|---|---|---|---|
| pay-per-use | 799.00 | 0.00 | 1.00 |
| license-based | 6999.00 | 290.00 | 0.35 |
| flat-rate | 9999.00 | 390.00 | 0.00 |

### Key decisions

- **Billing section in existing profile form, not a new tab** — 4 fields don't warrant a separate tab; contract details belong alongside tenant identity.
- **Default values hardcoded in frontend** — business constants, not user data; no need for a lookup table.
- **Confirmation only when values were manually changed** — avoids interrupting the admin when selecting a model for the first time; only warns before overwriting deliberate customization.
- **Nulls, not zeros, for unconfigured tenants** — lets OPH-53/54 distinguish "not set up" from "zero-priced deal"; tenants with null billing are excluded from revenue KPIs.
- **No new RLS policy** — existing admin-only policy on the `tenants` table already restricts access to platform admins.

### New packages required

None — `Select`, `Input`, `AlertDialog` are already installed.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
