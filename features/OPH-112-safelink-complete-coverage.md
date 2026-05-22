# OPH-112: Safelink Hardening — Forgot Password + SF Magic Link

## Status: Deployed

## Created: 2026-05-22

## Background

OPH-111 closed three of the five email-link paths against corporate link-prefetch scanners (Microsoft Defender Safe Links, Mimecast URL Protect, Google Workspace pre-scan, Proofpoint URL Defense). Two paths were left:

1. **Self-service "Forgot password"** — `auth-actions.ts:140` uses `supabase.auth.resetPasswordForEmail` which makes Supabase send the email directly. The link points to Supabase's `/auth/v1/verify` endpoint, which consumes the token on GET.
2. **Salesforce App magic-link login** — `/api/sf/[slug]/magic-link` uses `supabase.auth.signInWithOtp` with the same Supabase-direct email path.

A real customer's tenant user hit the forgot-password issue immediately after OPH-111 shipped, confirming these are real-world problems.

This feature completes the safelink hardening so **every email-sent auth link** routes through `/auth/confirm` and the click-to-confirm page.

## Dependencies

- Requires: OPH-111 (`/auth/confirm` two-step page, `wrap-confirm-link` helper)
- Related: OPH-1 (Multi-Tenant Auth)
- Related: OPH-75/84 (Salesforce magic-link flow that we're modifying)

## User Stories

1. **As a tenant user** who forgot my password, when I request a reset, the link I click in the email survives my company's Defender scanner.
2. **As a sales rep** signing into the Salesforce App via magic link, same expectation.
3. **As a platform admin**, I want the same branded `/auth/confirm` page for every flow — invite, password reset, magic link — so the UX is consistent.

## Acceptance Criteria

### AC-1: `forgotPasswordAction` uses generateLink + wrapConfirmLink + Postmark

- Replace `supabase.auth.resetPasswordForEmail` with `adminClient.auth.admin.generateLink({type: "recovery", email, options.redirectTo})`.
- Extract `hashed_token` from `linkData.properties`.
- Wrap via `wrapConfirmLink({type: "recovery", next: "/reset-password"})`.
- Send via `sendPasswordResetEmail` (existing Postmark template).
- **Preserve enumeration protection**: silently return success on any error (user not found, generateLink rate limit, Postmark unavailable). Match the current contract that "always returns success".

### AC-2: SF magic-link uses generateLink + wrapConfirmLink + Postmark

- Replace `supabase.auth.signInWithOtp` in `/api/sf/[slug]/magic-link/route.ts`.
- Use `adminClient.auth.admin.generateLink({type: "magiclink", email, options.redirectTo: callbackUrl})`.
- Verify user EXISTS first (preserves current `shouldCreateUser: false` behaviour) — if not, silently succeed.
- Wrap via `wrapConfirmLink({type: "magiclink", next: <relative path derived from callbackUrl>})`.
- Send via a new Postmark template `sendSalesforceMagicLinkEmail`.
- **Preserve all enumeration protection** — the existing route already does this; not regressing it is critical.

### AC-3: `/auth/confirm` page supports `type=magiclink`

- Add `"magiclink"` to the `SUPPORTED_TYPES` set in `src/app/auth/confirm/page.tsx`.
- Show appropriate German label for magiclink: headline "Anmelden", button "Anmelden", description "Klicken Sie auf den Button, um sich anzumelden."
- `confirmAuthToken` server action already handles all `EmailOtpType` values; no change.

### AC-4: `wrap-confirm-link` helper supports `magiclink`

- Extend `ConfirmLinkType` to include `"magiclink"`.

### AC-5: Defender / safelink simulation passes

- Issuing 5 GETs to a freshly-generated forgot-password link → all 5 return 200 (no token consumption). A single subsequent POST consumes successfully.
- Same test for SF magic-link.

### AC-6: New Postmark template — `sendSalesforceMagicLinkEmail`

- Subject: "Ihr Anmeldelink für {tenantName} Außendienst"
- Body mentions: tenant name, "Klicken Sie auf den Button und bestätigen Sie auf der folgenden Seite, um sich anzumelden", expiry warning.
- Uses the existing `wrapHtmlEmail` branded layout.

## Edge Cases

- **Forgot-password for unknown email**: generateLink returns "User not found" error → swallow, return success (no enumeration).
- **SF magic-link for unknown email**: same — preserve generic success.
- **Postmark unavailable / token missing**: log + return success silently (matches current behaviour for self-service paths).
- **Rate limit hit**: Supabase's generateLink has its own rate limit per email; on 429 we silently succeed.
- **User clicks magic-link AFTER expiry**: same as OPH-111 — `verifyOtp` returns error → redirect to `/login?error=invite_link_expired` (label is slightly off for magiclink case but acceptable; SF login page should also accept this error param).

## Out of Scope

- Custom SF-branded `/auth/confirm` skin per tenant. The shared page is acceptable for now.
- Replacing OPH-1's email confirmation flow on signup (we don't currently use email signup; rate-limiting and template overhaul would be a separate feature).

## Tech Design

### Files changed

| File | Change |
|---|---|
| `src/lib/auth/wrap-confirm-link.ts` | Add `"magiclink"` to `ConfirmLinkType` union |
| `src/app/auth/confirm/page.tsx` | Add `"magiclink"` to `SUPPORTED_TYPES`, add label branch |
| `src/lib/auth-actions.ts` | Rewrite `forgotPasswordAction` |
| `src/lib/postmark.ts` | Add `sendSalesforceMagicLinkEmail` |
| `src/app/api/sf/[slug]/magic-link/route.ts` | Rewrite using generateLink + wrap + Postmark |

### Enumeration protection patterns

Both rewritten flows must remain "always returns 200" from the caller's perspective. Errors are logged but not surfaced. Specifically:
- `generateLink` returns `error` for non-existent users → silent success
- Postmark send throws → silent success (logged)
- Rate limits → silent success (logged)
