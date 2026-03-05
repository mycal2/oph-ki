# OPH-24: Platform Error Notification Emails

## Status: Planned
**Created:** 2026-03-05
**Last Updated:** 2026-03-05

## Dependencies
- Requires: OPH-13 (Order Submission Email Notifications) — Postmark email infrastructure already in place
- Requires: OPH-8 (Admin: Mandanten-Management) — admin backend patterns to follow
- Requires: OPH-4 (KI-Datenextraktion) — extraction errors to monitor
- Requires: OPH-10 (E-Mail-Weiterleitungs-Ingestion) — email ingestion errors to monitor
- Requires: OPH-6 (ERP-Export & Download) — export errors to monitor

---

## Problem Statement

When an extraction fails, the current system (OPH-13) only notifies the order submitter. Platform admins have no visibility into system errors unless they actively check the platform or a tenant reports the issue. This creates a monitoring blind spot — failed orders may go unnoticed, especially outside business hours.

This feature adds a platform-wide admin notification layer: a configurable list of up to 3 email addresses that receive an alert whenever any order processing step fails. The configuration is managed in the admin backend by platform admins only.

---

## User Stories

- As a platform admin, I want to receive an email when any order processing step fails, so I can proactively investigate issues without waiting for tenant reports.
- As a platform admin, I want to configure up to 3 email addresses that receive error notifications, so multiple team members can be alerted simultaneously.
- As a platform admin, I want the error notification email to include the tenant name, order ID, error type, and error message, so I can quickly diagnose and locate the problem.
- As a platform admin, I want to manage the notification email list in the admin backend (add, change, remove), so I can update recipients as the team changes without touching environment variables.
- As a platform admin, I want the system to work immediately after deployment with a default notification email pre-configured, so no errors are missed during the rollout.

---

## Acceptance Criteria

### Error Triggers — Admin Notification Sent For:
- [ ] **Extraction failure**: Claude API call fails, JSON parse error, extraction timeout, or any unhandled exception in the extract route
- [ ] **Email ingestion failure**: Inbound email arrives but processing fails (file parse error, unsupported format, no matching tenant, storage upload failure)
- [ ] **ERP export failure**: An order export fails to generate (template error, missing data, generation exception)

### Notification Email Content:
- [ ] Subject: `[Fehler] {error type} — {tenant name} / Order {short order ID}`
- [ ] Email body contains:
  - Error type (e.g. "Extraction Failed", "Email Ingestion Failed", "Export Failed")
  - Tenant name and tenant slug
  - Order ID (full UUID)
  - Error message or exception details (truncated to 500 chars if very long)
  - Timestamp (UTC)
  - Direct link to the order in the platform (`/orders/{orderId}`)
- [ ] Sent to **all** configured platform notification email addresses (1–3)
- [ ] Sent **in addition to** the existing per-tenant submitter failure email from OPH-13 (not a replacement)

### Admin Configuration:
- [ ] Platform admins can configure up to 3 platform notification email addresses in the admin backend
- [ ] Configuration is platform-wide — one shared list regardless of which tenant's order failed
- [ ] Each email field validates for proper email format before saving
- [ ] Empty/blank fields are ignored — not all 3 slots need to be filled
- [ ] Default value for slot 1 on first deployment: `michael.mollath@ids.online` (changeable at any time)
- [ ] Only platform admins can view and edit the notification email configuration
- [ ] Changes take effect immediately for all future error notifications (no restart required)

### Fallback / No-op Behavior:
- [ ] If no notification email addresses are configured, no admin email is sent — no error is thrown
- [ ] If a notification email send fails (Postmark error), the failure is logged but does not affect the main processing pipeline (non-blocking)
- [ ] The existing per-tenant submitter notification from OPH-13 continues to work independently

---

## Edge Cases

- **All 3 configured emails are invalid**: Individual Postmark delivery failures are logged; each address is attempted independently — one bad address does not prevent delivery to the others
- **Error occurs for a trial tenant**: Admin notification is still sent, even if the trial tenant's own notifications are disabled
- **Extraction retry loop**: If the same order fails multiple times in quick succession, send at most one admin notification per order per 5-minute window to avoid flooding the inbox
- **Email ingestion with no order ID yet**: If processing fails before an order record is created, the notification includes the inbound email subject/sender instead of an order link
- **Partial extraction failure (chunked Excel)**: If one chunk fails but others succeed, only a full failure triggers the admin notification — partial chunk retries are handled internally

---

## Technical Requirements

- Platform notification email list stored in the **database** (not environment variables) — must be editable via the admin UI without redeployment
- New database table or row in a `platform_settings` table: stores up to 3 email addresses as an array or 3 nullable columns
- Zod validation: each configured email must pass `z.string().email()` before persisting
- Maximum 3 notification email addresses enforced at API level
- Use existing **Postmark** infrastructure from OPH-13 (`src/lib/postmark.ts`) — new email template function `sendPlatformErrorNotification()`
- Admin UI: new "Notifications" or "System Settings" section in the admin backend
- Only accessible via `requirePlatformAdmin()` guard
- No changes to existing `email_notifications_enabled` per-tenant toggle behavior

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
