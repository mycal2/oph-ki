# OPH-63: Per-Tenant Email Forwarding

## Status: In Progress
**Created:** 2026-04-09
**Last Updated:** 2026-04-09

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) — tenant config stored per tenant
- Requires: OPH-10 (E-Mail-Weiterleitungs-Ingestion) — inbound email webhook triggers the forward
- Requires: OPH-35 (Per-Tenant Email Notification Settings) — forwarding toggle follows the same pattern

## Concept
Some tenants need a copy of every incoming order email automatically forwarded to another email address (e.g., an internal distribution list, a backup inbox, or a colleague who processes orders in parallel). This feature adds a per-tenant forwarding configuration that, when enabled, sends the original email content (subject, body, and all attachments) to a configured forwarding address via the existing Postmark outbound API.

The forwarding happens non-blocking (via `after()` callback) after the email is successfully processed by the inbound webhook. A forwarding failure does not affect order processing.

**Scope:** Email ingestion only. Web-uploaded orders are not forwarded (there is no original email to forward).

**Configuration:** Platform Admin only. Tenant users see the forwarding status as read-only, consistent with OPH-35 notification settings.

## User Stories

1. As a Platform Admin, I want to configure a forwarding email address for a tenant, so that every inbound order email for that tenant is automatically sent to a second recipient.
2. As a Platform Admin, I want to enable or disable forwarding independently from the forwarding address, so that I can pre-configure the address but only activate forwarding when the tenant is ready.
3. As a Platform Admin, I want to clear a tenant's forwarding address, so that I can fully remove the configuration when it's no longer needed.
4. As a Tenant Admin, I want to see (read-only) whether email forwarding is active for my tenant and to which address, so that I know where copies of order emails are going.
5. As a recipient of a forwarded email, I want to see the original sender, subject, and all attachments, so that I can process the order or file it without needing platform access.

## Acceptance Criteria

### AC-1: Database — new tenant fields
- [ ] Two new columns added to the `tenants` table:
  - `email_forwarding_enabled` (boolean, default: false)
  - `email_forwarding_address` (text, nullable, default: null)
- [ ] No migration of existing data needed — all existing tenants default to forwarding disabled

### AC-2: Forwarding toggle behavior
- [ ] When `email_forwarding_enabled` is true AND `email_forwarding_address` is a valid email: the inbound email webhook forwards the email after successful processing
- [ ] When `email_forwarding_enabled` is false: no forwarding occurs, regardless of whether an address is configured
- [ ] When `email_forwarding_enabled` is true but `email_forwarding_address` is null or empty: no forwarding occurs, no error is thrown

### AC-3: Forwarded email content
- [ ] Subject: `[Fwd] {original subject}` — prefixed to distinguish from the original
- [ ] From: the platform sender address (e.g., `noreply@oph.ids.online`) — Postmark requires a verified sender
- [ ] Reply-To: the original sender email address — so the recipient can reply to the original sender
- [ ] Body: includes the original email body text (plain text preferred, HTML stripped if only HTML available)
- [ ] Body includes a metadata header block: original sender name, original sender email, original received timestamp, tenant name
- [ ] All original attachments (PDF, Excel, CSV, etc.) are included in the forwarded email
- [ ] Attachments that exceeded the platform's size/type filters are NOT included (only attachments that were successfully processed)
- [ ] Total attachment size respects Postmark's 25 MB outbound limit — if attachments exceed this, send the email without attachments and add a note: "Anhänge zu groß für Weiterleitung. Bitte im System einsehen."

### AC-4: Non-blocking execution
- [ ] Forwarding is triggered via `after()` callback, same as confirmation and results emails
- [ ] A forwarding failure (Postmark API error, network issue) is logged to console but does NOT fail the order processing
- [ ] The webhook still returns `{ success: true }` regardless of forwarding outcome

### AC-5: Admin UI — Platform Admin (Tenant Detail Page)
- [ ] Two new fields in the tenant settings section (alongside existing OPH-35 notification toggles):
  - Toggle: "E-Mail-Weiterleitung" (on/off switch)
  - Input: "Weiterleitungs-Adresse" (email input field)
- [ ] The email input field is visually disabled / grayed out when the toggle is off
- [ ] The email input field validates email format on save (standard email regex)
- [ ] Changes take effect immediately for all future inbound emails (no restart required)

### AC-6: Tenant settings read-only view
- [ ] The tenant's own settings page shows the forwarding status as read-only:
  - "E-Mail-Weiterleitung: Aktiv / Inaktiv"
  - If active: "Weiterleitungs-Adresse: {address}" (address shown)
- [ ] Text reads: "Diese Einstellung wird von Ihrem Plattform-Administrator verwaltet." (consistent with OPH-35)

### AC-7: API validation
- [ ] `email_forwarding_enabled` accepts only boolean values
- [ ] `email_forwarding_address` is validated as a valid email format when provided; null or empty string is accepted (clears the address)
- [ ] Both fields are optional in the PATCH payload; omitting a field leaves it unchanged
- [ ] Setting `email_forwarding_enabled` to true with no address stored returns success (no error), but no forwarding occurs at runtime

### AC-8: Trial tenants
- [ ] Trial tenants do NOT receive forwarding — the feature is only available for regular tenants
- [ ] If a trial tenant somehow has forwarding enabled (e.g., after conversion), it is ignored while the tenant is in trial status

## Edge Cases

- **Forwarding address is a distribution list:** Works normally — Postmark sends to the address, the distribution list handles fan-out.
- **Forwarding address bounces:** Postmark handles bounces per its standard bounce management. No special handling needed in the platform. The platform admin can check Postmark's bounce dashboard.
- **Email has no attachments (body-only order):** Forward the body text only. The forwarded email still includes the metadata header block.
- **Attachments exceed 25 MB total:** Send the forwarded email without attachments and include a note in the body explaining that attachments were too large.
- **Toggle changed mid-processing:** The toggle is checked at forward time (inside the `after()` callback), so a toggle change during processing takes effect for that email.
- **Quarantined emails:** Quarantined emails are NOT forwarded — forwarding only triggers on successfully processed emails. If a quarantined email is later approved and reprocessed, the reprocessing flow should also trigger forwarding.
- **Duplicate email (same Message-ID):** Duplicate emails are rejected before processing, so no duplicate forward is sent.
- **Forwarding address same as sender:** No special handling — the email is forwarded. This is a valid use case (e.g., sender wants a copy in a shared inbox).

## Technical Notes (for Architecture)
- Database: Add two columns to `tenants` table (`email_forwarding_enabled`, `email_forwarding_address`)
- Backend: Add forwarding logic to `src/app/api/inbound/email/route.ts` after the confirmation email block (step 15)
- Postmark: New function `sendForwardedEmail()` in `src/lib/postmark.ts` using the existing `postmarkFetchWithRetry()` helper
- Postmark API: Use the `/email` endpoint with attachments array (Base64-encoded, same format as received from inbound webhook)
- Validation: Extend `updateTenantSchema` in `src/lib/validations.ts` with the two new fields
- Admin UI: Extend the tenant detail page / tenant form with toggle + email input
- Tenant settings: Extend the read-only settings view
- Reprocessing: Also trigger forwarding in `/api/admin/email-quarantine/[id]/reprocess/route.ts`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

```
Admin > Mandanten > Edit (existing: tenant-form-sheet.tsx)
+-- [UPDATE] E-Mail-Benachrichtigungen Section (existing 5 toggles)
|   +-- ... (existing OPH-35 toggles unchanged)
+-- [NEW] E-Mail-Weiterleitung Section
    +-- Toggle: "E-Mail-Weiterleitung" (on/off switch)
    +-- Input: "Weiterleitungs-Adresse" (email input, disabled when toggle is off)

Tenant Settings Page (existing: /settings/data-protection/)
+-- [UPDATE] E-Mail-Benachrichtigungen Card (existing, read-only)
    +-- ... (existing OPH-35 rows unchanged)
    +-- [NEW] Row: E-Mail-Weiterleitung — Aktiv/Inaktiv
    +-- [NEW] Row: Weiterleitungs-Adresse — {address} (shown only when active)
```

### Data Model

Two new columns on the existing `tenants` database table:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `email_forwarding_enabled` | boolean | false | Whether forwarding is active for this tenant |
| `email_forwarding_address` | text (nullable) | null | The email address to forward inbound order emails to |

No existing data migration needed — all existing tenants start with forwarding disabled.

### Backend Touch Points (no new API routes)

| File | Change |
|------|--------|
| Database migration | Add 2 new columns to `tenants` with safe defaults |
| `src/lib/validations.ts` | Extend `updateTenantSchema` with the 2 new optional fields |
| `src/lib/types.ts` | Add 2 fields to the `Tenant` type |
| `src/lib/postmark.ts` | Add `sendForwardedEmail()` function using existing `postmarkFetchWithRetry()` |
| `src/app/api/inbound/email/route.ts` | Fetch 2 new fields from tenant; add forwarding `after()` block after step 15 (confirmation email) |
| `src/app/api/admin/email-quarantine/[id]/reprocess/route.ts` | Also trigger forwarding after a quarantined email is reprocessed and an order is created |
| `src/app/api/admin/tenants/[id]/route.ts` | Accept and save 2 new fields (already handled by extending the schema) |
| `src/app/api/settings/data-retention/route.ts` | Return 2 new fields so the tenant read-only settings page can display them |
| `src/components/admin/tenant-form-sheet.tsx` | Add forwarding toggle + email input (extend existing `setEmailConfirmation` pattern) |
| `src/app/(protected)/settings/data-protection/page.tsx` | Add forwarding row to the existing read-only E-Mail-Benachrichtigungen card |

### Forwarded Email Structure

| Field | Value |
|-------|-------|
| To | `email_forwarding_address` (tenant config) |
| From | Platform sender address (verified Postmark sender) |
| Reply-To | Original sender email (so recipient can reply to the dealer) |
| Subject | `[Fwd] {original subject}` |
| Body (text) | Metadata block (original sender, timestamp, tenant name) + original email body |
| Attachments | All successfully processed attachments in Base64 (same format Postmark sends inbound) |

**Attachment size guard:** The existing inbound webhook already tracks accepted attachments (≤ 25 MB each, supported types only). The forward sums their sizes; if the total exceeds 25 MB, attachments are dropped and a note is added to the body.

### Tech Decisions

- **No new API routes** — forwarding config uses the existing `PATCH /api/admin/tenants/[id]` endpoint, consistent with all other tenant settings.
- **`after()` callback, non-blocking** — same pattern as confirmation and results emails (OPH-13, OPH-35). A Postmark failure never affects the order.
- **Attachments come from the inbound Postmark payload** — the raw `Attachments[]` array is already parsed and available in the webhook handler. We pass them directly to the outbound Postmark call; no re-downloading from storage required.
- **Reply-To instead of From spoofing** — Postmark requires a verified sender domain, so we cannot send "as" the original dealer. Using Reply-To is the standard forwarding approach and gives the recipient a natural way to reply.
- **Read-only display follows OPH-35 pattern** — the tenant settings page already shows all 5 notification toggles as read-only with `CheckCircle2`/`XCircle` icons. The forwarding row slots in identically.
- **No new packages needed** — shadcn/ui Switch and Input are already installed.

### Deployment Order
1. Run database migration (add 2 columns with defaults)
2. Deploy backend changes (validation schema, types, postmark helper, inbound webhook, quarantine reprocess, tenant PATCH, data-retention API)
3. Deploy frontend changes (admin form, tenant settings read-only view)

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
