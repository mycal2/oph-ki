# OPH-97: Platform Admin — Generate Copyable Invite Link

## Status: Deployed
**Created:** 2026-05-06
**Last Updated:** 2026-05-06
**Deployed:** 2026-05-06 — dev, staging, production (https://oph-ki.ids.online)

## Dependencies
- Requires: OPH-8 (Admin: Mandanten-Management) — tenant user management UI
- Requires: OPH-38 (Admin: Resend Invite & Trigger Password Reset) — existing invite infrastructure

## Background

The current invite flow automatically sends an email via Postmark when a platform admin adds a user to a tenant. Some admins prefer to communicate invitations through their own channels (a personal email, a Slack message, an internal process). This feature adds a second invite mode — "Link generieren" — that creates the user and returns a one-time invitation link for the admin to copy and distribute manually. No automatic email is sent in this mode.

## User Stories

- As a platform admin, I want to choose between "Einladung senden" (automatic email) and "Link generieren" (copy link) when adding a user, so that I can handle the communication channel myself.
- As a platform admin, after generating a link, I want to see the invite URL in a dialog with a one-click copy button, so that I can paste it into my own email without transcription errors.
- As a platform admin, I want to know how long the link is valid for, so that I can send it to the user before it expires.
- As a new user, I want the link I receive to take me through the standard invite accept flow, so that I can set my password and access my tenant.

## Acceptance Criteria

### AC-1: Mode selection on invite dialog
- The existing "Benutzer einladen" dialog gains a toggle or two-button group:
  - **"Einladung senden"** — current behaviour (email sent via Postmark)
  - **"Link generieren"** — new behaviour (no email, link shown in UI)
- "Einladung senden" is selected by default so existing behaviour is unchanged.

### AC-2: Link generation — no email sent
- When "Link generieren" is selected and the form is submitted:
  - The user account is created in Supabase with correct `app_metadata` (tenant_id, role)
  - No email is dispatched (neither Postmark nor Supabase built-in)
  - The raw `action_link` is returned in the API response

### AC-3: Invite link copy dialog
- After successful link generation, a dialog/modal appears showing:
  - A read-only text field containing the full invite URL
  - A "Kopieren" button that copies the URL to clipboard
  - A notice: "Dieser Link ist einmalig verwendbar und läuft nach 24 Stunden ab."
  - A "Schließen" button
- Clicking "Kopieren" changes the button label briefly to "Kopiert!" as confirmation

### AC-4: Link validity
- The invite link uses Supabase's standard invite token, which is single-use and expires after the configured token lifetime (default: 24 hours)
- The expiry notice in the dialog always states 24 hours (matching Supabase's default)

### AC-5: Already-registered email
- If the email is already registered, the API returns the same 409 error as the current invite flow, shown inline in the form (not in the copy dialog)

### AC-6: API contract
- `POST /api/admin/tenants/[id]/users/invite` accepts an optional boolean field `generateLinkOnly: boolean`
- If `true`: skips Postmark, returns `{ success: true, data: { userId, email, inviteLink } }`
- If `false` or omitted: current behaviour (no `inviteLink` in response)

## Edge Cases

- **Admin closes dialog before copying:** The user account has already been created. The admin can use the existing "Erneut einladen" button (OPH-38) to generate a new link or send an email later.
- **Postmark not configured:** The existing behaviour (user created, warning shown) is unchanged for the "Einladung senden" mode. "Link generieren" mode is unaffected by Postmark configuration.
- **Trial tenant:** Same guard as before — trial tenants cannot have invited team members; this restriction applies to both modes.
- **Inactive tenant:** Same guard — 403 returned for both modes.

## Tech Design (Solution Architect)

### Component Changes

```
Admin Tenant Detail Page
└── "Benutzer einladen" Dialog  [MODIFIED]
    ├── Email input (unchanged)
    ├── Role selector (unchanged)
    ├── Mode selector (NEW)
    │   ├── Button: "Einladung senden" [default]
    │   └── Button: "Link generieren"
    └── Submit button (label changes based on mode)
        → "Einladen" / "Link erstellen"

InviteLinkDialog (NEW component)
├── Read-only URL input
├── Copy-to-clipboard button ("Kopieren" / "Kopiert!")
├── Expiry notice
└── Close button
```

### API Change

`POST /api/admin/tenants/[id]/users/invite`

New optional request field:
```
generateLinkOnly: boolean  (default: false)
```

When `true`:
- Skip `sendInviteEmail` call
- Add `inviteLink: actionLink` to the success response data

### Data Flow

1. Admin fills invite form, selects "Link generieren", submits
2. API: `generateLink` → creates user, returns `action_link`
3. API: updates `app_metadata` (unchanged)
4. API: skips Postmark, returns `{ success: true, data: { userId, email, inviteLink } }`
5. UI: receives `inviteLink`, closes invite dialog, opens `InviteLinkDialog`
6. Admin copies link, sends it manually

---

## QA Test Results

**Tested:** 2026-05-06
**Tester:** QA / Red-Team
**Method:** Static review of working-tree changes (uncommitted), `tsc --noEmit`, `next build`, and red-team analysis. No live browser session was available; manual UI checks should be repeated by the developer in the staging deployment after fixes.

### Build & Type Check
- `npx tsc --noEmit`: PASS (no type errors)
- `npm run build`: PASS (production build compiles)

### Acceptance Criteria

| AC | Description | Result |
|----|-------------|--------|
| AC-1 | Mode selection on invite dialog ("Einladung senden" default + "Link generieren") | PASS — `tenant-invite-dialog.tsx` adds a `radiogroup` with two buttons; default `mode` state is `"send"` |
| AC-2 | Link generation skips email and returns `action_link` | PASS — `route.ts` lines 138–148 return early before Postmark when `generateLinkOnly` is true; `app_metadata` is set on the user beforehand |
| AC-3 | Invite link copy dialog with read-only field, Kopieren button (turns into "Kopiert!"), expiry notice, Schließen | PASS — `invite-link-dialog.tsx` implements all four elements; uses navigator.clipboard with a textarea fallback for non-secure contexts |
| AC-4 | 24-hour expiry notice text | PASS — `invite-link-dialog.tsx` line 120 hard-codes the 24h notice |
| AC-5 | Already-registered email returns 409 inline (not in copy dialog) | PASS — route returns 409 before reaching the link-only branch; `tenant-invite-dialog.tsx` shows the error inline because `result.ok === false` keeps the form open |
| AC-6 | API contract: optional `generateLinkOnly: boolean`, returns `inviteLink` only when true | PASS — `adminInviteUserSchema` now has `generateLinkOnly` (default `false`); response shape matches |

### Bugs Found

#### BUG-1 (Critical) — User account is created on Supabase even when "Einladung senden" mode hits a Postmark failure, AND in "Link generieren" mode email is unconditionally skipped, but `app_metadata` is still updated even if `actionLink` is missing
- **File:** `src/app/api/admin/tenants/[id]/users/invite/route.ts` (lines 110–148)
- **Issue:** The flow does `updateUserById` to set `app_metadata` *before* checking `actionLink`. If `actionLink` is missing the route returns 500 — but the auth user already exists with tenant_id+role. This is a pre-existing condition aggravated by OPH-97 because there is no "delete on rollback" path. Same issue exists in the link-only branch: if `actionLink` is somehow null we'd 500 after `updateUserById`. Inconsistent state can result in admin retrying with the same email and getting "already registered". This was already a latent issue in the existing code, but OPH-97 preserves it. Document as known limitation or rollback on failure.
- **Severity:** Critical (data-consistency / orphaned user account)
- **Repro:** force `actionLink` to null (e.g., mock generateLink) → user is created with metadata but invite path fails. Future re-invite attempts fail with 409.

#### BUG-2 (High) — `tenant-form-sheet.tsx` no longer compiles cleanly with the new `onInviteUser` signature; the `TenantInviteDialog` rendered there is missing the new `onLinkGenerated` prop and there is no `InviteLinkDialog` mounted inside the sheet
- **File:** `src/components/admin/tenant-form-sheet.tsx` (line 1042)
- **Issue:** The `handleInvite` was extended to forward `generateLinkOnly`, and the `onInviteUser` prop signature was widened to return `inviteLink?: string`. However the JSX rendering of `TenantInviteDialog` does NOT pass `onLinkGenerated`, and there is no `InviteLinkDialog` imported / rendered. If a user opens the legacy sheet and selects "Link generieren", the link is silently lost — the dialog closes, no copy dialog appears, and the admin cannot retrieve the link without using "Erneut einladen".
- **Mitigating fact:** A code-search confirms that `TenantFormSheet` is currently *only defined* — no page imports it (`grep -rn "TenantFormSheet" src` returns only its own file). The legacy sheet appears to be dead code today. **However**, leaving it in this half-migrated state is a future regression hazard; it should either be removed or fully wired up.
- **Severity:** High (silent data loss if the dead component is ever revived; latent regression)
- **Repro:** import `TenantFormSheet` somewhere, open the sheet, select "Link generieren", submit. Observed: link is generated server-side but never shown in UI.

#### BUG-3 (Medium) — `tenant-invite-dialog.tsx` accepts `sales_rep` role via the schema but the UI hard-codes only `tenant_user` and `tenant_admin`
- **File:** `src/components/admin/tenant-invite-dialog.tsx` (lines 41–43, 157–166)
- **Issue:** Backend schema `adminInviteUserSchema` accepts `["tenant_user", "tenant_admin", "sales_rep"]`. The dialog's role selector only offers two options. Not introduced by OPH-97, but worth noting because OPH-97 adds a second submission path. If a tenant has Salesforce enabled, a platform admin cannot invite an Außendienstler via "Link generieren" through this UI. Pre-existing limitation, not blocking OPH-97.
- **Severity:** Medium (functional gap, pre-existing)

#### BUG-4 (Medium) — Trial / inactive tenant guard messages are surfaced inline correctly, but the new "Link generieren" button still implies link creation will succeed
- **File:** `src/components/admin/tenant-invite-dialog.tsx` lines 175–223 + `route.ts` lines 63–76
- **Issue:** The mode selector is always interactive even on trial / inactive tenants. The 403 only fires after submission. Minor UX polish: disable the form entirely (or show a banner) on trial/inactive tenants. Not strictly a regression vs. the prior behaviour.
- **Severity:** Medium (UX) — same UX pre-existed for "Einladung senden", so this is not strictly an OPH-97 regression.

#### BUG-5 (Medium) — Copy fallback may leave `<textarea>` selectable in DOM if `document.execCommand('copy')` throws synchronously; also doesn't show the "Kopiert!" feedback if the fallback path silently fails
- **File:** `src/components/admin/invite-link-dialog.tsx` lines 49–67
- **Issue:** The catch block swallows errors entirely. If `navigator.clipboard.writeText` throws (e.g., Safari without user gesture in certain contexts) and the fallback also fails, the admin sees nothing — no toast, no error. The `<textarea>` is removed in `finally`-style cleanup but only on success path; on a thrown error from `execCommand` it would be removed by the implicit `try` jump (actually it IS removed before the `setCopied(true)` line, so that's fine) — but the user has no feedback that copy failed. They will believe copy worked. Recommendation: surface a toast or change button to "Kopieren fehlgeschlagen" briefly. Field is selected on focus so manual copy is still possible, but the silent failure is a UX trap.
- **Severity:** Medium (UX / error visibility)
- **Repro:** in a non-secure context (HTTP) without permissions API, click Kopieren — no visible feedback whether copy succeeded.

#### BUG-6 (Low) — "Kopieren" button does not auto-select / copy on dialog open
- **File:** `src/components/admin/invite-link-dialog.tsx`
- **Issue:** Many admins expect Ctrl+C to "just work". The input only selects on focus — first interaction selects, second copies. Adding `useEffect` autoFocus + autoSelect on dialog open would smooth the flow. Minor UX enhancement.
- **Severity:** Low

#### BUG-7 (Low) — Mode selector is a `<button role="radio">` group but is missing a wrapping `<div role="radiogroup">` `aria-required` and keyboard arrow-key navigation
- **File:** `src/components/admin/tenant-invite-dialog.tsx` lines 171–223
- **Issue:** The two buttons each have `role="radio"`/`aria-checked`. The container has `role="radiogroup"` correctly. However ARIA radio groups should support arrow-key navigation between options; only Tab+Enter currently works. Minor a11y. Consider `<RadioGroup>` from shadcn/ui (`src/components/ui/radio-group.tsx` if installed) for free a11y.
- **Severity:** Low (accessibility polish)

#### BUG-8 (Low) — `InviteLinkDialog` is mounted with `open={!!inviteLinkInfo}` but the dialog's own `onOpenChange(false)` only sets state; closing with Esc/click-outside also fires `onOpenChange`. After closing, the `email` prop momentarily shows the previous value because `inviteLinkInfo` is not nulled until the parent's onOpenChange handler runs. Result: brief flash of stale email during close animation
- **File:** `src/components/admin/tenant-users-tab.tsx` lines 509–516
- **Severity:** Low (cosmetic)

#### BUG-9 (Low) — User list refreshes on link generation, which is correct, but the new user appears as "Einladung ausstehend" while the admin still has the link in the copy dialog. If the admin closes the dialog before copying, they'll see the OPH-38 "Erneut einladen" affordance which sends an email — there is no equivalent "Re-generate link" affordance from the user row
- **Files:** `src/components/admin/tenant-users-tab.tsx`
- **Issue:** Spec edge case "Admin closes dialog before copying" says "the admin can use the existing 'Erneut einladen' button (OPH-38) to generate a new link or send an email later." Today, OPH-38 only sends an email — there is no "generate link" path on the user row. So the admin's only recovery is to send the user an email, which defeats the purpose of "Link generieren" when, e.g., Postmark is misconfigured. Recommend a future "Link erneut generieren" action item in the user row dropdown.
- **Severity:** Low (functional gap; documented edge case is partially incorrect)

### Security Audit (Red-Team)

| Vector | Result |
|--------|--------|
| Authentication bypass | PASS — `requirePlatformAdmin()` enforced; non-admin returns 401/403 |
| Authorization (cross-tenant) | PASS — `tenantId` is from URL, validated as UUID, and a single tenant lookup is performed; `app_metadata` is bound to that tenant |
| Rate limiting | PASS — `checkAdminRateLimit` (60 req / min / user) applied before any work |
| Input validation | PASS — Zod schema; `generateLinkOnly` is boolean with default false; `email` validated as proper email; `role` is enum-restricted |
| Invite link disclosure | **CONCERN-1** — The `actionLink` is returned in JSON to the browser. This is by design. However, it WILL appear in the browser's network tab and any error-tracking SDK that captures response bodies (Sentry, LogRocket). Verify Sentry's beforeSend strips this for `/api/admin/tenants/.../invite` responses, otherwise the link could leak to logs. Severity: Medium |
| Invite link in console.log | PASS — no `console.log(actionLink)` server-side |
| XSS via email field | PASS — email is rendered through React text nodes (escaped); URL is placed in a read-only `<Input value=...>` (escaped) |
| Open redirect | PASS — `redirectTo` is constructed server-side from `NEXT_PUBLIC_SITE_URL`, not from user input |
| CSRF | PASS — Same-origin POST + Supabase auth cookie + admin role check |
| Single-use guarantee | PASS — Supabase invite tokens are single-use by default; verify via Supabase dashboard. Note: re-running "Link generieren" for the *same* email currently returns 409 (already registered). The admin would have to use the (broken-for-link-mode) "Erneut einladen" path or delete the user first. See BUG-9. |
| Generated link reaches admin browser unencrypted on local dev | INFO — In production behind HTTPS this is fine. On local dev (HTTP), the link transits unencrypted, but it's only on localhost. |
| Rate-limit on link generation specifically | INFO — Same 60/min limit as regular invites. Acceptable. An admin could in theory enumerate emails (existing vs not) by abusing the 409 response — but that's pre-existing. |

#### CONCERN-1 (Medium) — Sensitive `inviteLink` returned in API response
- **Issue:** `inviteLink` contains an `access_token`-style query param that, if logged or screenshot, grants full account access for 24h. There is no `Cache-Control: no-store` set on the response. Browsers and intermediate proxies may cache it.
- **Recommendation:** Add `Cache-Control: no-store, no-cache, must-revalidate` and `Pragma: no-cache` to the response when `generateLinkOnly === true`. Also confirm logging policy (Vercel / Supabase log scrubbing).
- **Severity:** Medium

### Regression Testing

Sampled deployed flows that touch the same surface:

| Feature | Status | Notes |
|---------|--------|-------|
| OPH-1 Multi-tenant auth | PASS | No changes to auth pipeline; tests confirm `app_metadata` still set correctly |
| OPH-8 Mandanten-Management | PASS | `tenant-users-tab.tsx` retains existing flows: deactivate/reactivate, role change, invite email |
| OPH-38 Resend Invite & Reset Password | PASS | Resend invite route untouched; `tenant-users-tab.tsx` confirm dialog logic preserved |
| OPH-41 Change User Role | PASS | Role-change handler unchanged |
| OPH-42 Admin Tenant Detail Page | PASS | `[id]/page.tsx` integrates the new dialog cleanly |
| OPH-48 Platform Team User Management | INFO | Not exercised here — uses a different route under `/api/admin/users/...` |
| Default invite (mode = "send") | PASS by inspection | Flow unchanged: email goes through Postmark; success view shows green checkmark |

### Cross-Browser & Responsive

Not executed (no live dev session). Recommended manual checks:
- Chrome / Firefox / Safari latest — primarily `navigator.clipboard.writeText` behaviour in Safari (which often requires a user gesture) — fallback path will need verification.
- Mobile 375px: dialog content stacks vertically (the mode selector uses `grid-cols-1 sm:grid-cols-2`) — should be fine.
- The "Kopieren" button in `InviteLinkDialog` is `shrink-0` next to a flex input; on 375px the input may become very narrow. Recommend manual check.

### Production-Ready Decision

**NOT READY** — Two High/Critical-class issues require attention:

1. **BUG-1** (Critical) — Orphaned user accounts on partial failure: pre-existing but should be acknowledged.
2. **BUG-2** (High) — `tenant-form-sheet.tsx` is half-migrated. Even if dead code today, it should either be deleted or fully wired (with `onLinkGenerated` and the `InviteLinkDialog` mounted), to prevent silent regressions.
3. **CONCERN-1** (Medium / Security) — Add `Cache-Control: no-store` to the link-only response and confirm log scrubbing.

Recommended fix priority:
1. BUG-2 (High) — fix or delete the legacy `TenantFormSheet`.
2. CONCERN-1 (Medium / Security) — add no-store header.
3. BUG-5 (Medium / UX) — give visual feedback on copy failure.
4. BUG-9 (Low / Functional) — consider follow-up ticket for "Link erneut generieren" on user row.
5. BUG-1 (Critical) — separate ticket for orphaned-user rollback (pre-existing).

After fixes, re-run QA on staging with live browser session to validate AC-3 (clipboard), cross-browser (Safari especially), and responsive behaviour.
