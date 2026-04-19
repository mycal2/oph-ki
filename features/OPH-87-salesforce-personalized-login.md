# OPH-87: Salesforce App — Personalized Login Page

## Status: In Progress
**Created:** 2026-04-18
**Last Updated:** 2026-04-18
**PRD:** [Salesforce App PRD](../docs/salesforce-prd.md)

## Dependencies
- OPH-72 (SF-1): Subdomain routing — the login page lives at `{slug}.ids.online/login`
- OPH-75 (SF-4): Magic Link Authentication — the login form and OTP flow
- OPH-51: Tenant Company Logo — `logo_url` already stored on `tenants`

## User Stories
- As a sales rep returning to my tenant's login page, I want to be greeted by name ("Hallo Max Muster, willkommen bei der Meisinger Bestellplattform") so that the experience feels personal and confirms I am on my own tenant's portal.
- As a sales rep visiting the login page for the first time, I want to see the tenant's logo prominently at the top so that I immediately know I am in the right place.
- As a sales rep who has previously logged in, I want my name to appear on the login page even after I have been logged out so that I feel recognised when I return.
- As a sales rep, I want to see the magic link email form below the greeting so that I can log in in one step.

## Acceptance Criteria
- [ ] The tenant's logo is displayed prominently at the top of the login card when `logo_url` is set on the tenant record.
- [ ] When no tenant logo is set, the tenant name is shown as a text heading (current fallback behaviour).
- [ ] After a sales rep successfully authenticates via magic link, a cookie `sf_user` is written on their browser containing their `first_name` and `last_name` from `user_profiles`.
- [ ] The cookie `sf_user` is **not** `httpOnly` so that the client-side login form can read it on the next visit.
- [ ] The cookie has a 30-day `maxAge` and `SameSite=Lax` so it persists across sessions.
- [ ] When `sf_user` cookie is present on the login page, the heading reads:  
      **"Hallo [Vorname Nachname], willkommen bei der [Tenant Name] Bestellplattform."**
- [ ] When `sf_user` cookie is absent (first visit or cookie expired), the heading reads:  
      **"Willkommen bei [Tenant Name]."**
- [ ] The magic link email form and submit button are shown in all cases (personalized or generic greeting).
- [ ] The cookie stores only first name and last name (no user ID, email, or other PII) — minimised data.
- [ ] The personalized greeting is rendered client-side (reading the cookie in `SalesforceLoginForm`) so it does not require a server round-trip on the login page.

## Edge Cases
- Sales rep has no `first_name` or `last_name` in `user_profiles`: cookie is not written; generic greeting is shown.
- Tenant has no logo: heading shows tenant name as text; all other personalization logic is unchanged.
- Cookie is malformed or unreadable: fall back to generic greeting silently (no error).
- Sales rep on a different tenant's subdomain: cookies are scoped to the subdomain, so the `sf_user` cookie from `meisinger.ids.online` is not readable on `other.ids.online`.
- `sf_user` cookie exists but the sales rep changed their name: the stale name is shown until they log in again and the cookie is refreshed.

---

## Tech Design (Solution Architect)

### Overview
Three focused changes: (1) the auth callback writes the cookie after a successful magic-link login, (2) the login page server component fetches and passes `logo_url`, and (3) the login form client component reads the cookie and shows the personalized greeting.

No new routes, no database changes, no new packages.

### Component Changes

```
SalesforceLoginPage (server component)
  ├── fetch tenant: id, name, salesforce_enabled, salesforce_slug, logo_url   ← ADD logo_url
  └── SalesforceLoginForm
        ├── props: tenantName, slug, logoUrl (new)
        ├── cookie read: document.cookie → sf_user → { firstName, lastName }
        ├── personalized heading when cookie found
        ├── tenant logo (img tag, max height 80px) when logoUrl set
        └── email input + magic link button (unchanged)

Auth Callback Route (/sf/[slug]/auth/callback/route.ts)
  └── after exchangeCodeForSession succeeds:
        ├── getUser() to get user ID
        ├── query user_profiles for first_name, last_name
        ├── if both present: set cookie sf_user = JSON.stringify({ firstName, lastName })
        └── add Set-Cookie header to the redirect response
```

### Files

| File | Change |
|---|---|
| `src/app/sf/[slug]/login/page.tsx` | Add `logo_url` to tenant select, pass `logoUrl` prop to form |
| `src/components/salesforce/salesforce-login-form.tsx` | Accept `logoUrl` prop; read `sf_user` cookie on mount; show logo + personalized greeting |
| `src/app/sf/[slug]/auth/callback/route.ts` | After successful code exchange, fetch user profile and append `Set-Cookie: sf_user` to redirect response |

### Cookie Spec

| Attribute | Value |
|---|---|
| Name | `sf_user` |
| Value | `{"firstName":"Max","lastName":"Muster"}` (URL-encoded JSON) |
| `httpOnly` | **false** — must be readable by client-side JS |
| `SameSite` | `Lax` |
| `Secure` | `true` in production, `false` in development |
| `maxAge` | 2592000 (30 days) |
| `Path` | `/` |

Because the cookie lives on the tenant's own subdomain (e.g. `meisinger.ids.online`), it is naturally isolated per tenant — no slug prefix needed in the cookie name.

## QA Test Results

**Tested:** 2026-04-18
**Tester:** QA Engineer (AI)
**Method:** Code review + build verification (TypeScript check + production build)

### Acceptance Criteria Status

#### AC-1: Tenant logo displayed prominently when logo_url is set
- [x] `page.tsx` selects `logo_url` from tenants table and passes it as `logoUrl` prop
- [x] `salesforce-login-form.tsx` renders `<img>` tag with `h-20` (80px) and `max-w-[240px]` inside a centered flex container
- [x] `onError` fallback hides the image gracefully via `logoError` state
- **PASS**

#### AC-2: Tenant name shown as text heading when no logo
- [x] Logo rendering is conditional: `{logoUrl && !logoError && (...)}`
- [x] The `CardTitle` with greeting text always renders regardless of logo presence
- **PASS**

#### AC-3: sf_user cookie written after successful magic link auth
- [x] `auth/callback/route.ts` fetches `user_profiles` after `exchangeCodeForSession` succeeds
- [x] Cookie value is `encodeURIComponent(JSON.stringify({ firstName, lastName }))`
- [x] Cookie is appended to the redirect response via `response.headers.append("Set-Cookie", ...)`
- **PASS**

#### AC-4: Cookie is NOT httpOnly (client-side readable)
- [x] The `Set-Cookie` header string does NOT include `HttpOnly`
- [x] This allows `document.cookie` in the client component to read it
- **PASS**

#### AC-5: Cookie has 30-day maxAge and SameSite=Lax
- [x] `Max-Age=2592000` (30 days) is set
- [x] `SameSite=Lax` is set
- [x] `Secure` is conditional on `!isLocal` (production only)
- [x] `Path=/` is set
- **PASS**

#### AC-6: Personalized greeting when sf_user cookie is present
- [x] `readSfUserCookie()` parses the cookie on mount via `useEffect`
- [x] Greeting format: `"Hallo Max Muster, willkommen bei der [Tenant Name] Bestellplattform."` -- matches spec exactly
- **PASS**

#### AC-7: Generic greeting when sf_user cookie is absent
- [x] When `returningUser` is null, greeting is `"Willkommen bei [Tenant Name]."` -- matches spec exactly
- **PASS**

#### AC-8: Email form and submit button shown in all cases
- [x] The email input and "Magic Link senden" button are outside the greeting conditional
- [x] They render regardless of `returningUser` state
- **PASS**

#### AC-9: Cookie stores only first name and last name (minimised data)
- [x] Server-side: only `first_name` and `last_name` are selected from `user_profiles`
- [x] Cookie value contains only `{ firstName, lastName }` -- no user ID, email, or tenant info
- **PASS**

#### AC-10: Personalized greeting rendered client-side (no server round-trip)
- [x] `readSfUserCookie()` uses `document.cookie` (client-side API)
- [x] Called inside `useEffect` in the `"use client"` component
- [x] No server-side cookie reading or additional API call for the greeting
- **PASS**

### Edge Cases Status

#### EC-1: Sales rep has no first_name or last_name
- [x] Server-side: `if (profile?.first_name && profile?.last_name)` -- both must be truthy to write cookie
- [x] If either is null/empty, cookie is not written; generic greeting is shown
- **PASS**

#### EC-2: Tenant has no logo
- [x] `logoUrl` prop is `null` when `logo_url` is not set on tenant
- [x] Conditional rendering `{logoUrl && !logoError && (...)}` skips the logo entirely
- [x] Personalization logic is independent of logo presence
- **PASS**

#### EC-3: Cookie is malformed or unreadable
- [x] `readSfUserCookie()` is wrapped in try/catch that returns `null` on any error
- [x] `JSON.parse` failures, decoding errors, and missing fields all fall back silently
- [x] Additional type checks: `typeof parsed.firstName === "string"` prevents non-string values
- **PASS**

#### EC-4: Sales rep on a different tenant's subdomain
- [x] Cookie is set without a `Domain` attribute, so browser scopes it to the exact host
- [x] `meisinger.ids.online` cookies are NOT readable on `other.ids.online`
- **PASS**

#### EC-5: sf_user cookie persists after logout
- [x] Logout handler in `salesforce-header.tsx` does NOT clear `sf_user` cookie (correct per spec)
- [x] Cookie persists so returning user sees personalized greeting after logout
- **PASS**

### Security Audit Results

#### Authentication & Authorization
- [x] Cookie is not used for authentication -- only for UI personalization
- [x] Auth flow unchanged: still uses Supabase session tokens for actual authentication
- [x] Cookie tampering cannot bypass any access control

#### XSS via Cookie Injection
- [x] Cookie value is rendered as JSX text content (not `dangerouslySetInnerHTML`)
- [x] React auto-escapes HTML entities in text nodes, preventing script injection
- [x] Even if an attacker modifies `sf_user` cookie to contain `<script>`, it renders as harmless text
- **PASS**

#### Cookie Security Properties
- [x] `Secure` flag is set in production (prevents transmission over HTTP)
- [x] `SameSite=Lax` prevents CSRF-style cookie leakage
- [x] Cookie is scoped to subdomain (no `Domain` attribute = host-only cookie)
- [ ] **NOTE (Low):** Cookie is not `httpOnly` by design (required for client-side reading). This means client-side JavaScript (including any XSS payload) can read the user's first/last name. However, this is accepted per the spec since names are not sensitive secrets, and the alternative would require a server round-trip.

#### Data Minimisation (DSGVO)
- [x] Cookie stores only first name and last name -- no user ID, email, tenant ID, or session info
- [x] 30-day retention is reasonable for a personalization cookie
- **PASS**

#### Information Leakage
- [x] Cookie does not reveal internal IDs, email addresses, or tenant identifiers
- [x] Admin client is used for profile lookup (bypasses RLS), but this is in a server-side route after authenticated session exchange
- **PASS**

#### Rate Limiting
- [x] Auth callback is a one-time code exchange (Supabase handles rate limiting on the magic link flow)
- [x] No new API endpoints introduced
- **PASS**

#### Cookie Value Size
- [x] The cookie stores only a short JSON with first/last name -- well within browser cookie size limits
- **PASS**

### Build Verification
- [x] TypeScript type check (`tsc --noEmit`): No errors
- [x] Production build (`npm run build`): Successful, all routes compile

### Bugs Found

#### BUG-1: Cookie not refreshed when user profile name changes without full re-auth
- **Severity:** Low
- **Description:** If a sales rep's name is updated in `user_profiles` by an admin, the `sf_user` cookie retains the old name until the sales rep logs in again via magic link. This is documented as an accepted edge case in the spec ("the stale name is shown until they log in again and the cookie is refreshed"), but there is no mechanism to force-refresh the cookie on a subsequent authenticated page visit.
- **Impact:** Cosmetic only -- stale name in greeting, no functional impact
- **Priority:** Nice to have (no action needed per spec)

#### BUG-2: Local development cookie isolation not tenant-scoped
- **Severity:** Low
- **Description:** In local development (`localhost:3003`), all tenant Salesforce apps share the same host, so the `sf_user` cookie set by one tenant's login is readable on another tenant's login page. This causes the wrong name to appear in the greeting when switching between tenants locally. In production, subdomains naturally isolate cookies per tenant.
- **Impact:** Development-only. No production impact.
- **Priority:** Nice to have

### Regression Check
- [x] OPH-75 (Magic Link Auth): Auth callback still redirects correctly after code exchange -- the redirect logic was refactored to build the URL first, then append the cookie, then return the response. The redirect destinations are unchanged.
- [x] OPH-72 (Subdomain Routing): No changes to middleware. Login page still resolves tenant correctly.
- [x] OPH-51 (Tenant Logo): `logo_url` was already on the tenants table; the login page now reads it too. No schema changes.
- [x] OPH-84 (Domain Validation): Magic link API route unchanged.
- [x] OPH-85 (Header User Identity): Header component and layout unchanged.
- [x] OPH-86 (Profile Page): Profile page unchanged.
- [x] Login page still shows error messages from URL params (auth_callback_failed, wrong_tenant, etc.)

### Summary
- **Acceptance Criteria:** 10/10 passed
- **Edge Cases:** 5/5 passed
- **Bugs Found:** 2 total (0 critical, 0 high, 0 medium, 2 low)
- **Security:** Pass -- no vulnerabilities found. Cookie is data-minimised and XSS-safe.
- **Build:** Pass -- TypeScript and production build both succeed
- **Production Ready:** YES
- **Recommendation:** Deploy. Both low-severity findings are documented/accepted edge cases with no functional or security impact.

## Deployment
_To be added by /deploy_
