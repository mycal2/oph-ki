# OPH-13: Order Submission Email Notifications

## Status: Planned
**Created:** 2026-02-27
**Last Updated:** 2026-02-27

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
_To be added by /qa_

## Deployment
_To be added by /deploy_
