# OPH-100: User-Level Language Override

## Status: In Review
**Created:** 2026-05-07
**Last Updated:** 2026-05-08

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

**QA Engineer:** Claude (QA skill)
**Tested on:** 2026-05-08 (re-test against current working tree)
**Implementation commit:** working tree changes on `main` (most recent commit `da70c1d` is the design; the implementation is uncommitted but feature-complete in the workspace).
**Test method:** Static code review + TypeScript compile. Browser/HTTP testing not possible from the QA agent environment; all browser/responsive/cross-browser checks below are flagged as "code-level review only".

> **Note:** This re-test supersedes a prior pass that flagged BUG-1 (hard-coded German strings) and BUG-2 (missing translation keys) as blockers. Both have been resolved in the current working tree:
> - `src/components/user-language-settings.tsx` now uses `useTranslations("settings.userLanguage")` and `useTranslations("common")` for every label, button, helper, and toast.
> - `messages/de.json` and `messages/en.json` both contain a complete `settings.userLanguage` namespace (title, description, selectLabel, selectAriaLabel, notSetOption, optionGerman, optionEnglish, helper, loadError, loadConnectionError, saveSuccess, saveError, saveConnectionError) and the shared `common.tryAgain` / `common.save` keys are present.
>
> The two High-severity blockers from the prior pass are CLOSED.

### Acceptance Criteria

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Selector with options Deutsch / English / "Unternehmenseinstellung verwenden" on profile page | PASS | `user-language-settings.tsx:158-162` renders all three options. `NOT_SET_VALUE` represents the company-default fallback. |
| 2 | Saving persists to `user_profiles.preferred_locale`; nullable | PASS | Migration `051_oph100_user_preferred_locale.sql` adds nullable `text` column with idempotent CHECK constraint (`preferred_locale IS NULL OR preferred_locale IN ('de','en')`). PATCH endpoint persists via service-role client and returns the stored value. |
| 3 | UI language switches immediately on next navigation / soft refresh | PASS (code) | PATCH writes the `user_locale` cookie scoped to `.ids.online` in production (`route.ts:217-233`). `request.ts` reads `userCookie` first in the locale chain. **Caveat:** the change is *not* reflected on the current page until next navigation — the success toast text ("beim nächsten Seitenwechsel aktiv") matches that. Same UX as OPH-99. |
| 4 | NULL falls back through tenant → system default `de` | PASS | `request.ts:62-68` resolveLocale chain: `userCookie → tenantCookie → Accept-Language → defaultLocale("de")`. `isLocale()` rejects bogus values so an unknown cookie value falls through. |
| 5 | Read server-side every request; no client flash | PASS | Middleware syncs the cookie from DB on every authenticated page request (`middleware.ts:328-368`). `request.ts` reads the cookie server-side before render. |
| 6 | RLS: users can only read/write their own `preferred_locale` | PASS | Migration relies on the existing `Users can update own profile` policy (`id = auth.uid()`), correct for any client hitting RLS. The API endpoint itself uses `createAdminClient()` (service-role) but hard-keys the update to `user.id` from the validated JWT (`route.ts:173-177`), so a client cannot redirect the write to another user's row. RLS itself is intact. |
| 7 | Selector renders in user's currently active locale | PASS | `user-language-settings.tsx:48-49` calls `useTranslations()`. Strings come from `messages/{de|en}.json#settings.userLanguage` and `messages/{de|en}.json#common`. Verified both bundles contain the full key set. The card therefore renders in whichever locale `request.ts` resolved for the current request. |
| 8 | Sales reps can also set their preference from the SF profile page | PASS | `salesforce-profile.tsx:7,64` mounts `<UserLanguageSettings />`. Cookie domain in production is `.ids.online` so the preference carries to SF subdomains. |

### Edge Cases

| Edge Case | Result | Notes |
|-----------|--------|-------|
| User pref `"en"` and tenant `"en"` — both resolve to `"en"` | PASS | `resolveLocale()` stops at the first valid value. |
| User pref `"de"` and tenant `"en"` — user wins | PASS | `userCookie` precedes `tenantCookie` in the chain. |
| User profile row missing on first login | PASS (with caveat — see BUG-1) | GET treats missing row as null (`maybeSingle()` + `?? null`). PATCH returns 404 with a clear retry message, but the row is created by the `handle_new_user` trigger before the user can navigate to settings, so this is mostly theoretical. |
| Trial-tenant single-owner | PASS (code) | No role gating beyond `active` status; trial tenants are not blocked. Not browser-tested. |
| Form does not clobber other profile fields | PASS | PATCH sends `update({ preferred_locale })` only — display name / role / etc. are untouched. |
| Survives password reset / re-login | PASS | Stored in DB column, not session. Middleware re-syncs the cookie from DB on next page load. |
| Switch from "en" back to "Unternehmenseinstellung verwenden" (null) | PASS | PATCH with `preferred_locale: null` clears the `user_locale` cookie via `tenantLocaleClearOptions(host)`; tenant default takes over on the next request. |
| Selector displays the company-default option in the active locale | PASS | The "Unternehmenseinstellung verwenden" / "Use company setting" string lives in both bundles under `settings.userLanguage.notSetOption`. |
| Translation key missing in `en.json` falls back to `de.json` | PASS | `request.ts:33-56` deep-merges the German bundle as the base. Verified by inspection of the merge function. |
| Save button disabled when nothing has changed | PASS | `hasChanges = selectedLocale !== savedLocale` and `disabled={!hasChanges || isSaving}` (`user-language-settings.tsx:111,172`). |

### Bugs Found

#### BUG-1 — Low — First-login race: PATCH may return 404 if `handle_new_user` trigger has not yet inserted the profile row
**Steps to reproduce:**
1. Accept an invite. Before `handle_new_user` finishes (within the same transaction in practice), navigate immediately to `/settings/profile`.
2. GET succeeds (returns `preferred_locale: null`). PATCH returns 404 with "Profil noch nicht initialisiert".

**Actual:** The user sees a confusing toast error in the rare case the row is missing.
**Expected:** Either upsert the row, or hide the form until the profile exists.
**Severity:** Low (theoretical race; trigger fires inside the same transaction as the auth user insert).
**Files:** `src/app/api/settings/user-language/route.ts:191-202`.

#### BUG-2 — Low — Status check uses denylist instead of allowlist
**Issue:** Both GET and PATCH only block `tenant_status === "inactive"`. If a future status value is introduced (e.g., `"suspended"`, `"frozen"`), it would be silently allowed.
**Severity:** Low — defense-in-depth, not a current vulnerability. Pre-existing pattern shared with `/api/settings/language` and other tenant settings endpoints.
**Files:** `src/app/api/settings/user-language/route.ts:53-65, 126-138`.
**Fix direction:** Use `if (tenant_status !== "active" && tenant_status !== "trial")` for an explicit allowlist.

#### BUG-3 — Low — Card always issues a client-side GET even though middleware has already loaded the value
**Issue:** `<UserLanguageSettings />` always shows skeleton placeholders for one network roundtrip on mount, even though the same row was already read by the middleware on this page request. Passing the resolved locale as a server prop would remove the flicker.
**Severity:** Low — UX nit. Same pattern in OPH-99's `TenantLanguageSettings`.
**Files:** `src/components/user-language-settings.tsx:58-81`, `src/app/(protected)/settings/profile/page.tsx`, `src/app/sf/[slug]/profile/page.tsx`.

#### BUG-4 — Informational — "Konto deaktiviert" / "Mandant deaktiviert" responses leak account status
**Issue:** Returning a precise error message via an authenticated GET when the account is inactive is a tiny information disclosure if the session cookie is captured/replayed. The middleware normally signs deactivated users out before they reach the route, so this is mostly a defense-in-depth concern.
**Severity:** Informational. Pre-existing pattern shared with other settings endpoints; not a regression.
**Files:** `src/app/api/settings/user-language/route.ts:53-65, 126-138`.

#### BUG-5 — Informational — Endpoint does not verify Origin/Referer (CSRF)
**Issue:** A logged-in user clicking a malicious link could be tricked into changing their own UI language. There is no privilege escalation and no data leak; the worst case is annoyance.
**Severity:** Informational. Acceptable under current platform conventions (Supabase auth cookie is `SameSite: lax`).
**Files:** `src/app/api/settings/user-language/route.ts:106-243`.

### Security Audit (Red Team)

| Check | Result | Notes |
|-------|--------|-------|
| Auth bypass — unauthenticated PATCH | PASS | Returns 401 before reaching the DB. |
| Inter-user authorization — User A writes User B's preference | PASS | Update is hard-keyed to `eq("id", user.id)` from the validated JWT (`route.ts:173-177`). The request body has no user ID field; spoofing JSON cannot redirect the write. |
| RLS bypass via service-role client | PASS-with-caveat | The route uses `createAdminClient()` which bypasses RLS, but the `WHERE id = user.id` clause makes it safe. RLS itself remains intact for other clients. **Make sure no future refactor removes the `eq` clause** — a unit test would be cheap insurance. |
| Input injection — `preferred_locale: "<script>"` / `"';DROP..."` | PASS | Zod schema enforces `z.enum(["de","en"]).nullable()`. Anything else → 400. DB CHECK constraint is a second layer. Supabase parameterises queries. |
| Cookie tampering — manually set `user_locale=fr` | PASS | `request.ts` `resolveLocale()` walks the chain and `isLocale()` rejects unknown codes. Falls through to the next layer. |
| Server-side cookie tampering of a *different* user's preference | PASS | The cookie is read per-session; a tampered `user_locale` cookie only affects the attacker's own browser. The middleware sync block writes the value back from the DB on the next authenticated request, so manual tampering is self-correcting. |
| CSRF — PATCH without origin check | INFORMATIONAL — see BUG-5 | No security impact; only nuisance. |
| Rate limiting | PASS | `checkAdminRateLimit(user.id)` allows 60 req/min/user (`route.ts:141-146`). |
| Information disclosure | See BUG-4 | Same defense-in-depth concern as other settings endpoints. |
| Cross-tenant write attempt | PASS | The PATCH does not accept a tenant ID; the row is hard-keyed to `user.id`. The column is per-user, not tenant-scoped. |
| `Host` header smuggling for cookie domain | PASS-in-practice | `localeCookieDomain(host)` only returns `.ids.online` when the host ends with that domain. A spoofed `Host: evil.ids.online` would require controlling an upstream proxy; Vercel sanitises the `Host` header. Not exploitable in practice. |
| SQL injection | PASS | Supabase client + Zod enum + DB CHECK constraint. Three layers. |
| Cookie security flags | PASS | `sameSite: lax`, `secure: production`, `path: /`, `httpOnly: false` (required for `next-intl` server-side reads of the cookie value — value is constrained to the locale enum so non-httpOnly is acceptable). |
| Mass assignment | PASS | Update payload is literally `{ preferred_locale }`; no spread of the request body. |

### Regression Testing

| Feature | Result | Notes |
|---------|--------|-------|
| OPH-99 (Tenant Language Preference) | PASS — code-level | Middleware tenant block (lines 282-326) is unchanged. New user-locale block (lines 328-368) runs after and never interferes. Cookie precedence in `request.ts` already prioritises user > tenant. |
| OPH-98 (i18n Infrastructure) | PASS — code-level | `request.ts:62-68` was wired to read `user_locale` first from the start; OPH-100 just populates that cookie. The deep-merge fallback to German for missing keys still works. |
| OPH-1 (Auth) — `user_profiles` table | PASS | Migration `051` is additive. Existing INSERT/UPDATE policies cover the new column. No new policies required. |
| OPH-87 / OPH-88 / OPH-91 (Salesforce App) | PASS — code-level | SF profile page (`salesforce-profile.tsx:64`) renders the same `<UserLanguageSettings />` component. Subdomain cookie scoping (`.ids.online`) verified in `locale-cookie.ts:26-31`. |
| OPH-51 (Tenant Logo), OPH-52 (Billing model) | PASS | The tenant settings page now mounts three independent cards: TenantLogoUpload, TenantLanguageSettings, UserLanguageSettings. Each fetches its own data; no shared state collisions. |
| Profile page renders for non-tenant_admin users | PASS | The access-denied branch (`profile/page.tsx:138-179`) now also includes `<UserLanguageSettings />`, ensuring tenant_users without admin rights can still set their personal language. |
| OPH-96 (Order Review Locking) | NOT TESTED | Unrelated. |
| OPH-49 (Dealer-Linked Kundenstamm) | NOT TESTED | Unrelated. |

### Cross-Browser & Responsive

NOT TESTED in a browser. The component uses only shadcn/ui primitives (`Card`, `Select`, `Button`, `Skeleton`, `Alert`, `Label`) which are known-good across Chrome/Firefox/Safari and breakpoints 375/768/1440. No custom CSS introduced. **Recommendation:** smoke test in Chrome desktop + Safari mobile before deploy.

### Build & Type Check

- `npx tsc --noEmit` → PASS (no errors).
- `npm run lint` → not runnable from this environment (Next.js CLI quirk treats `lint` as a directory; ESLint v9 missing `eslint.config.js`). Not a regression of this PR.
- Build verification not performed.

### Summary

- Acceptance criteria: **8 PASS / 0 FAIL** (8 total).
- Bugs found:
  - Critical: 0
  - High: 0
  - Medium: 0
  - Low: 3 (BUG-1, BUG-2, BUG-3)
  - Informational: 2 (BUG-4, BUG-5)
- Security audit: no critical or high findings.

### Production-Ready Decision

**READY for production** (pending manual browser smoke test).

All eight acceptance criteria pass. The previously-blocking BUG-1 / BUG-2 (hard-coded German strings) have been fully resolved — the component now uses `useTranslations`, both translation bundles contain the complete `settings.userLanguage` namespace, and the language card therefore renders in the user's currently active locale.

The remaining items are all Low severity or informational and pre-exist in OPH-99's tenant card; they are acceptable to defer to a follow-up hardening pass.

### Recommended Fix Priority (post-deploy follow-ups)

1. **BUG-3** — pass server-fetched locale as a prop to remove loading flicker (UX).
2. **BUG-1** — upsert in PATCH or hide form until profile exists (defensive against trigger race).
3. **BUG-2** — switch to allowlist for tenant status checks (defense-in-depth).
4. **BUG-4 / BUG-5** — informational; revisit during a platform-wide settings-endpoint hardening pass.

### Manual Browser Smoke Test Checklist (recommended pre-deploy)

- [ ] As a tenant user with tenant default `"de"`, set personal preference to `"en"`. Click any nav link. UI is English on the next page.
- [ ] Reset back to "Unternehmenseinstellung verwenden". Next nav. UI returns to German.
- [ ] As a sales rep on `<slug>.ids.online/sf/<slug>/profile`, set preference to `"en"`. Order history page renders in English on next nav.
- [ ] Open DevTools → Application → Cookies. Confirm `user_locale` is set with `Domain=.ids.online` (production) or no domain (localhost).
- [ ] After clearing the preference, confirm the `user_locale` cookie is removed.
- [ ] Test responsive: 375px / 768px / 1440px. The card is `max-w-lg` so it should stack cleanly on mobile.

## Deployment
_To be added by /deploy_
