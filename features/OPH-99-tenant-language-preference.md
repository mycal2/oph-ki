# OPH-99: Tenant-Level Language Preference

## Status: In Progress
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

**QA Date:** 2026-05-07
**Tested By:** /qa skill
**Test Method:** Static code review + tooling (TypeScript typecheck). Browser/HTTP probing was blocked by the sandbox; live UI verification is still required before deploy.
**Build Status:** `npx tsc --noEmit` clean. `npm run lint` not runnable in this environment due to the `next lint` shim treating arguments as a directory; not a regression of this feature.

### Acceptance Criteria

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | `tenants.preferred_locale` column exists, nullable, values "de"/"en" | Pass | `supabase/migrations/050_oph99_tenant_preferred_locale.sql` adds the column with a CHECK constraint (`preferred_locale IS NULL OR preferred_locale IN ('de','en')`). Idempotent (`ADD COLUMN IF NOT EXISTS`). |
| 2 | Tenant settings page shows "Sprache / Language" selector with Deutsch / English options | Pass | `src/components/tenant-language-settings.tsx` (line 51-54) defines both options; rendered with native + English form ("Deutsch (German)", "English (English)"). Mounted on `/settings/profile` via `src/app/(protected)/settings/profile/page.tsx`. |
| 3 | Saving the preference persists to `tenants.preferred_locale` | Pass | `PATCH /api/settings/language` updates the column via service-role client (`src/app/api/settings/language/route.ts` lines 181-188). |
| 4 | Admin Tenant Detail page shows + allows editing the language preference | Pass | `src/components/admin/tenant-profile-form.tsx` lines 715-756 add a "Sprache / Language" card with the same selector. Saved via existing `PATCH /api/admin/tenants/[id]`. |
| 5 | Tenant user with no personal preference sees the tenant's `preferred_locale` | Pass | `src/lib/supabase/middleware.ts` reads `tenants.preferred_locale` per request and writes it to the `tenant_locale` cookie. `src/i18n/request.ts` resolves: `user_locale` → `tenant_locale` → `Accept-Language` → `defaultLocale`. |
| 6 | Null `preferred_locale` falls back to system default ("de") | Pass | Middleware (line 311 `if (isLocale(stored))`) only sets the cookie when a value is configured; missing cookie → `resolveLocale` returns `defaultLocale = "de"`. |
| 7 | Language change takes effect on next page navigation (no hard reload) | Partial / BUG-1 | Works for the admin who triggered the change (the API writes the cookie on the response). For OTHER users of the same tenant the change can take up to 24 hours due to a cookie-cache short-circuit in the middleware. See BUG-1 below. |
| 8 | Selector shows native language names | Pass | Tenant settings card: "Deutsch (German)", "English (English)". Admin form: identical labels. |
| 9 | RLS prevents non-admins from writing `preferred_locale` | Pass | The existing `tenants` table RLS policy from migration 001 (`Platform admins can update tenants`) already restricts UPDATE to platform_admin. The new `/api/settings/language` endpoint goes through the service-role client and enforces the role check (`tenant_admin` OR `platform_admin`) at the handler level. The admin tenant PATCH route is gated by `requirePlatformAdmin` (excludes `platform_viewer`). |

**Acceptance Criteria Summary:** 8 of 9 fully pass, 1 partial. The partial result is treated as Bug-1 (High).

### Edge Cases Tested

| Edge Case | Result | Notes |
|-----------|--------|-------|
| User personal pref overrides tenant pref | Pass (by design) | Resolution order in `request.ts` line 68 places `userCookie` before `tenantCookie`. Functionality formally tested under OPH-100. |
| `preferred_locale` is null after migration → behaves as "de" | Pass | No default set; middleware skips cookie set for null; `resolveLocale` falls back to `defaultLocale`. |
| Platform admin changes a tenant's language | Partial / BUG-1 | Change is persisted, but other users of that tenant only pick it up after their `tenant_locale` cookie expires (24h) — see BUG-1. The platform admin's own session does **not** receive the cookie because `PATCH /api/admin/tenants/[id]` does not write the `tenant_locale` cookie like `/api/settings/language` does. See BUG-2. |
| Settings page renders in current active locale | Pass | The page is server-rendered by the protected layout via `next-intl` after the cookie is resolved. |
| Invalid locale value sent in request body ("fr", null, empty, garbage JSON) | Pass | Zod schema rejects values outside `["de", "en", null]`. Malformed JSON → 400 with "Ungültiger Anfragetext.". |
| Method not allowed (DELETE/POST on `/api/settings/language`) | Pass | Next.js automatically returns 405 for handlers that aren't exported. |
| Tenant with `tenant_status = inactive` | Pass | Both GET and PATCH return 403 ("Ihr Mandant ist deaktiviert.") before performing any DB read. |
| User with `user_status = inactive` | Pass | Same defense-in-depth check returns 403 in both handlers. |
| Unauthenticated request | Pass | Both GET and PATCH return 401. |
| Sales rep (`role = sales_rep`) calling PATCH | Pass | Returns 403 ("Nur Administratoren..."). |
| Tenant user (non-admin) calling PATCH | Pass | Returns 403. |
| Sales rep calling GET | Pass | Allowed (read of own tenant locale). Salesforce App locale is read by the same `/sf/[slug]/layout` indirection through next-intl. Confirmed only via static review. |
| Idempotent column add on re-run of migration 050 | Pass | `ADD COLUMN IF NOT EXISTS` keeps the migration safe. The CHECK constraint (`tenants_preferred_locale_check`) does **not** use `IF NOT EXISTS` syntactically, but Postgres's pre-flight `ADD CONSTRAINT` is non-idempotent — see BUG-4 (Low) below. |

### Security Audit (Red Team)

| Check | Result | Notes |
|-------|--------|-------|
| Authn bypass on PATCH | Pass | `supabase.auth.getUser()` is called and validated. |
| Authz bypass / horizontal privilege escalation | Pass | Update is hard-keyed to `appMetadata.tenant_id` from the JWT — caller cannot specify a different tenant on `/api/settings/language`. The admin route requires `platform_admin` and uses the URL `id`. No tenant-id leakage via response body. |
| Vertical privilege escalation (tenant_user → admin) | Pass | Role checked against `app_metadata.role`, which is set in the custom access token hook and not user-mutable. |
| RLS bypass via admin client | Information / acceptable | The settings endpoint uses the service-role admin client to bypass RLS, but enforces role/tenant checks at the application layer first. This is consistent with the pattern used by other tenant-scoped settings endpoints (`/api/settings/logo`, etc.). |
| SQL injection on `preferred_locale` | Pass | Input is constrained by Zod enum + Postgres CHECK constraint; parameterised by Supabase client. |
| XSS / HTML injection via locale value | Pass | Values are constrained to `de`/`en`. The cookie is `httpOnly:false` (acceptable: required for `next-intl` server reads), but its value can never be attacker-controlled because of the enum constraint. |
| Cookie security: SameSite, Secure, Path | Pass | `sameSite: lax`, `secure: production`, `path: /`. `tenant_locale_tid` (the stamp) is `httpOnly:true`. |
| Rate limiting on PATCH | Minor / BUG-3 | `/api/settings/language` has no rate limiter. Admin tenant PATCH has `checkAdminRateLimit`. Low impact (small attack surface, write-heavy enum), but inconsistent with admin-side endpoint. |
| Sensitive data exposure | Pass | Response only echoes the locale; no PII. |
| CSRF | Pass (acceptable) | Handler is mutating but Supabase auth lives in cookies; same-site Lax + auth cookie is sufficient under current platform conventions (consistent with peer endpoints). |
| Session timeout / inactive accounts | Pass | Both handlers honour `tenant_status` and `user_status` checks before any DB write. |
| Admin client misuse | Pass | `createAdminClient()` is only used inside the handler and not exposed. |

### Regression Testing

Spot-checked code paths that interact with tenant updates and middleware:

| Feature | Result | Notes |
|---------|--------|-------|
| OPH-51 Tenant Logo | Pass | `src/app/(protected)/settings/profile/page.tsx` still renders the existing `TenantLogoUpload` and persists via `/api/settings/logo`. The new `TenantLanguageSettings` is mounted as an additional Card; no shared state. |
| OPH-52 Billing model | Pass | `tenant-profile-form.tsx` still validates billing fields independently. The new `preferred_locale` field is added to the same `UpdateTenantInput` payload — schema and submit handler updated correctly. |
| OPH-94 Excel sheet filter | Pass | Same form, side-by-side with the new language card; no field-name collision. |
| OPH-73 Salesforce role/feature flag | Pass | `salesforce_slug` uniqueness check preserved at lines 127-141 of `src/app/api/admin/tenants/[id]/route.ts`. |
| OPH-92 Platform Admin Tenant Switcher | Pass / Risk | The `tenant_locale_tid` (stamp) cookie compares against `appMetadata.tenant_id`. When a platform admin switches tenant context (via OPH-92) without re-issuing the JWT, the stamp will detect the tenant change and refresh — provided OPH-92 also rotates `tenant_id` in `app_metadata`. **Manual verification recommended in browser.** |
| OPH-98 i18n infrastructure | Pass | `request.ts` correctly threads `tenantCookie` through `resolveLocale`. Default locale fallback unchanged. The `LOCALE_COOKIE_NAME` deprecated alias still resolves to `TENANT_LOCALE_COOKIE_NAME`, preserving any code that imported it. |
| Existing middleware (auth, role enforcement, salesforce subdomains) | Pass | The new locale block runs **after** all auth/role checks (line 284 onwards) and **before** the SF rewrite at line 347. Cookies set on `supabaseResponse` are carried over by the existing rewrite handler. |

### Bugs Found

#### BUG-1 (High) – Tenant locale change is delayed up to 24 h for users other than the admin who made the change

**Severity:** High
**Spec impact:** Violates Acceptance Criterion #7 ("Language change takes effect on next page navigation (no hard reload required)") and the Edge Case ("A platform admin changes a tenant's language — the next page load for any user of that tenant should reflect the change since the locale is resolved server-side from the tenant record.").
**Location:** `src/lib/supabase/middleware.ts` lines 290-339.
**Steps to reproduce:**
1. Tenant admin (User A) and tenant user (User B) are both signed in.
2. The current tenant `preferred_locale` is `null`.
3. User B navigates the app — middleware detects no `tenant_locale` cookie, writes one (skipped because the value is null, but writes the `tenant_locale_tid` stamp).
4. User A changes the tenant language to "en" via `/settings/profile`. The PATCH endpoint writes the `tenant_locale=en` cookie on User A's session — User A now sees English.
5. User B navigates to a new page. Middleware sees `existingTenantLocale === undefined` (the stamp exists but the locale cookie does not), enters the refresh branch, reads `preferred_locale = "en"`, and sets the cookie. **In this specific case the change does propagate.**
6. **However**, repeat the scenario starting with `preferred_locale = "de"` so that User B has `tenant_locale=de` and `tenant_locale_tid=<tid>` cached. When User A flips the value to `en`, User B's next request hits the short-circuit (`existingTenantLocale === "de"` and `existingStamp === tenantId`), so the middleware skips the DB read and User B keeps seeing German for up to 24 hours (the cookie's `maxAge`).
7. Same problem when changing from `en` → `null` or `en` → `de`: cached cookie wins until expiry.

**Expected:** Other users of the tenant pick up the change on their next page navigation, as the spec explicitly states.
**Actual:** Up to 24 h propagation delay for users who already have a non-stale `tenant_locale` cookie.
**Recommendation (for /backend, not for QA to fix):** Either (a) shorten `TENANT_LOCALE_COOKIE_MAX_AGE` to a few minutes and accept the extra DB read, or (b) bump a versioned stamp (e.g. include `tenants.updated_at` epoch in the stamp) so a tenant-side update reliably invalidates other users' cached cookies, or (c) always read `tenants.preferred_locale` per request when the user has no `user_locale` cookie (acceptable cost: one tiny indexed PK lookup).

#### BUG-2 (Medium) – Platform admin's own session does not pick up a tenant-language change made via the Admin Tenant Detail page

**Severity:** Medium
**Location:** `src/app/api/admin/tenants/[id]/route.ts` PATCH handler (lines 60-174).
**Steps to reproduce:**
1. Platform admin opens `/admin/tenants/<id>` for tenant X (admin's own tenant_id is irrelevant for the page itself).
2. Sets language to English and saves — DB row updated.
3. Admin's `tenant_locale` cookie is **not** updated by this endpoint (unlike `/api/settings/language` which does set it).
4. If admin's own tenant_id matches the edited tenant, they continue seeing the previous language until the middleware refreshes the cookie (subject to BUG-1 caching).
**Expected:** Consistent UX with `/api/settings/language` — language change should take effect on the next navigation for the admin who saved it.
**Actual:** Inconsistent; admin must refresh after waiting for the cookie cache to clear.
**Recommendation:** When `input.preferred_locale !== undefined` and the edited tenant equals the caller's tenant, set the `tenant_locale` cookie on the response in the same way `/api/settings/language` does.

#### BUG-3 (Low) – No rate limit on `PATCH /api/settings/language`

**Severity:** Low
**Location:** `src/app/api/settings/language/route.ts` PATCH handler.
**Steps to reproduce:** Send 1000 PATCH requests with `{"preferred_locale":"en"}` in rapid succession as a tenant_admin. All succeed.
**Expected:** Some throttle similar to `checkAdminRateLimit` used on the admin tenant PATCH route.
**Actual:** No rate limit. Each request triggers a DB UPDATE.
**Recommendation:** Add a per-user rate limit (e.g. 30/min) consistent with other write endpoints. Low priority — the scope is constrained to the caller's own tenant and the schema.

#### BUG-4 (Low) – Re-running migration 050 will fail because the CHECK constraint add is not idempotent

**Severity:** Low
**Location:** `supabase/migrations/050_oph99_tenant_preferred_locale.sql` lines 11-14.
**Steps to reproduce:** Run the migration twice in a row.
**Expected:** Idempotent (consistent with `ADD COLUMN IF NOT EXISTS` already used in the migration).
**Actual:** First run creates the constraint; second run fails with `constraint "tenants_preferred_locale_check" already exists`. This breaks `supabase db reset` style flows in environments where migrations are re-applied.
**Recommendation:** Wrap in `DO $$ BEGIN IF NOT EXISTS (...) THEN ALTER TABLE ... ADD CONSTRAINT ... END IF; END $$;` or use `ALTER TABLE ... DROP CONSTRAINT IF EXISTS tenants_preferred_locale_check; ALTER TABLE ... ADD CONSTRAINT ...`.

#### BUG-5 (Low) – Identical text in both branches of the help-text ternary in `TenantLanguageSettings`

**Severity:** Low (UX/cosmetic)
**Location:** `src/components/tenant-language-settings.tsx` lines 184-187.
**Steps to reproduce:** View `/settings/profile` as a non-admin user. The help text reads "Nur Administratoren können diese Einstellung ändern." — same as for admins.
**Expected:** Different help text per role, e.g. for admins: "Sie können die Standard-Sprache des Mandanten ändern.".
**Actual:** Both branches return the same string, making the conditional pointless.
**Recommendation:** Either remove the conditional or differentiate the messages.

#### BUG-6 (Low) – Cookie scope: `tenant_locale` is missing the `Domain` attribute, so SF subdomain users may not pick up tenant-language changes initiated on the OPH host

**Severity:** Low (potentially Medium for sales-rep tenants)
**Location:** `src/lib/supabase/middleware.ts` lines 312-320 and `src/app/api/settings/language/route.ts` lines 212-220.
**Steps to reproduce:** A sales rep on `meisinger.ids.online` and a tenant admin on `oph-ki.ids.online` belong to the same tenant. Tenant admin changes the language. The `tenant_locale` cookie is host-scoped (no `Domain` attr → defaults to the request host), so the sales rep's subdomain session does not see the cookie set by the admin.
**Expected:** Either explicitly set `Domain=.ids.online` so the cookie is shared across tenant subdomains, or document that the SF App locale is independently resolved per subdomain via its own middleware pass (which it is — middleware runs per request, so the SF subdomain's middleware will refresh from `preferred_locale` on its next page nav, modulo BUG-1).
**Actual:** Acceptable in practice for users who eventually navigate within the SF host (the SF middleware pass writes its own cookie). Confirmed via code review at lines 290-339 (no host-specific gating). However, the BUG-1 caching applies here too.
**Recommendation:** Document the intent. If the goal is true cross-subdomain locale, set `Domain=.ids.online` (only in production) or add a small per-request DB lookup as suggested in BUG-1.

### Cross-Browser & Responsive Testing

Skipped (sandbox environment cannot drive a browser). The components used (`Card`, `Select`, `Button`, `Skeleton`, `Alert`, `Label` — all shadcn/ui primitives) are standard and have been validated in adjacent OPH features. **Manual smoke test on Chrome / Firefox / Safari at 375px / 768px / 1440px is recommended before deploy.**

### Production-Ready Decision

**NOT READY** — BUG-1 (High) violates the documented "next-navigation" SLA from Acceptance Criterion #7 and the Edge Case for platform-admin-driven changes. Fix BUG-1 (High) and BUG-2 (Medium) before release. BUG-3, BUG-4, BUG-5, BUG-6 (Low) are acceptable to defer but should be filed as follow-ups.

### Recommended Fix Order

1. BUG-1 (High) — invalidation strategy for `tenant_locale` cookie.
2. BUG-2 (Medium) — write `tenant_locale` cookie from admin tenant PATCH for self-tenant updates.
3. BUG-4 (Low) — idempotent migration.
4. BUG-3 (Low) — add rate limit.
5. BUG-5 (Low) — fix dead conditional in help text.
6. BUG-6 (Low) — document or fix cross-subdomain cookie scope.

## Deployment
_To be added by /deploy_
