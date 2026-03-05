# OPH-24: Platform Error Notification Emails

## Status: In Review
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
- [x] **Extraction failure**: Claude API call fails, JSON parse error, extraction timeout, or any unhandled exception in the extract route
- [x] **Email ingestion failure**: Inbound email arrives but processing fails (file parse error, unsupported format, no matching tenant, storage upload failure)
- [x] **ERP export failure**: An order export fails to generate (template error, missing data, generation exception)

### Notification Email Content:
- [x] Subject: `[Fehler] {error type} — {tenant name} / Order {short order ID}`
- [x] Email body contains:
  - Error type (e.g. "Extraction Failed", "Email Ingestion Failed", "Export Failed")
  - Tenant name and tenant slug
  - Order ID (full UUID)
  - Error message or exception details (truncated to 500 chars if very long)
  - Timestamp (UTC)
  - Direct link to the order in the platform (`/orders/{orderId}`)
- [x] Sent to **all** configured platform notification email addresses (1–3)
- [x] Sent **in addition to** the existing per-tenant submitter failure email from OPH-13 (not a replacement)

### Admin Configuration:
- [x] Platform admins can configure up to 3 platform notification email addresses in the admin backend
- [x] Configuration is platform-wide — one shared list regardless of which tenant's order failed
- [x] Each email field validates for proper email format before saving
- [x] Empty/blank fields are ignored — not all 3 slots need to be filled
- [x] Default value for slot 1 on first deployment: `michael.mollath@ids.online` (changeable at any time)
- [x] Only platform admins can view and edit the notification email configuration
- [x] Changes take effect immediately for all future error notifications (no restart required)

### Fallback / No-op Behavior:
- [x] If no notification email addresses are configured, no admin email is sent — no error is thrown
- [x] If a notification email send fails (Postmark error), the failure is logged but does not affect the main processing pipeline (non-blocking)
- [x] The existing per-tenant submitter notification from OPH-13 continues to work independently

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

### Component Structure

```
Admin Settings Page  (/admin/settings)          ← new page
+-- Page Header ("Platform-Einstellungen")
+-- Error Notifications Card
    +-- Card title + description text
    +-- Email Field 1  (pre-filled: michael.mollath@ids.online)
    +-- Email Field 2  (optional)
    +-- Email Field 3  (optional)
    +-- Save Button
    +-- Toast feedback (success / validation error)

Top Navigation                                  ← existing, +1 link
+-- Händler-Profile    /admin/dealers
+-- Mandanten          /admin/tenants
+-- ERP-Mapping        /admin/erp-configs
+-- E-Mail-Quarantäne  /admin/email-quarantine
+-- Einstellungen      /admin/settings          ← NEW
```

### Data Model

**New table: `platform_settings`** — singleton, always exactly one row.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | Always `'singleton'` |
| `error_notification_emails` | text[] | Up to 3 email addresses |
| `updated_at` | timestamp | Last change time |
| `updated_by` | uuid | Admin user who last saved |

Seeded in the migration with `michael.mollath@ids.online` as the default first recipient.

**Why a singleton table?** One set of global settings for the whole platform — no per-tenant variation. Future platform-wide settings can be added as columns without schema changes.

**Why `text[]` (array) instead of 3 separate columns?** Cleaner to query, cleaner to update, and trivially extensible if a 4th address is needed later.

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/settings/notifications` | GET | Returns current notification email list |
| `/api/admin/settings/notifications` | PUT | Saves updated list (validates email format, max 3, admin-only) |

Both routes protected by the existing `requirePlatformAdmin()` guard — same pattern as all other `/api/admin/` routes.

### Email Function

New function `sendPlatformErrorNotification()` added to the existing `src/lib/postmark.ts`:
- Fetches notification email list from the DB at call time — not cached, so UI changes take effect immediately
- Sends independently to each configured address — one delivery failure does not block the others
- Non-blocking: exceptions are logged, never thrown upward to disrupt the processing pipeline

### Error Trigger Wiring

| File | What changes |
|------|-------------|
| `src/app/api/orders/[orderId]/extract/route.ts` | Call `sendPlatformErrorNotification()` on final extraction failure |
| `src/app/api/inbound/email/route.ts` | Call `sendPlatformErrorNotification()` on any processing exception |
| `src/app/api/orders/[orderId]/export/route.ts` | Call `sendPlatformErrorNotification()` on export generation failure |

Notification fires **only after all retries are exhausted** — not on each retry attempt. No deduplication column needed.

### Dependencies

No new packages required. All infrastructure already installed:
- **Postmark** (`src/lib/postmark.ts`) — email sending
- **Zod** — email validation
- **shadcn/ui** `Input`, `Card`, `Button` — admin form UI

## QA Test Results

**Tested by:** QA Skill (Claude Opus 4.6)
**Date:** 2026-03-05
**Status:** PASS with findings (4 bugs, 2 security notes)

---

### 1. Acceptance Criteria Verification

#### Error Triggers -- Admin Notification Sent For:

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Extraction failure triggers notification | **PASS** | `extract/route.ts` lines 756-782: `sendPlatformErrorNotification()` called in the extraction catch block via `after()`. Fires on any unhandled exception including Claude API failures, JSON parse errors, and timeouts. |
| 2 | Email ingestion failure triggers notification | **PASS** | `inbound/email/route.ts` lines 556-577: Notification fires in the outer catch block on any unhandled exception. Covers file parse, storage, and processing errors. |
| 3 | ERP export failure triggers notification | **PASS** | `export/route.ts` lines 308-354: Notification fires in the outer catch block. Covers template errors, generation exceptions, and unexpected failures. |

#### Notification Email Content:

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 4 | Subject format `[Fehler] {type} -- {tenant} / Order {short ID}` | **PASS** | `postmark.ts` line 824: Subject constructed as `[Fehler] ${errorType} -- ${tenantDisplay} / Order ${shortOrderId}`. Matches spec exactly. |
| 5a | Body: Error type | **PASS** | Included in HTML heading and text body. |
| 5b | Body: Tenant name and slug | **PASS** | Both shown in the table. Slug shown in parentheses when available. |
| 5c | Body: Order ID (full UUID) | **PASS** | Full UUID shown in the table row at line 846. |
| 5d | Body: Error message truncated to 500 chars | **PASS** | Lines 818-820: explicit truncation with `"..."` suffix. |
| 5e | Body: Timestamp (UTC) | **PASS** | Line 825: `new Date().toISOString()` produces UTC. |
| 5f | Body: Direct link to order | **PASS** | Line 826: `orderUrl` constructed with orderId. Link rendered as a button when orderId is available, omitted when null. |
| 6 | Sent to all configured emails (1-3) | **PASS** | Lines 854-866: `Promise.all()` sends to each email independently. Individual `.catch()` ensures one failure does not block others. |
| 7 | Sent in addition to OPH-13 submitter email | **PASS** | Extract route: OPH-13 failure emails (lines 672-753) fire separately from OPH-24 (lines 756-782). Both use independent `after()` blocks. Inbound email route: OPH-24 fires in the outer catch which is separate from OPH-13 confirmation. Export route: no OPH-13 emails are sent on export, only OPH-24. |

#### Admin Configuration:

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 8 | Up to 3 emails configurable in admin backend | **PASS** | UI at `admin/settings/page.tsx` allows adding up to 3 fields (`MAX_EMAILS = 3`). API enforces max 3 at line 79. Zod schema also enforces `.max(3)`. |
| 9 | Platform-wide (not per-tenant) | **PASS** | `platform_settings` is a singleton table (PK constraint `CHECK (id = 'singleton')`). No tenant_id column. |
| 10 | Email format validation before saving | **PASS** | Zod schema uses `z.string().trim().email()`. Client also validates with regex before submit. |
| 11 | Empty/blank fields ignored | **PASS** | API route line 77 filters empty strings. Client line 87 also filters before sending. |
| 12 | Default value `michael.mollath@ids.online` on first deployment | **PASS** | Migration line 16-17: `INSERT INTO platform_settings ... VALUES ('singleton', ARRAY['michael.mollath@ids.online'])`. |
| 13 | Only platform admins can view/edit | **PASS** | Both GET and PUT use `requirePlatformAdmin()`. RLS policies restrict SELECT and UPDATE to `platform_admin` role. UI checks `isPlatformAdmin` and shows access-denied message. |
| 14 | Changes take effect immediately | **PASS** | `sendPlatformErrorNotification()` fetches emails from DB at call time (line 805-809). No caching. |

#### Fallback / No-op Behavior:

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 15 | No emails configured -> no send, no error | **PASS** | `postmark.ts` line 812: early return if `emails.length === 0`. |
| 16 | Send failure is non-blocking | **PASS** | Entire function wrapped in try/catch at line 803/867-870. Individual email sends have `.catch()`. |
| 17 | OPH-13 continues independently | **PASS** | OPH-13 code paths are not modified. OPH-24 is an additive layer in separate code blocks. |

---

### 2. Bugs Found

#### BUG-1: Zod schema rejects empty strings, but spec says empty fields should be ignored [LOW]

**Severity:** Low
**Priority:** P3
**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/validations.ts` lines 654-663

**Description:** The Zod schema `updateNotificationEmailsSchema` validates each array element with `.email()`, which rejects empty strings. If a client sends `{ emails: ["valid@test.com", ""] }`, Zod returns a 400 error instead of silently ignoring the empty string.

**Impact:** The admin UI already filters empty strings before sending (line 87 of the settings page), so the primary UI is unaffected. However, a direct API call with empty strings in the array would receive a 400 error instead of the expected behavior of "empty fields are ignored."

**Steps to Reproduce:**
1. Send PUT to `/api/admin/settings/notifications` with body `{ "emails": ["admin@test.com", ""] }`
2. Observe 400 error: "Bitte geben Sie eine gueltige E-Mail-Adresse ein."

**Expected:** Empty strings should be silently filtered, saving only `["admin@test.com"]`.

**Fix suggestion:** Use a Zod `.preprocess()` or `.transform()` step before `.email()` to filter empty strings, or accept `z.union([z.literal(""), z.string().email()])` and filter post-validation (which the route already does at line 77).

---

#### BUG-2: Export route uses `await params` in catch block -- may throw if params itself caused the error [LOW]

**Severity:** Low
**Priority:** P3
**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/export/route.ts` line 318

**Description:** In the catch block of the export route, `const { orderId: errorOrderId } = await params;` is called. If the original error was caused by the `params` promise itself (e.g., a framework-level error), this `await` could also throw, which is caught by the inner try/catch at line 314. This is handled safely but would result in the notification being sent with `orderId: null` and `tenantName: null`, losing context.

**Impact:** Edge case only. In practice, `params` is a Next.js-provided promise that is unlikely to throw. The inner try/catch ensures no crash.

**Steps to Reproduce:** Difficult to reproduce in practice; would require a framework-level failure.

---

#### BUG-3: Inbound email error notification is synchronous (not wrapped in `after()`) [MEDIUM]

**Severity:** Medium
**Priority:** P2
**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/inbound/email/route.ts` lines 562-576

**Description:** In the inbound email catch block, `sendPlatformErrorNotification()` is called with `await` directly, NOT wrapped in `after()` like it is in the extract route. The `sendPlatformErrorNotification` function internally fetches emails from the DB and then sends via Postmark with retry logic (up to 3 attempts with exponential backoff starting at 2000ms). This means the error response could be delayed by up to ~14 seconds (2s + 4s + 8s) if Postmark is having issues.

**Impact:** Postmark webhook responses should be fast. If Postmark's timeout for inbound webhook responses is hit, it would retry the webhook, potentially causing duplicate processing. The route does return 200 eventually (preventing retry loops), but the delay could cause operational issues.

**Steps to Reproduce:**
1. Trigger an unhandled exception in the inbound email route
2. Have Postmark API be slow or return 5xx errors
3. Observe the response is delayed by the full retry cycle

**Fix suggestion:** Wrap the `sendPlatformErrorNotification` call in `after()` or use a fire-and-forget pattern (no `await`), matching the pattern used in the extract route.

---

#### BUG-4: Missing 5-minute deduplication for extraction retry notifications [MEDIUM]

**Severity:** Medium
**Priority:** P2
**Files:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/extract/route.ts`, `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/postmark.ts`

**Description:** The feature spec's Edge Cases section states: "Extraction retry loop: If the same order fails multiple times in quick succession, send at most one admin notification per order per 5-minute window to avoid flooding the inbox." This deduplication is not implemented anywhere. The extract route can be called up to 5 times (MAX_EXTRACTION_ATTEMPTS), and each failure will trigger a separate admin notification email.

**Impact:** If a user rapidly retries extraction for a failing order, admins could receive up to 5 identical error emails in quick succession. While not a security issue, it degrades the admin experience and could lead to notification fatigue.

**Steps to Reproduce:**
1. Upload a file that consistently fails extraction
2. Trigger extraction 5 times within 5 minutes
3. Observe 5 separate admin notification emails

**Fix suggestion:** Add an in-memory or DB-based deduplication check in `sendPlatformErrorNotification()` keyed on `orderId + errorType` with a 5-minute window.

---

### 3. Security Audit

#### SEC-1: RLS Policies -- PASS

The migration at `/Users/michaelmollath/projects/ai-coding-starter-kit/supabase/migrations/022_oph24_platform_error_notifications.sql` correctly:
- Enables RLS on `platform_settings` (line 20)
- Creates SELECT policy restricted to `platform_admin` (lines 23-27)
- Creates UPDATE policy with both USING and WITH CHECK clauses for `platform_admin` (lines 29-36)
- Does NOT create INSERT or DELETE policies (correct -- the singleton row is migration-seeded)
- Service role (used by `adminClient`) bypasses RLS for internal reads in `sendPlatformErrorNotification()`

**Note:** The singleton CHECK constraint (`id = 'singleton'`) prevents insertion of additional rows even if someone could bypass RLS. Good defense-in-depth.

#### SEC-2: Auth Guards -- PASS

- GET route uses `requirePlatformAdmin()` (verified in `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/admin-auth.ts`)
- PUT route uses `requirePlatformAdmin()` + `checkAdminRateLimit()`
- The `requirePlatformAdmin()` function verifies `app_metadata.role === 'platform_admin'` and checks for inactive accounts
- UI page checks `isPlatformAdmin` from the `useCurrentUserRole` hook

#### SEC-3: Input Validation -- PASS

- Server-side Zod validation with `.email()` on all submitted email addresses
- Max 3 enforced at both Zod schema level and route level (line 79 of notifications route)
- Empty strings filtered and deduplication applied (line 77 of notifications route)
- Request body JSON parse wrapped in try/catch (lines 58-65)

#### SEC-4: XSS in Email Content -- PASS

The `esc()` helper function (`postmark.ts` line 199) properly escapes `&`, `<`, `>`, and `"` in all user-controlled values before embedding in HTML email content. All dynamic values (errorType, tenantDisplay, tenantSlug, orderId, truncatedError, timestamp) are passed through `esc()`.

#### SEC-5: Information Leakage in Error Notifications -- NOTE (Informational)

**Severity:** Informational
**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/postmark.ts` lines 817-820

Error messages are truncated to 500 characters but not sanitized for sensitive content. If an error message contains database connection strings, API keys in error traces, or internal paths, those would be included in the notification email sent via Postmark.

**Mitigation:** The emails are sent only to configured platform admin addresses, not to end users. The truncation at 500 chars limits exposure. Postmark uses TLS in transit. Risk is acceptable given the admin-only audience.

#### SEC-6: No INSERT/DELETE RLS Policies -- PASS (by design)

The `platform_settings` table has no INSERT or DELETE policies. This means:
- Regular users (including platform admins via RLS-scoped clients) cannot insert new rows or delete the singleton
- The service role client bypasses RLS and can still read for notifications
- This is correct behavior -- the table should never have more than one row

---

### 4. Integration Check

#### Extract Route Integration -- PASS

**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/extract/route.ts`
- Import at line 13: `sendPlatformErrorNotification` properly imported from `@/lib/postmark`
- Call at lines 756-782: Wrapped in `after()` for non-blocking execution
- Passes `failureApiToken` (from `process.env.POSTMARK_SERVER_API_TOKEN`), `adminClient`, `errorType: "Extraktion fehlgeschlagen"`, tenant info (fetched from DB), orderId, and error message
- Gate: only fires when `failureApiToken && tenantId` are both truthy
- Correctly positioned after the OPH-13/OPH-16 failure email block (additive, not replacement)

#### Inbound Email Route Integration -- PASS (with BUG-3 above)

**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/inbound/email/route.ts`
- Import at line 12: `sendPlatformErrorNotification` properly imported
- Call at lines 562-576: In the outer catch block
- Passes null for tenantName, tenantSlug, and orderId (correct -- the error occurred before these were resolved)
- Creates a fresh `adminClient` for the notification (correct -- the original may not exist at this point)
- **Issue:** Not wrapped in `after()` -- see BUG-3

#### Export Route Integration -- PASS

**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/export/route.ts`
- Import at line 15: `sendPlatformErrorNotification` properly imported
- Call at lines 308-354: In the outer catch block with inner try/catch for safety
- Attempts to resolve tenant info from the orderId for richer context
- Uses `await` (not `after()`) -- acceptable here because the export route is a user-initiated GET request, not a webhook that needs fast response
- Falls back gracefully if params or tenant lookup fails

#### Navigation Link -- PASS

**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/layout/top-navigation.tsx`
- Line 36: `{ href: "/admin/settings", label: "Einstellungen", adminOnly: true }` added
- `adminOnly: true` correctly gates visibility behind `isPlatformAdmin`
- Positioned after "E-Mail-Quarantaene" as specified in the tech design

---

### 5. Edge Case Analysis

| Edge Case | Covered? | Notes |
|-----------|----------|-------|
| All 3 emails invalid | **PASS** | Each email sent independently with `.catch()` |
| Error for trial tenant | **PASS** | Extract route fires OPH-24 when `failureApiToken && tenantId` -- no check on tenant.status for the admin notification. Trial tenants still trigger it. |
| 5-minute dedup for retries | **FAIL** | Not implemented. See BUG-4. |
| Ingestion with no order ID | **PASS** | Inbound email catch passes `orderId: null`, notification shows "-" for order and omits the link button |
| Partial chunked extraction | **Not testable** | Chunked extraction (OPH-23) handles chunk-level retries internally. OPH-24 only fires on the outer catch, which is the full-failure case. Likely correct but not directly verified. |

---

### 6. Cross-Browser & Responsive (UI Page)

The admin settings page at `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/(protected)/admin/settings/page.tsx` uses standard shadcn/ui components (Card, Input, Button, Label, Alert, Skeleton) and Tailwind classes. No custom CSS or browser-specific code.

| Aspect | Assessment |
|--------|------------|
| Chrome / Firefox / Safari | **Expected PASS** -- uses standard form elements and flex layout only |
| 375px (mobile) | **Expected PASS** -- `max-w-md` on inputs constrains width; `space-y-*` stacks vertically |
| 768px (tablet) | **Expected PASS** -- no breakpoint-specific layout; scales naturally |
| 1440px (desktop) | **Expected PASS** -- card and inputs stay at `max-w-md` width, page content uses `space-y-6` |
| Accessibility | **PASS** -- `aria-label` on each input field and remove button |

*Note: Full browser testing not performed (no browser automation available). Assessment based on code review of standard component usage.*

---

### 7. Regression Check

Verified against `features/INDEX.md` -- no regressions expected:
- **OPH-13 (Notifications):** OPH-24 is additive. OPH-13 code paths are untouched. Verified by reviewing extract route -- OPH-13 failure emails fire in their own block before OPH-24.
- **OPH-4 (Extraction):** The extract route only adds an `after()` block in the catch path. Success path is unchanged.
- **OPH-10 (Email Ingestion):** Only the outer catch block is modified. All normal-flow code is unchanged.
- **OPH-6 (Export):** Only the outer catch block is modified. Normal export flow is unchanged.
- **OPH-8 (Admin Management):** No changes to admin tenant management routes.
- **TypeScript:** `tsc --noEmit` passes with zero errors.

---

### 8. Summary

| Category | Result |
|----------|--------|
| Acceptance Criteria (17 total) | **16 PASS, 1 PARTIAL** (dedup not implemented) |
| Bugs Found | 4 (0 Critical, 2 Medium, 2 Low) |
| Security Findings | 0 Critical, 0 High, 1 Informational |
| TypeScript Build | PASS |
| Regression Risk | Low |

**Recommendation:** The feature is functionally complete and well-implemented. Address BUG-3 (synchronous notification in inbound email) before deployment to avoid webhook timeout risks. BUG-4 (missing dedup) is a documented edge case that should be tracked but is not a blocker for initial deployment. BUG-1 and BUG-2 are minor polish items.

## Deployment
_To be added by /deploy_
