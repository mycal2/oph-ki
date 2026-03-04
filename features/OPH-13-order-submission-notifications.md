# OPH-13: Order Submission Email Notifications

## Status: In Review
**Created:** 2026-02-27
**Last Updated:** 2026-03-04

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) — per-tenant toggle stored on tenant config
- Requires: OPH-2 (Bestellungs-Upload) — triggers confirmation email on web upload
- Requires: OPH-4 (KI-Datenextraktion) — triggers results email when extraction completes
- Note: OPH-10 (E-Mail-Weiterleitungs-Ingestion) mentions a basic confirmation email — this feature formalizes and extends that behaviour for both upload paths

## Concept
When a tenant employee submits an order (via web upload or email forwarding), they receive two automated emails:

1. **Confirmation email** — sent immediately on receipt: "We got your order, it's being processed."
2. **Results email** — sent when extraction is complete: includes a human-readable summary of the extracted order data in the email body, plus a simple CSV attachment.

Both emails can be toggled on/off per tenant by a Platform Admin.

## User Stories
- As a tenant employee, I want to receive an immediate confirmation email after submitting an order, so that I know the system received it and processing has started.
- As a tenant employee, I want to receive a results email once the order has been extracted, so that I can see the structured data without having to log in to the platform first.
- As a tenant employee, I want the results email to include a simple CSV attachment of the extracted line items, so that I can quickly share or review the order data in a spreadsheet.
- As a tenant employee, I want the results email to contain a direct link to the order in the platform, so that I can jump straight to the review screen to correct or approve it.
- As a Platform Admin, I want to toggle the notification emails on or off for each tenant, so that customers who don't need email notifications aren't spammed.

## Acceptance Criteria

### Confirmation Email (sent immediately on order receipt)
- [ ] Triggered on successful order submission via web upload (OPH-2) and email forwarding (OPH-10)
- [ ] Recipient: the tenant employee who submitted the order (their logged-in email for web upload; the forwarding address for email ingestion)
- [ ] Email subject: `[Order received] – {original filename or email subject}`
- [ ] Email body contains: confirmation message, order ID, timestamp, and a link to the order in the platform
- [ ] Sent within 30 seconds of submission
- [ ] Not sent if the submission itself failed (e.g. invalid file type)

### Results Email (sent when extraction is complete)
- [ ] Triggered when OPH-4 extraction completes (success or partial success with warnings)
- [ ] Recipient: same as confirmation email
- [ ] Email subject: `[Order extracted] – {order number or filename}`
- [ ] Email body contains:
  - Dealer name (recognised or "Unknown")
  - Order number (if extracted)
  - Order date (if extracted)
  - Line items table: position, description, article number, quantity, unit, unit price
  - Total amount and currency (if extracted)
  - Any extraction warnings (e.g. fields with low confidence)
  - Link to the order in the platform for review/approval
- [ ] CSV attachment: `order_{order_id}_{date}.csv` with columns: Position, Article Number, Description, Quantity, Unit, Unit Price, Total Price, Currency
- [ ] CSV uses semicolon as delimiter and UTF-8 encoding
- [ ] If extraction failed entirely, results email is NOT sent; a failure notification is sent instead (see Edge Cases)

### Admin Toggle
- [ ] Platform Admin can enable/disable both notification emails per tenant in the Admin: Mandanten-Management (OPH-8) settings
- [ ] Toggle is a single on/off switch labelled "Order submission email notifications"
- [ ] Default for new tenants: **enabled**
- [ ] Disabling affects all future notifications immediately; in-flight emails are not cancelled
- [ ] Toggle state is visible to Tenant Admins (read-only) so they know whether notifications are active

## Edge Cases
- What happens if the extraction fails completely? → No results email is sent; instead, a failure notification email is sent: "Order processing failed. Please log in to review: [link]"
- What happens if the employee's email address is invalid or bounces? → Bounce is logged; no retry; Platform Admin can see delivery failures in a future notification log (Post-MVP)
- What happens if the tenant has notifications disabled but an employee submits an order? → No emails are sent; the order is still processed normally
- What happens if the same order is re-extracted (e.g. user clicks "Re-extract" in OPH-5)? → A new results email is sent with the updated data; the email subject includes "(updated)"
- What happens for large orders (100+ line items) in the results email? → Email body shows the first 20 line items + "and X more items"; CSV attachment always contains all line items
- What happens if the email delivery service is down? → Email is queued and retried up to 3 times over 10 minutes; after that, marked as failed and logged

## Technical Requirements
- Transactional email provider (e.g. Resend, Postmark, or SendGrid) — not Supabase Auth emails
- Email templates rendered server-side (React Email or plain HTML template)
- Notification toggle stored in `tenants` table as boolean column `email_notifications_enabled`
- CSV generated in-memory server-side from the canonical JSON — no storage required
- Emails triggered as async jobs after extraction completes (non-blocking for the main pipeline)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results

**Tested:** 2026-03-04
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Code review + build verification (no live Postmark integration testing)

### Acceptance Criteria Status

#### AC-1: Confirmation Email -- Triggered on Both Upload Paths
- [x] Web upload path: `sendOrderConfirmationEmail` called in `src/app/api/orders/upload/confirm/route.ts` (line 244) via `after()` callback
- [x] Email ingestion path: `sendConfirmationEmail` called in `src/app/api/inbound/email/route.ts` (line 447) via `after()` callback
- [x] Both paths are gated behind the `email_notifications_enabled` toggle and skip trial tenants (who have their own OPH-16 flow)

#### AC-2: Confirmation Email -- Recipient
- [x] Web upload: resolves submitter email from `user.id` via `adminClient.auth.admin.getUserById()` (line 236)
- [x] Email ingestion: sends to `senderEmail` (the forwarding address) -- correct per spec

#### AC-3: Confirmation Email -- Subject Format
- [ ] BUG: Spec requires `[Order received] -- {original filename or email subject}` but implementation uses two different formats:
  - Web upload: `[Bestellung empfangen] -- {fileName}` -- bracket format matches but German text, which is acceptable for a German product. PASS.
  - Email ingestion: `Bestellung empfangen: {subject}` -- uses colon instead of brackets. Inconsistent with web upload format. See BUG-1.

#### AC-4: Confirmation Email -- Body Content
- [ ] BUG: Spec requires body to contain: confirmation message, **order ID**, **timestamp**, and a link to the order.
  - Web upload (`sendOrderConfirmationEmail`): Body contains confirmation message and link, but is **missing order ID and timestamp**. See BUG-2.
  - Email ingestion (`sendConfirmationEmail`): Same issue -- missing order ID and timestamp.

#### AC-5: Confirmation Email -- Sent Within 30 Seconds
- [x] Both paths use `after()` which runs immediately after the response is sent. Postmark API call is direct HTTP, no queue delay. Should meet the 30-second requirement under normal conditions.

#### AC-6: Confirmation Email -- Not Sent on Failed Submission
- [x] Web upload: the confirmation email is only triggered after successful order creation, file record insertion, and dealer recognition. If any prior step fails, the route returns early with an error before reaching the email code.
- [x] Email ingestion: similarly gated -- email is sent only after successful order creation and file upload.

#### AC-7: Results Email -- Triggered on Extraction Complete
- [x] `sendOrderResultEmail` called in `src/app/api/orders/[orderId]/extract/route.ts` (line 620) after successful extraction, gated behind `email_notifications_enabled`.

#### AC-8: Results Email -- Recipient
- [x] For web uploads: resolves `uploaded_by` user's email via admin API. Falls back to `sender_email` if no user found.
- [x] For email ingestion: `sender_email` is available on the order record, used as fallback.

#### AC-9: Results Email -- Subject Format
- [x] Subject: `[Bestellung extrahiert] -- {orderNumber or orderId.slice(0,8)}{updatedSuffix}` -- matches spec pattern `[Order extracted] -- {order number or filename}` (German localized, acceptable).

#### AC-10: Results Email -- Body Content
- [x] Dealer name: included (`orderSummary.dealerName ?? "–"`)
- [x] Order number: included
- [x] Order date: included
- [x] Line items table with position, description, article number, quantity, unit, unit price: included
- [x] Total amount and currency: included
- [ ] BUG: **Missing extraction warnings / low confidence field indicators.** Spec requires "Any extraction warnings (e.g. fields with low confidence)" but the email template does not include any confidence data or warnings. See BUG-3.
- [x] Link to the order in the platform: included (`${siteUrl}/orders/${orderId}`)

#### AC-11: Results Email -- CSV Attachment
- [ ] BUG: CSV filename format mismatch. Spec requires `order_{order_id}_{date}.csv` but implementation uses `bestellung_{orderId.slice(0, 8)}_{csvDate}.csv`. The order ID is truncated to 8 chars and the prefix is in German. See BUG-4.
- [ ] BUG: CSV is missing the **Currency** column. Spec requires columns: Position, Article Number, Description, Quantity, Unit, Unit Price, Total Price, **Currency**. Implementation header: `Pos;Artikelnummer;Bezeichnung;Menge;Einheit;Einzelpreis;Gesamtpreis`. See BUG-5.

#### AC-12: Results Email -- CSV Format
- [x] Semicolon delimiter: confirmed in CSV generation code
- [x] UTF-8 encoding: `Buffer.from(csvContent, "utf-8")` confirmed

#### AC-13: Results Email -- Failure Notification
- [x] When extraction fails entirely, `sendOrderFailureEmail` is called (line 733 in extract route). Subject: `[Extraktion fehlgeschlagen] -- Bestellung`. Body contains link to order in platform.
- [x] Results email is NOT sent on total failure -- the code branches correctly between success and failure paths.

#### AC-14: Admin Toggle -- Platform Admin Can Enable/Disable
- [x] Toggle present in `src/components/admin/tenant-form-sheet.tsx` (lines 523-539) as a Switch component
- [x] Persisted via `email_notifications_enabled` field in the PATCH `/api/admin/tenants/[id]` endpoint
- [x] Validated by `updateTenantSchema` with `z.boolean().optional()`
- [x] Only Platform Admins can access the tenant management UI (guarded by `requirePlatformAdmin`)

#### AC-15: Admin Toggle -- Label
- [ ] BUG: Spec requires the label "Order submission email notifications" but the implementation uses "E-Mail-Benachrichtigungen" (German localized). This is a minor cosmetic difference -- the German label is appropriate for a German product but does not match the English spec text verbatim. See BUG-6.

#### AC-16: Admin Toggle -- Default for New Tenants
- [x] Database column: `email_notifications_enabled BOOLEAN NOT NULL DEFAULT true` (in migration 001). New tenants get `true` by default.
- [x] `createTenantSchema` does not include this field, so the DB default applies. Correct behavior.

#### AC-17: Admin Toggle -- Immediate Effect
- [x] The toggle is checked at runtime for each email send (not cached). Disabling immediately prevents future emails.
- [x] In-flight emails (already in `after()` callback) complete because `after()` has already captured the closure. This matches spec: "in-flight emails are not cancelled."

#### AC-18: Admin Toggle -- Visible to Tenant Admins (Read-Only)
- [x] Displayed in `/settings/data-protection` page with read-only text "Diese Einstellung wird von Ihrem Plattform-Administrator verwaltet."
- [x] Shows green "Aktiviert" / gray "Deaktiviert" badge based on the tenant's `email_notifications_enabled` value
- [x] Data fetched from `GET /api/settings/data-retention` which returns `emailNotificationsEnabled` field

### Edge Cases Status

#### EC-1: Extraction Fails Completely
- [x] Handled correctly: `sendOrderFailureEmail` is sent (for non-trial tenants with notifications enabled). Email body contains link to the order. Subject: `[Extraktion fehlgeschlagen] -- Bestellung`.

#### EC-2: Employee Email Invalid / Bounces
- [x] Acceptable for MVP: Postmark handles bounce notifications. The code logs send failures via `console.error`. No retry logic in application code. Post-MVP notification log mentioned in spec is acknowledged as future work.

#### EC-3: Tenant Has Notifications Disabled
- [x] Handled correctly: all three integration points check `email_notifications_enabled`:
  - Upload confirm route: checks tenant toggle, skips if disabled (line 230)
  - Extract route (success): checks tenant toggle, skips if disabled (line 567)
  - Extract route (failure): checks tenant toggle, skips if disabled (line 699)
  - Email ingestion: checks `isTrial || tenant.email_notifications_enabled` (line 441)

#### EC-4: Re-Extraction Sends Updated Email
- [x] Handled correctly: `isReExtraction` flag is set when `currentAttempts > 0` (line 578). The subject includes `(aktualisiert)` suffix. The email heading also includes the suffix.

#### EC-5: Large Orders (100+ Line Items)
- [x] Handled correctly: `MAX_ITEMS_IN_EMAIL = 20`. Email body shows first 20 items. Remaining items show as "... und {N} weitere Positionen (siehe CSV-Anhang)". CSV attachment always contains all line items.

#### EC-6: Email Delivery Service Down
- [ ] BUG: Spec requires "queued and retried up to 3 times over 10 minutes". The implementation has **no retry logic** -- it makes a single `fetch()` call to Postmark, and if it fails, it only logs the error. See BUG-7.

### Security Audit Results

- [x] **Authentication on admin toggle**: PATCH `/api/admin/tenants/[id]` requires `requirePlatformAdmin()` -- non-admins cannot change notification settings.
- [x] **Input validation**: `email_notifications_enabled` validated as `z.boolean().optional()` in `updateTenantSchema` -- cannot inject non-boolean values.
- [x] **No secret leakage**: `POSTMARK_SERVER_API_TOKEN` is a server-side env var, not prefixed with `NEXT_PUBLIC_`. It is not exposed to the client.
- [x] **XSS prevention in email templates**: All user-supplied values are escaped via the `esc()` function (HTML entity encoding for `&`, `<`, `>`, `"`).
- [x] **No cross-tenant data leakage**: Confirmation and result emails are sent to the order's own submitter/sender. Tenant isolation is maintained through `tenant_id` filtering.
- [x] **Non-blocking email sends**: All email sends use `after()` so failures do not block the main request pipeline.
- [x] **Env vars documented**: `POSTMARK_SERVER_API_TOKEN` and related vars are documented in `.env.local.example`.
- [ ] BUG: **Email ingestion confirmation sent without bracket format in subject** -- this is a functional inconsistency rather than a security issue but noted here for completeness.
- [x] **Rate limiting**: The admin PATCH endpoint uses `checkAdminRateLimit(user.id)` to prevent abuse.
- [x] **Timing-safe token comparison**: Internal extraction trigger uses `timingSafeEqual` for `CRON_SECRET` validation.

### Bugs Found

#### BUG-1: Inconsistent Confirmation Email Subject Between Upload Paths
- **Severity:** Low
- **Steps to Reproduce:**
  1. Submit an order via web upload -- confirmation email subject: `[Bestellung empfangen] -- filename.pdf`
  2. Submit an order via email forwarding -- confirmation email subject: `Bestellung empfangen: email subject`
  3. Expected: Both paths use the same bracket format `[Bestellung empfangen] -- {name}`
  4. Actual: Email ingestion path uses `Bestellung empfangen: {subject}` (colon, no brackets)
- **File:** `src/lib/postmark.ts` line 758 (sendConfirmationEmail) vs line 491 (sendOrderConfirmationEmail)
- **Priority:** Nice to have

#### BUG-2: Confirmation Email Missing Order ID and Timestamp
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Submit an order via web upload or email forwarding
  2. Receive the confirmation email
  3. Expected: Email body contains order ID and timestamp per spec
  4. Actual: Email body only contains confirmation message and link. No explicit order ID or timestamp displayed in the text.
- **File:** `src/lib/postmark.ts` lines 465-481 (sendOrderConfirmationEmail) and lines 733-749 (sendConfirmationEmail)
- **Priority:** Fix before deployment

#### BUG-3: Results Email Missing Extraction Warnings
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Upload an order that produces extraction warnings (e.g. low confidence fields)
  2. Wait for extraction to complete and receive the results email
  3. Expected: Email body includes "Any extraction warnings (e.g. fields with low confidence)" per spec
  4. Actual: The `sendOrderResultEmail` function does not accept or display any warning/confidence data. The extraction metadata (including `confidence_score`) is not passed to the email template.
- **File:** `src/lib/postmark.ts` (sendOrderResultEmail function) and `src/app/api/orders/[orderId]/extract/route.ts` (caller)
- **Priority:** Fix before deployment

#### BUG-4: CSV Attachment Filename Does Not Match Spec
- **Severity:** Low
- **Steps to Reproduce:**
  1. Receive a results email after extraction
  2. Check the CSV attachment filename
  3. Expected: `order_{order_id}_{date}.csv` (full UUID)
  4. Actual: `bestellung_{orderId.slice(0, 8)}_{csvDate}.csv` (truncated ID, German prefix)
- **File:** `src/lib/postmark.ts` line 643
- **Priority:** Nice to have (the truncated ID makes the filename shorter and more user-friendly, but differs from spec)

#### BUG-5: CSV Missing Currency Column
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Receive a results email after extraction
  2. Open the CSV attachment
  3. Expected: Columns include Currency as the 8th column per spec: Position, Article Number, Description, Quantity, Unit, Unit Price, Total Price, Currency
  4. Actual: CSV header is `Pos;Artikelnummer;Bezeichnung;Menge;Einheit;Einzelpreis;Gesamtpreis` -- Currency column is missing
- **File:** `src/app/api/orders/[orderId]/extract/route.ts` lines 580-592 (CSV generation for non-trial) and lines 525-537 (CSV generation for trial)
- **Priority:** Fix before deployment

#### BUG-6: Toggle Label Does Not Match Spec
- **Severity:** Low
- **Steps to Reproduce:**
  1. Open Admin > Mandanten-Management > Edit a tenant
  2. Look at the notification toggle label
  3. Expected: "Order submission email notifications" per spec
  4. Actual: "E-Mail-Benachrichtigungen" (German)
- **Note:** The German label is appropriate for a German product. This is a spec vs. implementation cosmetic difference.
- **File:** `src/components/admin/tenant-form-sheet.tsx` line 528
- **Priority:** Nice to have (spec may need to be updated to reflect German UI)

#### BUG-7: No Email Retry Logic on Delivery Failure
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Have Postmark API temporarily unavailable (e.g. network issue)
  2. Submit an order and trigger email send
  3. Expected: Email is queued and retried up to 3 times over 10 minutes per spec
  4. Actual: Single `fetch()` call to Postmark. If it fails, the error is logged but no retry is attempted. The email is permanently lost.
- **File:** All email send functions in `src/lib/postmark.ts` -- `sendOrderConfirmationEmail`, `sendOrderResultEmail`, `sendOrderFailureEmail`, `sendConfirmationEmail`
- **Priority:** Fix in next sprint (Postmark itself has some retry behavior on their end for transient server errors, but application-level retry would be more robust)

### Cross-Browser Testing
- Not applicable for this feature -- all functionality is server-side email sending and admin toggle UI. The admin toggle uses standard shadcn/ui `Switch` component which has cross-browser support built in. The read-only display in settings uses standard HTML elements.

### Responsive Testing
- [x] Admin toggle in tenant form sheet: The toggle is inside a flex container with `justify-between` and renders correctly at all viewport sizes within the Sheet component.
- [x] Settings read-only display: Card-based layout adapts to viewport width via shadcn/ui Card component.

### Summary
- **Acceptance Criteria:** 13/18 passed (5 failed: AC-3 partial, AC-4, AC-10 partial, AC-11, AC-15)
- **Edge Cases:** 5/6 passed (1 failed: EC-6 retry logic)
- **Bugs Found:** 7 total (0 critical, 0 high, 4 medium, 3 low)
- **Security:** Pass -- no security vulnerabilities found
- **Production Ready:** NO
- **Recommendation:** Fix the 4 medium-severity bugs (BUG-2, BUG-3, BUG-5, BUG-7) before deployment. The 3 low-severity bugs (BUG-1, BUG-4, BUG-6) can be addressed in a follow-up sprint.

### Note: INDEX.md Status Discrepancy
The feature is marked as "Planned" in `features/INDEX.md` but the implementation is clearly present and integrated across multiple files. The status should be updated to "In Review" to reflect the actual state.

## Deployment

**Deployed:** 2026-03-04
**Production URL:** https://ai-coding-starter-kit-nine.vercel.app
**Commit:** 21407b8
**Git Tag:** v1.13.0-OPH-13

### Deferred Bugs (tracked for next sprint)
- **BUG-3** (Medium): Results email missing extraction warnings — requires data model change to pass confidence metadata to email template
- **BUG-7** (Medium): No application-level retry logic — Postmark handles transient retries on their end; app-level retry planned for next sprint
