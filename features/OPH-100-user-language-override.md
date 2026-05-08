# OPH-100: User-Level Language Override

## Status: Planned
**Created:** 2026-05-07
**Last Updated:** 2026-05-07

## Dependencies
- Requires: OPH-98 (i18n Infrastructure)
- Requires: OPH-99 (Tenant-Level Language Preference) — user override only makes sense once the tenant default exists.

## Overview
Any authenticated user can override the tenant-level language preference with their own personal choice. The override is stored on the user's profile and takes priority over the tenant default. Users set this in their own profile / account settings page.

## User Stories
- As a user, I want to switch the UI to English even if my company's default is German so that I can work in my preferred language.
- As a user, I want my language choice to persist across sessions so that I don't have to re-select it every time I log in.
- As a user, I want to reset my personal language preference back to "use my company's default" so that I don't have to track what my company's setting is.
- As a multilingual user, I want the language change to take effect immediately after I save it so that I don't have to reload the page manually.

## Acceptance Criteria
- [ ] User profile / account settings page shows a "Sprache / Language" selector with options: Deutsch (de), English (en), and "Unternehmenseinstellung verwenden" (use company default).
- [ ] Saving the preference persists it to the user's profile record (e.g., `user_profiles.preferred_locale`; nullable — null means "use tenant default").
- [ ] After saving, the UI language switches to the selected locale immediately (next navigation or soft refresh of the current page).
- [ ] When `preferred_locale` is null (or "company default" selected), the locale resolution falls back to the tenant setting (OPH-99), then system default `de`.
- [ ] The user's locale preference is read server-side on every request so it applies to server-rendered pages without client-side flash.
- [ ] RLS ensures users can only read and write their own `preferred_locale`.
- [ ] The language selector itself renders in the user's current active locale.
- [ ] Sales reps (Salesforce App users) can also set their language preference from their profile page.

## Edge Cases
- User sets preference to `"en"`, their tenant later changes to `"en"` too — no conflict, both resolve to `"en"`.
- User sets preference to `"de"`, their tenant is `"en"` — user sees `"de"` (user preference wins).
- User profile record does not exist yet (first login edge case) — treat missing record as null (use tenant default).
- User on a trial tenant (no team members beyond the owner) — the owner should still be able to set their personal language.
- The profile settings form must not clobber other profile fields (display name, etc.) when saving only the language preference.
- Language preference must survive a password reset / re-login (stored in DB, not in session cookie).

## Technical Requirements
- Database migration: `ALTER TABLE user_profiles ADD COLUMN preferred_locale TEXT CHECK (preferred_locale IN ('de', 'en'))` (nullable).
- Locale resolution priority (implemented in OPH-98 utility): user `preferred_locale` → tenant `preferred_locale` → `"de"`.
- The resolved locale is available server-side via the existing user-profile fetch that authenticated layouts already perform.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
