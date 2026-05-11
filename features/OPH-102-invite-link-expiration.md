# OPH-102: Invite Link Expiration UX

## Status: Planned
**Created:** 2026-05-11
**Last Updated:** 2026-05-11

## Dependencies
- OPH-1 (Multi-Tenant Auth) — uses the same `/auth/confirm` route and login form
- OPH-38 (Resend Invite) — the affordance for admins to re-send an invite
- OPH-97 (Generate Copyable Invite Link) — produces the token-hash invite links affected by this bug
- OPH-98 (i18n Infrastructure) — new error keys must use `useTranslations`

## Background

When a platform admin or tenant admin invites a user, Supabase generates an invite link with a 24-hour TTL. If the user clicks the link after it has expired, the `/auth/confirm` route calls `verifyOtp`, which fails, and redirects the user to `/login?error=invite_link_expired`. However, `login-form.tsx` only recognises four error codes (`auth_callback_failed`, `account_inactive`, `tenant_inactive`, `session_expired`) — `invite_link_expired` and `invalid_invite_link` are silently dropped, leaving the user on a blank login page with no explanation.

There is a second invite path (hash-fragment flow, `/invite/accept#access_token=...&type=invite`) used by old-style Supabase email templates. When the token is expired, `supabase.auth.setSession()` returns an error but the current `accept-invite-form.tsx` only shows a generic "session failed" message without directing the user to contact their administrator.

## User Stories

- As a new user who clicks an expired invite link, I want to see a clear message that the link has expired so that I understand why I cannot log in and know what to do next.
- As a new user who clicks an invalid invite link, I want to see a specific message instead of a blank login form so that I am not confused about whether I have the wrong URL.
- As a new user who uses the hash-fragment invite flow, I want to see the same clear expired/invalid message so that both invite paths behave consistently.
- As a new user who sees an expired invite message, I want to be told to contact my administrator to request a new invitation so that I have a clear action to take.
- As a tenant admin, I want to know that expired invite links result in a clear user-facing error so that I can confidently tell users what to do when they report issues.

## Acceptance Criteria

- [ ] When a user lands on `/login?error=invite_link_expired`, the login form displays a visible error message (destructive Alert) explaining the link has expired and instructing the user to contact their administrator.
- [ ] When a user lands on `/login?error=invalid_invite_link`, the login form displays a visible error message explaining the link is invalid and instructing the user to contact their administrator.
- [ ] Neither error code causes a silent failure — if the `error` query param is one of these values, it is always rendered.
- [ ] When the hash-fragment path (`/invite/accept`) fails with an expired or otherwise rejected token from `supabase.auth.setSession()`, the `AcceptInviteForm` shows a clear expired-link error message (not the generic "Verbindung fehlgeschlagen") and includes the "Contact your administrator" instruction.
- [ ] All error strings are defined as i18n keys under `auth.login.errors.invite_link_expired` and `auth.login.errors.invalid_invite_link` in `messages/de.json` and `messages/en.json`.
- [ ] DE and EN message files remain in full parity (same key tree).
- [ ] The error messages do not expose internal Supabase error details to the user.

## Edge Cases

- **User refreshes the expired-link error page**: `?error=invite_link_expired` remains in the URL; the error must still be shown after a page reload. (No state reset on reload is needed — reading from `searchParams` already handles this.)
- **User navigates back after seeing the error**: The login form renders normally because `?error=...` is no longer in the URL.
- **Hash-fragment path with no token at all** (`/invite/accept` with no hash): already shows `errors.noSession` — no change needed.
- **Hash-fragment path with malformed token** (has `access_token` key but `setSession` errors): currently shows generic `errors.sessionFailed`. After this fix, if the Supabase error message contains "expired" or the error code is `otp_expired`, show the invite-expired message; otherwise fall back to `errors.sessionFailed`.
- **Both error paths show on the same form** (e.g., user was already showing a different error): URL error takes precedence on mount; only one error is shown at a time.
- **Salesforce login form** (`salesforce-login-form.tsx`) has its own `URL_ERROR_KEYS` set — it does not handle the OPH invite flow (invite links always point to the main domain), so no change is needed there.

## Technical Requirements

- **No new pages** — use the existing `/login` page and `/invite/accept` page; add error handling in-place.
- **Minimal surface area** — only `src/components/auth/login-form.tsx`, `src/components/auth/accept-invite-form.tsx`, `messages/de.json`, and `messages/en.json` need to change.
- **i18n compliance** — use `useTranslations("auth.login.errors")` for the new keys; do not hardcode strings.
- **No backend changes** — `/auth/confirm/route.ts` already emits the correct `?error=invite_link_expired` redirect. No changes required there.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
