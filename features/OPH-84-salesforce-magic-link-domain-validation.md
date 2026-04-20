# OPH-84: Salesforce App — Magic Link Domain Validation

## Status: Planned
**Created:** 2026-04-18
**Last Updated:** 2026-04-18
**PRD:** [Salesforce App PRD](../docs/SALESFORCE-PRD.md)

## Dependencies
- OPH-75 (SF-4): Magic Link Authentication — the login form being secured
- OPH-17: Allowed Email Domains — the `tenants.allowed_email_domains` column and domain matching logic to be reused

## User Stories
- As a tenant admin, I want magic link requests on our Salesforce portal to be restricted to our company's email domain(s) so that only our sales reps can request login links.
- As a platform operator, I want unauthorized email addresses to be silently rejected so that attackers cannot probe which email addresses exist in the system.
- As a sales rep with a valid company email, I want the login to work exactly as before so that the security check is invisible to me.
- As a tenant admin, I want to reuse the same allowed domains I already configured in OPH-17 so that I only have to maintain one list.

## Acceptance Criteria
- [ ] When a magic link is requested for an email whose domain is NOT in the tenant's `allowed_email_domains`, the request is silently accepted on the client (showing the normal "E-Mail gesendet" message), but no OTP email is sent.
- [ ] When a magic link is requested for an email whose domain IS in the tenant's `allowed_email_domains`, the OTP is sent as normal.
- [ ] Domain validation happens server-side (not client-side), so it cannot be bypassed by a browser.
- [ ] The domain check uses the same `allowed_email_domains` field on the `tenants` table that OPH-17 configured, with the same case-insensitive matching logic.
- [ ] If a tenant has no `allowed_email_domains` configured (empty array), all email domains are allowed (fail-open to avoid locking out tenants who haven't configured domains yet).
- [ ] A new API route `POST /api/sf/[slug]/magic-link` handles the validation and OTP dispatch — the login form calls this instead of calling Supabase directly from the browser.
- [ ] The login form UI and user experience are unchanged: no new error messages, no indication of domain rejection.

## Edge Cases
- Tenant has no `allowed_email_domains` configured: magic link is sent for any email (fail-open behavior), to avoid breaking tenants who haven't set up domain restrictions yet.
- Email domain matches one of several configured domains (e.g. `ids.online` and `meisinger.de` both configured): any matching domain passes.
- Email domain check is case-insensitive: `Sales@IDS.ONLINE` matches `ids.online`.
- Tenant slug does not exist: return a generic 200 response without sending any email (no information leakage).
- Attacker submits a valid domain email for a non-existent user: Supabase's `shouldCreateUser: false` ensures no OTP is sent, same as today. The domain check is an additional layer before reaching Supabase.
- Attacker submits a blocked domain email repeatedly: consistently receives the "E-Mail gesendet" dummy response with no OTP sent.

---

## Tech Design (Solution Architect)

### Overview
OPH-84 moves the magic link OTP dispatch from the browser to the server. A new API route sits between the login form and Supabase Auth. Before sending the OTP, it looks up the tenant's allowed domains and silently swallows the request if the email domain doesn't match. The login form's UI is completely unchanged — it just calls a different URL.

---

### A) What Changes Where

```
src/app/api/sf/[slug]/magic-link/route.ts   ← NEW: POST handler
+-- Look up tenant by slug
+-- Load allowed_email_domains
+-- Extract domain from submitted email
+-- If domain not in list (and list is non-empty): return 200, send nothing
+-- If domain passes (or no list configured): call Supabase to send OTP
+-- Always return the same generic 200 response

src/components/salesforce/salesforce-login-form.tsx   ← MODIFY
+-- Replace direct supabase.auth.signInWithOtp() call
+-- With: POST /api/sf/[slug]/magic-link  { email }
+-- (No UI change — success/error states unchanged)
```

---

### B) Request Flow

```
BEFORE (OPH-75):
Browser → supabase.auth.signInWithOtp()
  (no domain check, direct to Supabase)

AFTER (OPH-84):
Browser → POST /api/sf/{slug}/magic-link
              ↓
         Look up tenant by slug
              ↓
         Check allowed_email_domains
              ↓ domain blocked?     ↓ domain allowed (or no list)?
         Return 200 (silent)    Send OTP via Supabase Admin Client
                                    ↓
                               Return 200 (same response)
```

Both paths return the same 200 response — the browser cannot distinguish between a blocked and a sent OTP.

---

### C) Why a New API Route (Not Client-Side)

Client-side domain validation is security theater — any attacker can open browser dev tools, bypass the JavaScript check, and call Supabase directly. Moving the logic to a server-side route means the OTP simply never gets dispatched for blocked domains, regardless of how the request is crafted.

---

### D) Domain Matching Logic (Reused from OPH-17)

The matching logic is the same pattern already in the inbound email route:

- Extract the part after `@` from the submitted email
- Lowercase it
- Check if it appears in the tenant's `allowed_email_domains` array (also stored lowercase)
- If the array is empty → allow all (fail-open)

**Important difference from OPH-17:** The inbound email route falls back to the `contact_email` domain when no domains are configured. OPH-84 does NOT use this fallback — an empty `allowed_email_domains` means "allow all" for the SF portal, so tenants that haven't configured domains aren't locked out.

---

### E) No OTP Enumeration Risk

Both allowed and blocked paths return the same HTTP 200 response with the same body. An attacker sending many email addresses from different domains gets identical responses, so they cannot determine which domains are on the allow-list or whether any given email exists.

Supabase's `shouldCreateUser: false` continues to handle the separate question of whether the email belongs to an existing user.

---

### F) Files Changed

| File | Change |
|---|---|
| `src/app/api/sf/[slug]/magic-link/route.ts` | NEW: POST handler — domain check + conditional OTP dispatch |
| `src/components/salesforce/salesforce-login-form.tsx` | MODIFY: Call the new API route instead of Supabase directly |

No database changes. No new npm packages. No middleware changes. No UI changes.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
