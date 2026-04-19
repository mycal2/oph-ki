# OPH-75: Salesforce App — Magic Link Authentication (SF-4)

## Status: In Progress
**Created:** 2026-04-17
**Last Updated:** 2026-04-17
**PRD:** [Salesforce App PRD](../docs/SALESFORCE-PRD.md)

## Dependencies
- OPH-72 (SF-1): Subdomain Routing — login page lives under the Salesforce layout
- OPH-73 (SF-2): Sales Rep Role — auth must verify role and tenant match

## User Stories
- As a sales rep, I want to log in by entering my email and tapping a magic link so that I don't need to remember a password.
- As a sales rep, I want the login page to show my manufacturer's branding so that I know I'm on the right page.
- As a sales rep, I want to stay logged in on my phone so that I don't have to re-authenticate for every order.

## Acceptance Criteria
- [ ] The Salesforce App login page at `{slug}.ids.online` shows the tenant's logo, a welcome message, and an email input field.
- [ ] Sales rep enters email → system sends a magic link via Supabase Auth → sales rep taps link → logged in.
- [ ] After authentication, middleware verifies: (a) user has `sales_rep` role, (b) user's `tenant_id` matches the subdomain's tenant. Both must pass.
- [ ] If the email does not belong to a `sales_rep` user of this tenant, a generic "Zugang nicht möglich" message is shown (no information leakage about whether the email exists).
- [ ] The magic link redirects back to the same subdomain (`{slug}.ids.online`) after authentication, not to the OPH domain.
- [ ] Session persists across browser restarts (Supabase refresh token) so sales reps don't need to re-authenticate frequently.
- [ ] A "Abmelden" (logout) button is available in the Salesforce App header.

## Edge Cases
- Sales rep enters an email that exists in the system but belongs to a different tenant: generic rejection, no details revealed.
- Sales rep enters an email with `tenant_admin` role (not `sales_rep`): rejected at login.
- Magic link is opened on a different device than where the email was entered: should still work (Supabase handles this).
- Magic link expires (default Supabase expiry): show "Link abgelaufen, bitte erneut anfordern" message.
- Sales rep is deactivated between requesting the magic link and clicking it: login fails with "Zugang nicht möglich".

---

## Tech Design (Solution Architect)

### Overview
OPH-75 replaces the login placeholder with a real magic link flow. The user enters their email, Supabase sends a one-click login link pointing back to their subdomain (`{slug}.ids.online/auth/callback`), and after clicking the middleware-enforced security checks (OPH-73) handle the rest. No new security logic is needed — only a login form and an auth callback route.

---

### A) Component Structure

```
src/app/sf/[slug]/
  login/
    page.tsx                 ← MODIFY: Server component — queries tenant name, renders form
  auth/
    callback/
      route.ts               ← NEW: Exchanges code → session, redirects to subdomain home

src/components/salesforce/
  salesforce-login-form.tsx  ← NEW: Client component — email input + loading + success state
```

**Login Page (server component):**
```
+-------------------------------------------------------+
|  [IDS.online Logo]            [Tenant Logo]            |
+-------------------------------------------------------+
|                                                       |
|         Willkommen bei [Tenant Name]                  |
|                                                       |
|  [Email-Adresse ............................  ]        |
|  [          Magic Link senden          ]              |
|                                                       |
|  Wir senden Ihnen einen Anmelde-Link per E-Mail.      |
|                                                       |
+-------------------------------------------------------+
```
After sending: replaces the form with "E-Mail gesendet — prüfen Sie Ihren Posteingang."

---

### B) Auth Flow

```
1. meisinger.ids.online/         (not logged in)
   └── middleware → redirect → /login
   └── middleware rewrite  → /sf/meisinger/login

2. Sales rep enters email, taps "Magic Link senden"
   └── signInWithOtp({ email, redirectTo: "https://meisinger.ids.online/auth/callback?next=/" })
   └── Supabase sends email with magic link

3. Sales rep taps link
   └── meisinger.ids.online/auth/callback?code=xxx
   └── middleware: /auth/callback is already public → no auth block
   └── middleware rewrite → /sf/meisinger/auth/callback?code=xxx
   └── Callback route: exchangeCodeForSession(code) → session cookie set
   └── Redirect: https://meisinger.ids.online/

4. meisinger.ids.online/         (now logged in)
   └── middleware: role=sales_rep ✓, salesforce_slug=meisinger ✓
   └── middleware rewrite → /sf/meisinger/ → Salesforce home
```

---

### C) No Middleware Changes Needed

All security is already enforced by OPH-73:

| Check | Where |
|---|---|
| `/auth/callback` is a public route | `publicRoutes` in middleware |
| `sales_rep` role required on subdomain | Middleware OPH-73 |
| `salesforce_slug` must match subdomain | Middleware OPH-73 |
| Inactive user blocked | Middleware `user_status` check |
| Non-sales_rep on subdomain → OPH redirect | Middleware OPH-73 |

---

### D) Error States

| Situation | Behavior |
|---|---|
| Email not in system | "Prüfen Sie Ihren Posteingang" shown (Supabase sends nothing — no enumeration) |
| Wrong tenant / not sales_rep | Middleware redirects to login with `error=wrong_tenant` |
| Expired magic link | Callback fails → login with `error=auth_callback_failed` |
| Deactivated user | Middleware catches `user_status=inactive` → signs out → login error |

---

### E) Files Changed

| File | Change |
|---|---|
| `src/app/sf/[slug]/login/page.tsx` | MODIFY: Replace placeholder, render `SalesforceLoginForm` with tenant name |
| `src/app/sf/[slug]/auth/callback/route.ts` | NEW: Exchange code, redirect to `https://{slug}.ids.online/` |
| `src/components/salesforce/salesforce-login-form.tsx` | NEW: Client form with email input, loading, sent, and error states |

No database changes. No middleware changes. No new npm packages.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
