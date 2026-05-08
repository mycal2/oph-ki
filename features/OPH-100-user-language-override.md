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

### What's already done (no changes needed)
- `USER_LOCALE_COOKIE_NAME = "user_locale"` declared in `src/i18n/routing.ts`
- `src/i18n/request.ts` reads `user_locale` cookie first, before `tenant_locale` — locale resolution priority is already wired
- `src/lib/i18n/locale-cookie.ts` helper is reusable for the user cookie (same domain scoping)

### Component Structure

```
/settings/profile (existing page)
  +-- TenantLogoUpload (existing)
  +-- TenantLanguageSettings (existing — tenant default, admin-only edit)
  +-- UserLanguageSettings  ← NEW: personal override, all users

/sf/[slug]/profile (existing SF profile page)
  +-- UserLanguageSettings  ← same component reused
```

`UserLanguageSettings` is a new component (`src/components/user-language-settings.tsx`), parallel to `TenantLanguageSettings`. No `canEdit` prop — every user edits their own language.

Selector options:
1. **Deutsch (German)** → `"de"`
2. **English (English)** → `"en"`
3. **Unternehmenseinstellung verwenden** → `null` (follow company default)

### Data Model

```
user_profiles table (existing)
  + preferred_locale  TEXT NULL
                      CHECK (preferred_locale IN ('de', 'en'))
```

NULL means "use company default" — falls back to tenant → system default "de".

### New API Endpoint

`GET/PATCH /api/settings/user-language`
- Same pattern as OPH-99's `/api/settings/language`
- No role check — every authenticated, active user may update their own row
- PATCH writes only `preferred_locale` (other profile fields untouched)
- On success: sets or clears the `user_locale` cookie on the response using `locale-cookie.ts`

### Middleware Change

Add a user sync block in `src/lib/supabase/middleware.ts` after the OPH-99 tenant sync block (~line 325):
- Read `user_profiles.preferred_locale` for the authenticated user ID on every authenticated page request
- If set → write/refresh `user_locale` cookie (only when value differs)
- If null and cookie exists → clear the stale `user_locale` cookie
- Errors are caught and logged; they never block the request

Cost: one extra indexed PK lookup on `user_profiles.id` per authenticated page request.

### Cookie Propagation Flow

```
User clicks Save in UserLanguageSettings
  → PATCH /api/settings/user-language
    → DB: user_profiles SET preferred_locale = 'en'
    → Response: Set-Cookie: user_locale=en; Domain=.ids.online
  → Next page navigation:
    → middleware syncs user_locale cookie from DB
    → request.ts reads user_locale cookie first → locale = "en"
```

### New Files

| File | Purpose |
|---|---|
| `supabase/migrations/051_oph100_user_preferred_locale.sql` | `ALTER TABLE user_profiles ADD COLUMN preferred_locale` with idempotent CHECK constraint |
| `src/components/user-language-settings.tsx` | Language card UI, parallel to `tenant-language-settings.tsx` |
| `src/app/api/settings/user-language/route.ts` | GET/PATCH endpoint |

### Modified Files

| File | Change |
|---|---|
| `src/lib/types.ts` | Add `preferred_locale: "de" \| "en" \| null` to `UserProfile` |
| `src/lib/validations.ts` | Add `userLanguageSchema` |
| `src/lib/supabase/middleware.ts` | Add user_locale sync block after tenant sync block |
| `src/app/(protected)/settings/profile/page.tsx` | Mount `<UserLanguageSettings />` |
| `src/app/sf/[slug]/profile/page.tsx` | Mount `<UserLanguageSettings />` |

### RLS

`user_profiles` already has RLS. The new `preferred_locale` column inherits the existing policy — no new policies needed.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
