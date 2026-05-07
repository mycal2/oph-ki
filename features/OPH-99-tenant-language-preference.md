# OPH-99: Tenant-Level Language Preference

## Status: Planned
**Created:** 2026-05-07
**Last Updated:** 2026-05-07

## Dependencies
- Requires: OPH-98 (i18n Infrastructure) — translation files and locale resolution utility must exist first.

## Overview
Tenant admins can set a preferred UI language for their entire tenant. This language becomes the default for all users of that tenant who have not set a personal preference (OPH-100). Platform admins can also set the language on behalf of a tenant from the Admin Tenant Detail page.

## User Stories
- As a tenant admin, I want to set my company's preferred UI language in the tenant settings so that all my colleagues see the app in the right language by default.
- As a tenant admin, I want to change the language at any time and have the change take effect immediately for all users of my tenant.
- As a platform admin, I want to set the language preference on any tenant's profile so that I can configure it during onboarding without asking the tenant admin to do it.
- As a tenant user who has not set a personal language preference, I want the app to automatically use my company's configured language so that I don't have to configure anything myself.

## Acceptance Criteria
- [ ] The `tenants` table has a `preferred_locale` column (`text`, nullable, values: `"de"` or `"en"`).
- [ ] Tenant settings page shows a "Sprache / Language" selector with options: Deutsch (de) and English (en).
- [ ] Saving the language preference persists it to `tenants.preferred_locale`.
- [ ] The platform Admin Tenant Detail page also shows and allows editing the language preference.
- [ ] When a tenant user loads any protected page and has no personal language preference (OPH-100), the tenant's `preferred_locale` is used as the active locale.
- [ ] When `preferred_locale` is null (not set), the locale falls back to the system default (`de`).
- [ ] Language change takes effect on next page navigation (no hard reload required).
- [ ] The language selector displays the language names in both their native form (e.g., "Deutsch", "English") for clarity.
- [ ] RLS ensures only tenant_admin and platform_admin can write `preferred_locale`.

## Edge Cases
- A tenant has `preferred_locale = "en"` but a specific user has set their own preference to `"de"` — the user preference wins (handled by OPH-100, not this feature).
- The column is null for existing tenants after migration — treat as `"de"` (default behaviour unchanged).
- A platform admin changes a tenant's language — the next page load for any user of that tenant should reflect the change (since the locale is resolved server-side from the tenant record).
- The tenant settings page itself must render in the tenant's currently active locale (chicken-and-egg: use the existing active locale to render the selector).

## Technical Requirements
- Database migration: `ALTER TABLE tenants ADD COLUMN preferred_locale TEXT CHECK (preferred_locale IN ('de', 'en'))`.
- The locale is read server-side (in layout or middleware) and passed to the `next-intl` provider so no client-side fetching is needed.
- Expose the tenant locale value through the existing tenant data-fetch (already loaded for authenticated users).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

OPH-99 extends two existing surfaces — no new pages needed.

```
Tenant Settings (/settings/profile or /settings/general)
  └── Language Preference Card  (NEW)
        └── Language selector: Deutsch | English
        └── Save button → PATCH /api/settings/language
              └── On success: tenant_locale cookie set → locale active on next navigation

Admin Tenant Detail Page (/admin/tenants/[id])
  └── Tenant Profile Form (existing, extended)
        └── Language Preference Field  (NEW — one additional row)
              └── Selector: Not set | Deutsch | English
              └── Saves via existing PATCH /api/admin/tenants/[id]
```

### Data Model

One new nullable column on the existing `tenants` table:

```
tenants (existing):
  + preferred_locale  TEXT, nullable
                      Allowed values: "de" | "en"
                      null = not set → system falls back to "de"
```

The `Tenant` TypeScript type gains one optional field: `preferred_locale`.

### API Changes

New tenant-admin endpoint:
```
PATCH /api/settings/language
  Auth:   tenant_admin role only (checked server-side)
  Body:   { preferred_locale: "de" | "en" }
  Effect: saves to tenants.preferred_locale, sets tenant_locale cookie on response
```

Extended existing platform-admin endpoint:
```
PATCH /api/admin/tenants/[id]  (already exists)
  Change: accept preferred_locale in the request body + validation schema
```

### Locale Propagation (How All Tenant Users Pick Up the Change)

The protected layout already fetches the tenant record on every authenticated
page load. OPH-99 adds one step to that fetch:

```
Every authenticated page load:
  1. Layout fetches tenant record (already happens today)
  2. If user has no personal preference (OPH-100 domain):
       → read tenant.preferred_locale
       → write it to the tenant_locale cookie on the response
  3. request.ts resolves: user_locale cookie → tenant_locale cookie → "de"

Result: all tenant users see the tenant language on every page,
        automatically, without any personal action
```

### Two-Cookie Design (tenant_locale + user_locale)

OPH-99 writes `tenant_locale`. OPH-100 writes `user_locale`. They stay independent:

| Single cookie | Two cookies (chosen) |
|---|---|
| Can't tell if value was set by tenant or user | Each feature owns its scope cleanly |
| OPH-100 must know tenant value to avoid overwriting | OPH-100 simply writes user_locale |
| Messy ownership between two features | resolveLocale() takes both as ordered inputs |

`resolveLocale(preferences[])` already accepts an ordered list — adding a second cookie input requires no structural change to OPH-98.

### Permission Summary

| Action | Role | Endpoint |
|---|---|---|
| Read `preferred_locale` | Any authenticated user | Via tenant record in layout |
| Write (tenant settings) | `tenant_admin` | `PATCH /api/settings/language` |
| Write (admin panel) | `platform_admin` | `PATCH /api/admin/tenants/[id]` |
| DB write guard | Service role via RLS | Supabase RLS policy on `tenants` |

### Dependencies
No new packages — everything comes from OPH-98.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
