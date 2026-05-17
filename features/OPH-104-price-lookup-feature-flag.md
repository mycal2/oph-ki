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

### Component Structure

```
Admin Tenant Detail Page (OPH-42)
└── TenantProfileForm (src/components/admin/tenant-profile-form.tsx)
    └── "Add-ons" section  (NEW — right column, follows existing section pattern)
        ├── Section header: Tag icon + "Add-ons"
        └── Price Lookup row
            ├── Label: "Price Lookup"
            ├── Description: "Enables customer-specific discount rates and automatic price lookup during extraction."
            └── Switch (on/off) — platform admin only

Tenant Settings Page (read-only surface)
└── Account / Plan section  (existing or new)
    └── "Price Lookup: Active / Inactive" — read-only badge, no toggle
```

### Data Model

**Change to existing `tenants` table:**
```
tenants
  + price_lookup_enabled  (true/false, default: false, required)
```

One boolean field. No new tables for this feature. DB migration adds the column with `DEFAULT false NOT NULL`.

**Change to existing Tenant type** (`src/lib/types.ts`):
- Add `price_lookup_enabled: boolean` to the `Tenant` interface.

**Change to validation schema** (`src/lib/validations.ts`):
- Add `price_lookup_enabled` as an optional boolean field in `UpdateTenantInput`.

### API Changes

**Existing route: `PATCH /api/admin/tenants/[id]`**
- Accept `price_lookup_enabled` in the request body.
- Platform-admin-only endpoint (already auth-guarded).
- No new route needed.

**Existing route: `GET /api/admin/tenants/[id]`**
- Returns `price_lookup_enabled` in the tenant response (no change needed once column exists).

**Tenant-facing settings route** (for the read-only badge):
- Whichever route tenant admins use to fetch their own tenant data already returns the tenant record — `price_lookup_enabled` will be included automatically once the column is added.

### Tech Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| UI surface for toggle | Existing `TenantProfileForm` right column, new "Add-ons" section | Same pattern as Billing, Email Forwarding, Excel Extraction — no new component needed |
| Toggle style | `Switch` (shadcn) with label + description | Consistent with all other boolean toggles in this form |
| Platform-admin restriction | Toggle rendered only when the current user is a platform admin | Tenant admins see a read-only indicator; same pattern used for other admin-only fields |
| Tenant-admin read-only surface | Small badge or text on the existing tenant settings / profile page | Minimal UI; tenant admins just need to know it's active, not control it |
| DB default | `DEFAULT false NOT NULL` | Safe: no existing tenant accidentally gains the feature; explicit opt-in |

### Dependencies

No new packages. All components and patterns already exist in the codebase.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
