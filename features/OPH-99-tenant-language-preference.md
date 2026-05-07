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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
