# OPH-113: 6-Digit OTP Code Fallback for Defender-Resistant Auth

## Status: Deployed

## Created: 2026-05-22

## Background

OPH-111 + OPH-112 hardened all five email-link auth paths against corporate email link-prefetch (Defender Click-time check, Mimecast URL Protect, Google Workspace pre-scan, Proofpoint URL Defense). Real-world testing reveals one class of email security that still breaks the flow: **Microsoft Defender for Office 365 Plan 2's "URL detonation"**.

Detonation opens links in a sandbox browser that **executes JavaScript and clicks CTAs** — so it submits our "Bestätigen" button, which burns the single-use token before the human's click.

Industry-standard fix: send the user a 6-digit verification code alongside the link. The user types/pastes the code into a form. Detonators can read the email but don't know to extract the code from the email body and type it into a separate form. This is the pattern Slack, Notion, GitHub, Linear, and most enterprise SaaS use.

Bonus: **Supabase's `admin.generateLink` already returns `linkData.properties.email_otp`** — a 6-digit code paired with the same token. No new server-side state required.

## Dependencies

- Requires: OPH-111 (`/auth/confirm` two-step page, `wrap-confirm-link` helper)
- Requires: OPH-112 (forgot-password + SF magic-link wrapping)
- Related: OPH-1 (Multi-Tenant Auth)

## User Stories

1. **As a tenant user behind Microsoft Defender**, when the email link is consumed by my company's URL detonator, I can still type the 6-digit code from the email body to complete sign-in / password reset / invite acceptance.
2. **As any user**, the existing one-click flow still works — the code is a fallback, not a primary path.
3. **As a tenant admin**, the same code-based fallback applies to invites, password resets, and SF magic-link logins.

## Acceptance Criteria

### AC-1: All four Postmark email templates include the 6-digit code prominently

Templates to update:
- `sendInviteEmail` (initial invite)
- `sendResendInviteEmail` (resend invite)
- `sendPasswordResetEmail` (recovery)
- `sendSalesforceMagicLinkEmail` (SF magic-link)

Each gains:
- A **visible code block** in both HTML and text bodies, formatted as `XXX XXX` (e.g., `482 159`) for readability.
- A **fallback link** to `/auth/code?email=...&type=...&next=...` labeled "Code manuell eingeben" / "Verifizierungscode eingeben".
- The existing primary link to `/auth/confirm?token_hash=...` remains unchanged.

### AC-2: New `/auth/code` page accepts the code

- Route: `src/app/auth/code/page.tsx`
- Reads `email`, `type`, `next` from query string. Pre-fills email as read-only.
- 6-digit code input with proper `inputmode="numeric"`, autocomplete `one-time-code`.
- Form submit calls a server action that runs `supabase.auth.verifyOtp({type, email, token: code})`.
- On success: redirect to `next`.
- On failure: render error inline, allow retry. Don't redirect.

### AC-3: New `wrapCodeLink` helper

- `src/lib/auth/wrap-confirm-link.ts` gets a sibling export.
- Signature mirrors `wrapConfirmLink` but builds `/auth/code?email=...&type=...&next=...`.

### AC-4: All 5 generateLink callers pass `email_otp` + recipient email to templates

Routes:
- `POST /api/admin/tenants/[id]/users/invite`
- `POST /api/admin/tenants/[id]/users/[userId]/resend-invite`
- `POST /api/admin/tenants/[id]/users/[userId]/reset-password`
- `POST /api/team/invite`
- `POST /api/team/[userId]/reset-password`
- `POST /api/sf/[slug]/magic-link`
- `forgotPasswordAction` in `src/lib/auth-actions.ts`

Each route extracts `linkData.properties.email_otp` and passes it to the template, plus the recipient email (already on hand).

### AC-5: `/auth/confirm` server action redirects to `/auth/code` on token-already-used error

- When `verifyOtp` returns "Token has expired or is invalid" (the common Defender-detonation symptom), instead of redirecting to `/login?error=invite_link_expired`, redirect to `/auth/code?email=<from URL>&type=<from URL>&next=<from URL>&error=token_already_used`.
- The code page shows a hint: "Der Link wurde bereits verwendet (oft durch E-Mail-Schutzsoftware). Bitte geben Sie den 6-stelligen Code aus Ihrer E-Mail ein."
- This bridges users who clicked but the detonator had already burned it.
- **Caveat**: the code page needs the email and type. We must encode them in the original `/auth/confirm` URL — they already are (`type=invite|recovery|magiclink`); we just need `email` too. Add `&email=<encoded>` to the wrapped URL during generation.

### AC-6: Rate limiting on code attempts

- The `/auth/code` server action enforces a per-email rate limit: **5 attempts per 10 minutes**.
- Uses the existing `checkRateLimit` helper from `src/lib/rate-limit.ts`.
- After lockout, return generic error; do not reveal whether code was wrong vs. rate-limited.

### AC-7: Defender simulation passes

- Detonator visits `/auth/confirm` → button POST consumes token → user redirected to `/auth/code`.
- User finds 6-digit code in their email → types into form → verifyOtp succeeds → redirected to `next`.
- Flow works end-to-end despite detonator burning the link.

## Edge Cases

- **User types wrong code**: inline error, allow retry. Counts against rate limit.
- **Code expired (>1h for magiclink, 24h for invite/recovery)**: server returns expired error; UI suggests requesting a new email.
- **User enters code from a different email's reset attempt**: verifyOtp rejects; same as wrong code.
- **No email param in URL**: the form shows email input as editable (degraded UX but still functional).
- **JavaScript disabled**: form still works — it's a standard HTML form, no JS required.

## Out of Scope

- Replacing the entire link-based flow with code-only. The hybrid approach (link OR code) is intentional — keeps fast UX for non-Defender users.
- Server-side code generation (would replace Supabase's `email_otp`). Sticking with Supabase's built-in OTP keeps the implementation simple.
- SMS / push channel delivery — code only goes via email.

## Tech Design

### `linkData.properties.email_otp`

Supabase's `admin.generateLink` returns:
```ts
{
  properties: {
    action_link: string;
    hashed_token: string;
    email_otp: string;          // ← the 6-digit code we'll send
    verification_type: string;
    redirect_to: string;
  }
}
```

We extract `email_otp` alongside the existing `hashed_token` and pass both to the email template. The code is paired to the user's email + type and has the same expiry as the token.

### Format the code as `XXX XXX`

For readability: `482 159` not `482159`. Helper:

```ts
const formatOtp = (code: string) => code.replace(/(.{3})(.{3})/, "$1 $2");
```

### `/auth/code` page

Standard form: email (hidden + visually pre-filled), type (hidden), next (hidden), code (visible 6-digit input). Server action calls:

```ts
supabase.auth.verifyOtp({
  email,
  token: codeRaw,       // strip spaces first
  type,
});
```

Returns same session payload as link-based verifyOtp.

### Rate limit key

`code-attempt:<email>` — 5 attempts per 10 min. Reuses `src/lib/rate-limit.ts`.

### Files changed

| File | Change |
|---|---|
| `src/app/auth/code/page.tsx` | NEW — form + email/type/next from URL |
| `src/app/auth/code/actions.ts` | NEW — verifyOtp server action with rate limit |
| `src/lib/auth/wrap-confirm-link.ts` | Add `wrapCodeLink` helper |
| `src/lib/postmark.ts` | Update 4 templates to include code + code link |
| `src/app/api/admin/tenants/[id]/users/invite/route.ts` | Pass email_otp + email to template |
| `src/app/api/admin/tenants/[id]/users/[userId]/resend-invite/route.ts` | Same |
| `src/app/api/admin/tenants/[id]/users/[userId]/reset-password/route.ts` | Same |
| `src/app/api/team/invite/route.ts` | Same |
| `src/app/api/team/[userId]/reset-password/route.ts` | Same |
| `src/app/api/sf/[slug]/magic-link/route.ts` | Same |
| `src/lib/auth-actions.ts` (`forgotPasswordAction`) | Same |
| `src/app/auth/confirm/actions.ts` | On "already used" error, redirect to `/auth/code` with email/type/next preserved |
