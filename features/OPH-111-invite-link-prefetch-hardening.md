# OPH-111: Invite & Reset Link Prefetch Hardening (Microsoft Defender / Mimecast safe)

## Status: In Progress

## Created: 2026-05-22

## Background

Corporate email security gateways — Microsoft Defender Safe Links, Mimecast URL Protect, Google Workspace pre-scan, Proofpoint URL Defense — perform an HTTP GET on every link in inbound email *before* the human ever clicks. They do this to scan the destination for malware/phishing.

Our current invite and password-reset email links call `verifyOtp` server-side on GET. The first GET consumes the single-use token; the human's later click then fails with "invite link expired."

This is reported as an ongoing pain point with tenant companies running Defender. OPH-97 (the "Link generieren" copy-out-of-band mode) is a partial workaround for platform admins but doesn't help when emails are the primary delivery channel.

## Dependencies

- Requires: OPH-1 (Multi-Tenant Auth)
- Related: OPH-97 (Generate Copyable Invite Link) — remains as alternate delivery path
- Related: OPH-102 (Invite Link Expiration UX) — error path when link genuinely expires

## User Stories

1. **As a user** at a company running Microsoft Defender / Mimecast / similar, when I receive an invite email and click the link, I want the invite to still be valid — not consumed by my company's link-prefetcher.
2. **As a user** doing a password reset, same expectation.
3. **As a platform admin**, I want one consistent confirmation page regardless of whether the link came from invite or reset.
4. **As a security-conscious admin**, I want token consumption to require an explicit user click — not a passive GET.

## Acceptance Criteria

### AC-1: `/auth/confirm` GET no longer consumes the token

- GET `/auth/confirm?token_hash=...&type=...&next=...` MUST NOT call `verifyOtp`.
- Instead it renders an HTML confirmation page with the params preserved in a `<form method="POST">`.
- The form has a single button: **"Einladung annehmen"** (invite) or **"Passwort zurücksetzen"** (recovery), label switches based on `type`.
- Page also shows the user's email (read-only) so they can verify it's the right account.

### AC-2: `/auth/confirm` POST consumes the token

- POST receives `token_hash`, `type`, `next` from form fields.
- Calls `verifyOtp` server-side; on success, redirects to `next`.
- On error: redirects to `/login?error=invite_link_expired` (existing behavior).

### AC-3: Defender / safelink simulation passes

- Verified by issuing 5 GETs to the same `/auth/confirm?token_hash=...` URL in sequence.
- All 5 GETs return the confirmation page HTML (status 200) WITHOUT consuming the token.
- A single POST after the 5 GETs still succeeds — token wasn't consumed by any GET.

### AC-4: All five generateLink-based flows route through `/auth/confirm`

The following endpoints currently send raw Supabase `action_link` (vulnerable to GET prefetch). All must be updated to wrap the link through `/auth/confirm` (extracting `hashed_token` from `linkData.properties`):

- `POST /api/admin/tenants/[id]/users/invite` ✓ (already wraps)
- `POST /api/admin/tenants/[id]/users/[userId]/resend-invite` ✓ (already wraps)
- `POST /api/admin/tenants/[id]/users/[userId]/reset-password` ✗ → must wrap
- `POST /api/team/invite` ✗ → must wrap
- `POST /api/team/[userId]/reset-password` ✗ → must wrap

### AC-5: Email body copy

The invite and password-reset email templates must be updated to set expectations:

> "Klicken Sie auf den Link unten. Auf der folgenden Seite müssen Sie noch einmal bestätigen, um Ihre Einladung anzunehmen."

A single extra sentence telling users they'll see a confirmation page. Reduces "is the link broken?" support traffic.

### AC-6: Backwards compatibility

- Existing OPH-97 "Link generieren" copy-link flow continues to work — the link still points to `/auth/confirm` (just with the new two-step behavior).
- Active sessions are not affected. This only changes the unauthenticated-link-click flow.

### AC-7: Middleware allowlist

- `/auth/confirm` must remain in the public-route allowlist (`src/lib/supabase/middleware.ts:96`) — both GET and POST.

## Edge Cases

- **User reloads the confirm page before clicking**: no token consumed, idempotent.
- **User opens link in two tabs, clicks in both**: first POST succeeds; second POST gets "token already used" → redirect to `/login?error=invite_link_expired`. Acceptable — user is signed in from the first click anyway.
- **Token genuinely expired (24h)**: GET still shows confirmation page; POST returns expired error and redirects to login with `?error=invite_link_expired`. Existing OPH-102 expiration UX kicks in.
- **`type` missing or invalid**: GET redirects to `/login?error=invalid_invite_link` (existing behavior).
- **CSRF**: Form has no CSRF token; mitigated by the single-use nature of the token itself (consuming it requires having the URL, which is only delivered via the user's own email). Same threat model as today's GET-based flow.

## Out of Scope (Future Work)

- **SF magic-link flow** (`/api/sf/[slug]/magic-link`) uses `signInWithOtp` rather than `generateLink` + Postmark. Same vulnerability exists. Tracked separately as a future feature: rewrite to use `generateLink` + Postmark + `/auth/confirm` wrap. Not included in OPH-111 because the refactor is larger.
- **CAPTCHA on the confirmation page** — could add later if scraper traffic becomes an issue.

## Tech Design

### `/auth/confirm` becomes a Page (not just a Route)

Replace `src/app/auth/confirm/route.ts` (route handler) with:
- `src/app/auth/confirm/page.tsx` — server component, reads searchParams, renders confirmation form
- `src/app/auth/confirm/actions.ts` — server action `confirmToken({ tokenHash, type, next })` invoked from form

The page uses the existing AuthLayout for visual consistency with login/invite-accept.

### Wrapping helper

Add a `src/lib/auth/wrap-confirm-link.ts` helper:

```typescript
export function wrapConfirmLink(siteUrl: string, hashedToken: string, type: "invite" | "recovery", next: string): string
```

Called by the 5 endpoints to construct the URL consistently.

### Migration of unwrapped routes

Update three endpoints to call `wrapConfirmLink` instead of using raw `actionLink`:
- `/api/admin/tenants/[id]/users/[userId]/reset-password`
- `/api/team/invite`
- `/api/team/[userId]/reset-password`

Each currently extracts `linkData.properties.action_link`. They need to extract `linkData.properties.hashed_token` instead and feed it to `wrapConfirmLink`.

### Postmark email body updates

- `src/lib/postmark.ts` — `sendInviteEmail` and `sendPasswordResetEmail` (and any related template builders): add the one-sentence "confirmation page" notice above the CTA button.
