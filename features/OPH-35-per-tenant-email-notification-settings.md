# OPH-35: Per-Tenant Email Notification Settings

## Status: Deployed
**Created:** 2026-03-10
**Last Updated:** 2026-03-10

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) — tenant config stored per tenant
- Requires: OPH-13 (Order Submission Email Notifications) — extends and replaces the single master toggle
- Requires: OPH-9 (Admin: ERP-Mapping-Konfiguration) — tenant's configured output format used for attachment variant
- Requires: OPH-28 (Output Format Sample Upload) — tenant output format schema needed for attachment variant

## Concept
Currently, each tenant has a single boolean `email_notifications_enabled` that turns all automated emails on or off.
This feature replaces that single toggle with four granular, independently controllable switches, giving Platform Admins
fine-grained control over what each tenant receives.

The five toggles are:
- **a. Confirmation email** — sent immediately on order receipt ("Bestellung empfangen")
- **b. Results email** — sent when extraction completes, with structured order data
- **c. Results email attachment format** — when b is enabled: standard CSV vs. the tenant's configured ERP output format (XML, CSV, JSON, etc.)
- **d. Confidence score in results email** — when b is enabled: whether the overall extraction confidence score is shown in the results email body
- **e. Post-process** — placeholder toggle for a future post-processing step; visible in UI but has no backend effect yet

The existing `email_notifications_enabled` column is replaced by these five new fields.

## User Stories

1. As a Platform Admin, I want to enable or disable the confirmation email per tenant, so that tenants who only care about extraction results aren't notified twice.
2. As a Platform Admin, I want to enable or disable the results email per tenant, so that tenants who prefer to work solely inside the platform aren't sent emails they don't need.
3. As a Platform Admin, I want to choose whether the results email attachment uses standard CSV or the tenant's own configured ERP format, so that tenants receive extraction results in the format their ERP system can directly import.
4. As a Platform Admin, I want to control whether the extraction confidence score is shown in the results email, so that tenants who find it confusing can receive a cleaner email.
5. As a Platform Admin, I want a post-process toggle I can enable per tenant today, so that when the post-process feature is defined and built, it is already configured for the tenants who need it.
6. As a Tenant Admin, I want to see (read-only) which email notifications are active for my tenant, so that I can tell my team what to expect after submitting an order.

## Acceptance Criteria

### AC-1: Granular toggles replace master toggle
- [ ] The single `email_notifications_enabled` field is retired and replaced by five new per-tenant fields:
  - `email_confirmation_enabled` (boolean, default: true)
  - `email_results_enabled` (boolean, default: true)
  - `email_results_format` (enum: `"standard_csv"` | `"tenant_format"`, default: `"standard_csv"`)
  - `email_results_confidence_enabled` (boolean, default: true)
  - `email_postprocess_enabled` (boolean, default: false)
- [ ] All existing email-sending code that currently checks `email_notifications_enabled` is updated to check the relevant new field

### AC-2: Confirmation email toggle (a)
- [ ] When `email_confirmation_enabled` is false, the confirmation email is NOT sent for that tenant (neither web upload nor email ingestion paths)
- [ ] When `email_confirmation_enabled` is true, behaviour is unchanged from the current deployed OPH-13 implementation

### AC-3: Results email toggle (b)
- [ ] When `email_results_enabled` is false, the results email (success, failure, re-extraction) is NOT sent for that tenant
- [ ] When `email_results_enabled` is true, behaviour is unchanged from the current deployed OPH-13 implementation

### AC-4: Results email attachment format toggle (c)
- [ ] Toggle (c) is only meaningful when toggle (b) is enabled; when (b) is off, (c) has no effect
- [ ] When format is `"standard_csv"`: the results email includes the standard semicolon-delimited CSV attachment (existing behaviour)
- [ ] When format is `"tenant_format"` AND the tenant has a configured ERP output format (via OPH-9/OPH-28): the results email attachment is generated using the tenant's ERP mapping config instead of the standard CSV
  - Format type (CSV, XML, JSON) and column mapping follow the tenant's ERP config
  - Attachment filename reflects the output type (e.g. `bestellung_XXXXXX.xml`)
- [ ] When format is `"tenant_format"` AND the tenant has NO configured ERP output format: fall back to the standard CSV attachment (same as `"standard_csv"` mode) — no email is withheld
- [ ] The fallback to CSV is silent (no error notification)

### AC-5: Confidence score toggle (d)
- [ ] When `email_results_confidence_enabled` is true AND `email_results_enabled` is true: the results email body includes the overall extraction confidence score (e.g. "Konfidenz: 94 %")
- [ ] When `email_results_confidence_enabled` is false: the confidence score is omitted from the results email body entirely — no placeholder, no mention
- [ ] Toggle d is only meaningful when toggle b is enabled; when b is off, d has no effect
- [ ] Default for new tenants: **enabled** (confidence score shown by default)
- [ ] Existing tenants migrated from `email_notifications_enabled = true` get `email_results_confidence_enabled = true`

### AC-6: Post-process toggle (e)
- [ ] Toggle `email_postprocess_enabled` is visible and editable in the admin UI
- [ ] Setting this toggle has no backend effect in this feature — it is stored in the database only
- [ ] The UI labels the toggle clearly as a future feature placeholder (e.g. "Nachbearbeitung (in Vorbereitung)")
- [ ] No error or warning is thrown if this toggle is true at runtime

### AC-7: Admin UI — Platform Admin
- [ ] All five toggles are displayed in the tenant edit form (Admin > Mandanten > Edit)
- [ ] Toggles a, b, d, e are standard on/off switches
- [ ] Toggle c is shown as a two-option selector (Standard CSV / Mandanten-Format) and is visually disabled / grayed out when toggle b is off
- [ ] Toggle d is visually disabled / grayed out when toggle b is off
- [ ] Toggle e is shown with a label indicating it is reserved for future use
- [ ] Changes take effect immediately for all future emails (no restart required)

### AC-8: Tenant settings read-only view
- [ ] The tenant's own settings page (e.g. `/settings/data-protection` or equivalent) shows the current state of all five toggles as read-only
- [ ] Text reads: "Diese Einstellung wird von Ihrem Plattform-Administrator verwaltet."
- [ ] The post-process toggle is shown with the same "in Vorbereitung" label

### AC-9: Migration — existing tenants
- [ ] Existing tenants with `email_notifications_enabled = true` are migrated to: `email_confirmation_enabled = true`, `email_results_enabled = true`, `email_results_format = 'standard_csv'`, `email_results_confidence_enabled = true`, `email_postprocess_enabled = false`
- [ ] Existing tenants with `email_notifications_enabled = false` are migrated to: `email_confirmation_enabled = false`, `email_results_enabled = false`, `email_results_format = 'standard_csv'`, `email_results_confidence_enabled = true`, `email_postprocess_enabled = false`
- [ ] The `email_notifications_enabled` column is removed after migration

### AC-9: Validation
- [ ] `email_results_format` only accepts values `"standard_csv"` or `"tenant_format"`; invalid values are rejected with a 400 error
- [ ] All four fields are optional in the PATCH payload; omitting a field leaves it unchanged

## Edge Cases

- **Tenant format not configured, toggle set to `tenant_format`:** Fall back to standard CSV silently. Do not block the email.
- **Toggle (b) off, toggle (c) set to `tenant_format`:** No results email sent. Toggle c has no effect. No error.
- **Toggle (d) on:** Stored in DB, no backend action triggered. Future feature will read this flag.
- **Mid-extraction toggle change:** The toggle is checked at send time (inside the `after()` callback), so a toggle change during an in-progress extraction takes effect for that extraction's email.
- **ERP config deleted after toggle (c) set to `tenant_format`:** Falls back to CSV at send time. The stored toggle value remains unchanged.
- **New tenant created:** All four fields apply the database defaults (`email_confirmation_enabled = true`, `email_results_enabled = true`, `email_results_format = 'standard_csv'`, `email_postprocess_enabled = false`).

## Technical Notes (for Architecture)
- Database: Add four new columns to `tenants`, remove `email_notifications_enabled`
- A migration is needed: read old column, write new columns, drop old column
- Backend: Update all `email_notifications_enabled` references in:
  - `src/app/api/orders/upload/confirm/route.ts`
  - `src/app/api/orders/[orderId]/extract/route.ts`
  - `src/app/api/inbound/email/route.ts`
  - `src/lib/postmark.ts`
- For `tenant_format` attachment: the extract route must call the ERP config export logic (reuse from OPH-6/OPH-9) and attach the output instead of the standard CSV
- Validation: extend `updateTenantSchema` in `src/lib/validations.ts`
- Read-only display: extend the tenant settings page

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

```
Admin > Mandanten > Edit (existing: tenant-form-sheet.tsx)
+-- [UPDATE] E-Mail-Benachrichtigungen Section
|   +-- Toggle a: Bestätigungs-E-Mail (on/off switch)
|   +-- Toggle b: Ergebnis-E-Mail (on/off switch)
|   +-- Toggle c: Anhang-Format (two-option selector, disabled when b is off)
|   |   +-- Option 1: Standard CSV
|   |   +-- Option 2: Mandanten-Format (XML/CSV/JSON per ERP config)
|   +-- Toggle d: Konfidenz-Score (on/off switch, disabled when b is off)
|   +-- Toggle e: Nachbearbeitung (on/off, labeled "in Vorbereitung")

Tenant Settings Page (existing: /settings/data-protection/)
+-- [UPDATE] E-Mail-Benachrichtigungen Section (read-only)
|   +-- Read-only row: Bestätigungs-E-Mail — Aktiv / Inaktiv
|   +-- Read-only row: Ergebnis-E-Mail — Aktiv / Inaktiv
|   +-- Read-only row: Anhang-Format — Standard CSV / Mandanten-Format
|   +-- Read-only row: Konfidenz-Score — Aktiv / Inaktiv
|   +-- Read-only row: Nachbearbeitung — Aktiv / Inaktiv (in Vorbereitung)
|   +-- Note: "Diese Einstellung wird von Ihrem Plattform-Administrator verwaltet."
```

### Data Model

Changes to the `tenants` database table — the old field is replaced by five new ones:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `email_notifications_enabled` | ~~removed~~ | — | Replaced by the five fields below |
| `email_confirmation_enabled` | boolean | true | Send confirmation email on receipt |
| `email_results_enabled` | boolean | true | Send results email after extraction |
| `email_results_format` | enum (`standard_csv` / `tenant_format`) | `standard_csv` | Attachment format for results email |
| `email_results_confidence_enabled` | boolean | true | Show confidence score in results email body |
| `email_postprocess_enabled` | boolean | false | Post-process placeholder (no effect yet) |

**One-time migration:**
- Old `= true` → confirmation ✅, results ✅, format: `standard_csv`, confidence ✅, postprocess ❌
- Old `= false` → confirmation ❌, results ❌, format: `standard_csv`, confidence ✅, postprocess ❌

### Backend Touch Points (no new API routes)

| File | Change |
|------|--------|
| Database migration | Add 5 columns, migrate from old column, drop old column |
| `tenant-form-sheet.tsx` | Replace single toggle with five-control section |
| `/settings/data-protection` page | Extend read-only section with five status rows |
| `settings/data-retention` API | Return five new fields instead of old single field |
| `admin/tenants/[id]` PATCH | Accept and validate the five new fields |
| `validations.ts` | Replace old boolean with five validated fields |
| `types.ts` | Update Tenant type |
| `upload/confirm` route | Check `email_confirmation_enabled` |
| `extract` route | Check `email_results_enabled`; switch attachment to ERP format when `tenant_format` |
| `inbound/email` route | Check `email_confirmation_enabled` |

### Tech Decisions

- **No new API routes** — all changes flow through the existing tenant PATCH endpoint.
- **Attachment format reuses existing ERP export engine** — the export logic from OPH-6/OPH-9 already generates XML/CSV/JSON; toggle c just routes the results email to use it.
- **Toggle c is disabled in UI when toggle b is off** — prevents confusing configuration state without adding backend validation complexity.
- **Toggle d is disabled in UI when toggle b is off** — confidence score is only relevant when results email is active.
- **Post-process toggle is backend-inert** — stored in DB, returned in API, but no email code reads it until the post-process feature is defined.
- **No new packages needed** — shadcn/ui Switch and RadioGroup are already installed.

### Deployment Order
1. Run database migration (add new columns with defaults, migrate data, drop old column)
2. Deploy backend code changes (API, validation, email routes)
3. Deploy frontend changes (admin form, settings read-only view)

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
