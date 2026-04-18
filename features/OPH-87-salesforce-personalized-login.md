# OPH-87: Salesforce App — Personalized Login Page

## Status: In Progress
**Created:** 2026-04-18
**Last Updated:** 2026-04-18
**PRD:** [Salesforce App PRD](../docs/AD-PRD.md)

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
_To be added by /qa_

## Deployment
_To be added by /deploy_
