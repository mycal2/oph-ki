# OPH-102: Invite Link Expiration UX

## Status: Deployed
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

**Tested:** 2026-05-11
**Build:** Static code review + dev server smoke test (localhost:3003)
**Tester:** QA pass run inline (manual after `/qa` skill timeout)

### Acceptance Criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | `/login?error=invite_link_expired` shows visible alert with admin-contact CTA | ✅ Pass | `ERROR_KEYS` in `login-form.tsx:28` includes `invite_link_expired`. `i18n key auth.login.errors.invite_link_expired` resolves to "Ihr Einladungslink ist abgelaufen. Bitte kontaktieren Sie Ihren Administrator…" (DE) / "Your invitation link has expired. Please contact your administrator…" (EN). The existing destructive `Alert` renders it. |
| 2 | `/login?error=invalid_invite_link` shows visible alert with admin-contact CTA | ✅ Pass | Same code path as #1. `i18n key auth.login.errors.invalid_invite_link` defined in both locales with admin-contact CTA. |
| 3 | Neither error code is silently dropped | ✅ Pass | Both codes are in the `ERROR_KEYS` whitelist (`login-form.tsx:23–30`). `isLoginErrorKey` returns true; `setError(t(...))` runs. |
| 4 | Hash-fragment `/invite/accept` shows clear expired message when `setSession()` errors | ✅ Pass | `accept-invite-form.tsx:57–63` checks `errCode === "otp_expired"` OR `errMessage.includes("expired")`, sets `errors.linkExpired`. Falls back to `errors.sessionFailed` otherwise. |
| 5 | i18n keys defined under `auth.login.errors.*` (and `auth.acceptInvite.errors.linkExpired`) | ✅ Pass | All three keys present in `messages/de.json` and `messages/en.json`. |
| 6 | DE/EN message files in full parity | ✅ Pass | Programmatic comparison: 399 keys each, zero diff. |
| 7 | Error messages do not expose internal Supabase details | ✅ Pass | `sessionError?.message` is only logged to `console.error` (developer signal). User sees the translated static i18n string. No template interpolation of error details. |

**AC summary: 7/7 passed.**

### End-to-End Smoke Tests

Performed against `localhost:3003`:

| Test | URL | Expected | Actual |
|---|---|---|---|
| Bad token → expired redirect | `GET /auth/confirm?token_hash=fake-expired-token&type=invite` | 307 → `/login?error=invite_link_expired` | ✅ Header: `location: …/login?error=invite_link_expired` |
| No params → invalid redirect | `GET /auth/confirm` | 307 → `/login?error=invalid_invite_link` | ✅ Header: `location: …/login?error=invalid_invite_link` |
| Login page reachable | `GET /login` | 200 OK | ✅ 200 |

### Static Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Clean (no errors) |
| DE/EN key parity (Node script) | ✅ 399 = 399, no diff |
| `next-intl` typed message access | ✅ All three new keys resolvable |

### Edge Cases

| Case | Verified | Notes |
|---|---|---|
| Page refresh on `?error=invite_link_expired` URL | ✅ | `useSearchParams` re-reads on mount, alert re-renders |
| Back navigation removes the query param | ✅ | No `?error=` → `isLoginErrorKey(null)` is false → no error state set |
| `/invite/accept` with no hash | ✅ | Unchanged — `errors.noSession` still applies |
| `/invite/accept` with hash but non-expired `setSession()` error | ✅ | Falls through to `errors.sessionFailed` (default branch) |
| Salesforce login form unaffected | ✅ | `URL_ERROR_KEYS` in `salesforce-login-form.tsx:55` is a separate `Set`; invite links never target SF subdomain |

### Security Audit (Red Team)

| Attack vector | Status | Notes |
|---|---|---|
| Error-param injection (e.g. `?error=<script>alert(1)</script>`) | ✅ Safe | `isLoginErrorKey()` whitelist rejects anything not in the enum; arbitrary strings never reach `t()` |
| Missing-key crash | ✅ Safe | All six codes in `ERROR_KEYS` have matching `auth.login.errors.*` strings |
| Information disclosure via error messages | ✅ Safe | Static i18n strings; raw `sessionError.message` only console-logged |
| Open redirect via `next` param | n/a | Not introduced by this feature; `/auth/confirm` already validates redirect targets |

No new bugs found. No regression observed on other login error codes (`auth_callback_failed`, `account_inactive`, `tenant_inactive`, `session_expired`) — they share the same code path and remain functional.

### Production-Ready Decision: **READY**

No Critical or High bugs. Implementation is minimal, well-scoped, and consistent with existing patterns in the codebase.

**Note for future improvement (out of scope):** Consider hoisting both `URL_ERROR_KEYS` sets (login-form and salesforce-login-form) into a shared module if the list grows further — currently acceptable as two small enums.

## Deployment

- **Production:** https://oph-ki.ids.online — Deployed 2026-05-11
- **Staging:** https://oph-ki-staging.ids.online — Deployed 2026-05-11
- **Dev:** https://oph-ki-dev.ids.online — Deployed 2026-05-11
- No DB migration. i18n strings + 2 component edits.
