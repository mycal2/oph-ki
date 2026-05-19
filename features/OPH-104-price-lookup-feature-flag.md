# OPH-104: Tenant Price Lookup Feature Flag

## Status: In Review
**Created:** 2026-05-17
**Last Updated:** 2026-05-17

## Dependencies
- OPH-8 (Admin: Mandanten-Management) — flag lives on the tenant record
- OPH-42 (Admin Tenant Detail Page) — toggle surface in admin UI

## Background

Price lookup (OPH-106–109) is a paid add-on service. Before any discount-rate functionality is visible to a tenant, a platform admin must explicitly enable it on that tenant. Tenants with the flag disabled see no discount-related UI and the extraction pipeline skips the price-lookup step entirely.

## User Stories

- As a platform admin, I want to enable the price lookup add-on for a specific tenant so that their team can manage customer discount rates.
- As a platform admin, I want to disable the price lookup add-on for a tenant so that the feature is hidden and extraction skips the lookup.
- As a tenant admin, I want to see clearly whether price lookup is active on my account so I know whether discount rates will be applied during extraction.

## Acceptance Criteria

- [ ] The `tenants` table has a `price_lookup_enabled` boolean column (default: `false`).
- [ ] The platform admin tenant detail page (OPH-42) shows a "Price Lookup" toggle with the current state.
- [ ] A platform admin can flip the toggle; the change persists immediately.
- [ ] When `price_lookup_enabled = false`: no discount-rate UI is shown to the tenant, and the extraction pipeline does not attempt a price lookup.
- [ ] When `price_lookup_enabled = true`: the Discount Rates tab in the customer catalog (OPH-106) and the extraction price-lookup step (OPH-108) become active.
- [ ] Tenant admins can see "Price Lookup: Active / Inactive" read-only on their own settings page — they cannot change it themselves.
- [ ] DB migration adds the column with `DEFAULT false NOT NULL`.

## Edge Cases

- **Disabling mid-use:** If a tenant has discount rate records and the flag is turned off, the records are preserved — they just become dormant. Re-enabling restores full functionality without data loss.
- **New tenants:** Flag defaults to `false`; platform admins explicitly opt them in.
- **Extraction in-flight:** An order that begins extraction while the flag is `true` but the flag is toggled to `false` before the extraction completes: extraction uses the flag value captured at job start — no partial lookups.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

```
Admin Tenant Detail Page (OPH-42)
└── TenantProfileForm (src/components/admin/tenant-profile-form.tsx)
    └── "Add-ons" section  (NEW — right column, follows existing section pattern)
        ├── Section header: Tag icon + "Add-ons"
        └── Price Lookup row
            ├── Label: "Price Lookup"
            ├── Description: "Enables customer-specific discount rates and automatic price lookup during extraction."
            └── Switch (on/off) — platform admin only

Tenant Settings Page (read-only surface)
└── Account / Plan section  (existing or new)
    └── "Price Lookup: Active / Inactive" — read-only badge, no toggle
```

### Data Model

**Change to existing `tenants` table:**
```
tenants
  + price_lookup_enabled  (true/false, default: false, required)
```

One boolean field. No new tables for this feature. DB migration adds the column with `DEFAULT false NOT NULL`.

**Change to existing Tenant type** (`src/lib/types.ts`):
- Add `price_lookup_enabled: boolean` to the `Tenant` interface.

**Change to validation schema** (`src/lib/validations.ts`):
- Add `price_lookup_enabled` as an optional boolean field in `UpdateTenantInput`.

### API Changes

**Existing route: `PATCH /api/admin/tenants/[id]`**
- Accept `price_lookup_enabled` in the request body.
- Platform-admin-only endpoint (already auth-guarded).
- No new route needed.

**Existing route: `GET /api/admin/tenants/[id]`**
- Returns `price_lookup_enabled` in the tenant response (no change needed once column exists).

**Tenant-facing settings route** (for the read-only badge):
- Whichever route tenant admins use to fetch their own tenant data already returns the tenant record — `price_lookup_enabled` will be included automatically once the column is added.

### Tech Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| UI surface for toggle | Existing `TenantProfileForm` right column, new "Add-ons" section | Same pattern as Billing, Email Forwarding, Excel Extraction — no new component needed |
| Toggle style | `Switch` (shadcn) with label + description | Consistent with all other boolean toggles in this form |
| Platform-admin restriction | Toggle rendered only when the current user is a platform admin | Tenant admins see a read-only indicator; same pattern used for other admin-only fields |
| Tenant-admin read-only surface | Small badge or text on the existing tenant settings / profile page | Minimal UI; tenant admins just need to know it's active, not control it |
| DB default | `DEFAULT false NOT NULL` | Safe: no existing tenant accidentally gains the feature; explicit opt-in |

### Dependencies

No new packages. All components and patterns already exist in the codebase.

## QA Test Results

**QA Date:** 2026-05-17
**Tested by:** /qa (static code review — uncommitted implementation)
**Branch:** main (changes uncommitted; migration 052 not yet applied to any environment)
**Note:** Live UI/browser testing was not possible because the migration is uncommitted and adds a `NOT NULL` column that the running app's GET responses do not yet include. Findings are based on a thorough static review of the implementation against the spec.

### Files Reviewed

- `supabase/migrations/052_oph104_tenant_price_lookup_flag.sql` (new)
- `src/lib/types.ts` (modified — added `price_lookup_enabled: boolean` to `Tenant`)
- `src/lib/validations.ts` (modified — added `price_lookup_enabled` to `updateTenantSchema`)
- `src/components/admin/tenant-profile-form.tsx` (modified — added Add-ons section + Switch)
- `src/app/api/admin/tenants/[id]/route.ts` (PATCH/GET — picks up new field automatically)
- `src/app/api/settings/price-lookup/route.ts` (new — read-only tenant endpoint)
- `src/components/tenant-price-lookup-status.tsx` (new — read-only status card)
- `src/app/(protected)/settings/profile/page.tsx` (modified — mounts status card)
- `messages/de.json` / `messages/en.json` (modified — `settings.priceLookup.*` keys added)

### Acceptance Criteria Results

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | `tenants.price_lookup_enabled` boolean column (default `false`) | PASS (code) / BLOCKED (deploy) | Migration `052_oph104_tenant_price_lookup_flag.sql` adds `boolean NOT NULL DEFAULT false`. Migration has not been applied yet. |
| 2 | Platform admin tenant detail page (OPH-42) shows a "Price Lookup" toggle with current state | PASS | New Add-ons section in `tenant-profile-form.tsx` lines 766-790; switch is bound to `tenant.price_lookup_enabled`. |
| 3 | Platform admin can flip the toggle; change persists immediately | PARTIAL | Toggle flips and is sent in PATCH payload, but persistence requires clicking the form's Save button (same UX as every other tenant field). Spec wording "persists immediately" is ambiguous; see BUG-2. |
| 4 | When `false`: no discount-rate UI shown and extraction skips price lookup | DEFERRED | Discount-rate UI (OPH-106) and extraction step (OPH-108) are not yet implemented. The flag is correctly persisted; consumer features cannot be tested here. |
| 5 | When `true`: Discount Rates tab (OPH-106) and extraction price-lookup step (OPH-108) become active | DEFERRED | Same as above — consumer features not implemented. |
| 6 | Tenant admins see "Price Lookup: Active / Inactive" read-only — cannot change it themselves | PASS | `TenantPriceLookupStatus` renders read-only Badge with no toggle. No tenant-facing PATCH endpoint exists. See BUG-3 / BUG-4 for related issues. |
| 7 | DB migration adds the column with `DEFAULT false NOT NULL` | PASS | Migration is correct. |

**Summary:** 4 PASS, 1 PARTIAL, 2 DEFERRED (depend on OPH-106/108).

### Edge Cases Reviewed

| Edge Case | Status | Notes |
|-----------|--------|-------|
| Disabling mid-use preserves discount records | DEFERRED | Discount-rate table (OPH-106) not yet implemented; nothing to preserve. |
| New tenants default to `false` | PASS | `DEFAULT false NOT NULL` in migration. |
| Extraction in-flight when flag is toggled | DEFERRED | Extraction integration (OPH-108) not implemented. |

### Bugs Found

#### BUG-1 (Medium) — Admin "Add-ons" section is hard-coded German; ignores i18n
**File:** `src/components/admin/tenant-profile-form.tsx` lines 770-781
**Steps to reproduce:**
1. Log in as a platform admin with English locale (OPH-100 user override).
2. Open the tenant detail page.
3. Observe the Add-ons section.
**Expected:** Section header, label, and description follow the user's locale (OPH-101 mandates full i18n coverage).
**Actual:** "Add-ons", "Price Lookup", and the German description "Aktiviert kundenspezifische Rabattsätze und automatische Preisermittlung während der Extraktion." are hard-coded strings — no `useTranslations` call.
**Impact:** Regression against OPH-98/OPH-101 (i18n coverage). English-locale platform admins see German text in the admin form. Tenant-facing component `TenantPriceLookupStatus` is correctly internationalised, which makes the inconsistency more visible.
**Priority:** Fix before merge — same file already imports other i18n-aware fields nearby would normally; the admin form is partially i18n'd elsewhere as well.

#### BUG-2 (Medium) — Toggle on admin form does not "persist immediately"; requires form Save
**File:** `src/components/admin/tenant-profile-form.tsx`
**Acceptance criterion:** "A platform admin can flip the toggle; the change persists immediately."
**Behaviour:** Flipping the Switch updates local React state only. Persistence requires clicking the form's submit button (same as every other field). If the admin flips the toggle and navigates away without clicking Save, the change is lost.
**Comparison:** OPH-51 (logo) and OPH-99 (language) both implement immediate save patterns; this toggle does not. The tech-design table says "Switch (on/off) — platform admin only" without prescribing immediate persistence, so this is a spec/implementation mismatch around the word "immediately".
**Priority:** Confirm intent with the product owner. If "immediately" is intended literally, implement an auto-save (debounced) similar to other tenant-level toggles. Otherwise reword the acceptance criterion.

#### BUG-3 (Low) — Platform admin without active tenant context sees error in TenantPriceLookupStatus
**File:** `src/app/api/settings/price-lookup/route.ts` lines 53-58
**Steps to reproduce:**
1. Log in as a platform admin whose `app_metadata.tenant_id` is the platform-team tenant or is null (e.g. fresh platform admin).
2. Visit `/settings/profile`.
**Expected:** The page either hides the status card for platform admins (consistent with OPH-92's "select a tenant context" pattern) or reads the active tenant context via the OPH-92 cookie/localStorage.
**Actual:** GET returns 403 "Kein Mandant zugewiesen." or returns the platform-team's flag value, which is irrelevant and confusing. The status card renders a destructive Alert with the German error.
**Impact:** Cosmetic / UX regression for platform admins on their own settings page. Tenant admins are unaffected.
**Priority:** Hide the status card when `role === "platform_admin"` and there's no meaningful tenant context, OR honour the OPH-92 tenant switcher to fetch the selected tenant's flag.

#### BUG-4 (Low) — Status card always renders to tenant admins even when role-loading fails silently
**File:** `src/components/tenant-price-lookup-status.tsx`
**Observation:** The component is mounted unconditionally on `/settings/profile` for both the read-only branch (lines 175-180) and the editable branch (lines 219-220). If `useCurrentUserRole` fails (network drop), the page renders the read-only logo card but still calls the price-lookup endpoint, which is fine. However, there is no role gating — a future role like `sales_rep` would also see this card.
**Impact:** Minor — sales-reps under tenant routing (OPH-72+) might end up seeing this if they ever reach `/settings/profile`. The settings/profile page itself does not yet block sales reps, so this is a downstream concern.
**Priority:** Add a `role !== "sales_rep"` guard or move the card under a more specific role check.

#### BUG-5 (Low) — Status helper text leaks platform jargon to tenant admins
**File:** `messages/de.json` / `messages/en.json`, `settings.priceLookup.description`
**Text:** "Kostenpflichtiges Zusatzmodul: …" / "Paid add-on: …"
**Concern:** Tenant admins who do not yet have the add-on read "Paid add-on" with no further pricing context. The helper text for the inactive state ("Contact your platform administrator to enable it.") is fine; the description is borderline sales copy and might be better worded for a customer-facing surface.
**Priority:** Confirm wording with the product owner.

#### BUG-6 (Low) — Spec/UI mismatch: spec says "small badge or text" but implementation is a full Card with header + icon
**File:** `src/components/tenant-price-lookup-status.tsx`
**Tech design:** "Tenant-admin read-only surface: Small badge or text on the existing tenant settings / profile page — Minimal UI; tenant admins just need to know it's active, not control it."
**Implementation:** Full `Card` with `CardHeader`, `CardTitle`, icon, description, status row, helper text, error alert with retry button.
**Impact:** Heavier UI than designed. Not a defect — possibly an intentional improvement — but flag for product review.
**Priority:** Decide whether to keep the Card or shrink to a single line/badge to match the spec.

### Security Audit (Red-Team)

| Check | Result | Notes |
|-------|--------|-------|
| Tenant admin cannot toggle the flag for own tenant | PASS | No tenant-facing PATCH endpoint exists. PATCH `/api/admin/tenants/[id]` is guarded by `requirePlatformAdmin()`. |
| Tenant A cannot read tenant B's flag | PASS | `/api/settings/price-lookup` uses caller's `app_metadata.tenant_id` only; cannot be overridden by query string or body. |
| Platform viewer (read-only role) cannot toggle | PASS | `requirePlatformAdmin()` rejects `platform_viewer`. |
| Inactive user / inactive tenant blocked from reading flag | PASS | Both `user_status === "inactive"` and `tenant_status === "inactive"` return 403. |
| Zod validation on flag input | PASS | `z.boolean().optional()` — rejects strings, numbers, null. |
| RLS on tenants table | PASS | Migration 001 already enables RLS with platform-admin policies for SELECT/UPDATE. New column inherits. |
| Mass assignment / extra fields ignored | PASS | `updateTenantSchema` is a Zod object; unknown keys are stripped by default. |
| SQL injection via flag value | PASS | Supabase parameterised queries; Zod boolean. |
| XSS via descriptions | PASS | Helper text is rendered as text content, no `dangerouslyInnerHTML`. |
| Rate limit on PATCH | PASS | `checkAdminRateLimit(user.id)` already applied. |
| Rate limit on GET `/api/settings/price-lookup` | LOW | No rate limit. Endpoint is read-only and returns a single boolean per tenant. Risk is low (no PII leak), but a basic per-user limit is cheap. |
| Secrets / keys in client component | PASS | `TenantPriceLookupStatus` uses `fetch()`; no secrets. |
| Migration safe re-run | LOW | Migration uses `ADD COLUMN` without `IF NOT EXISTS`. Re-running on a DB where the column exists will fail. Consider `ADD COLUMN IF NOT EXISTS`. Not blocking; other migrations in this repo follow the same pattern. |
| JWT spoofing of `tenant_id` to read another tenant's flag | LOW | `app_metadata` is signed by Supabase; cannot be tampered client-side. Server uses admin client so RLS is bypassed — relies on the auth check + `app_metadata.tenant_id`. Acceptable given the codebase pattern. |

**Security audit verdict:** No critical or high findings. One low-severity rate-limit gap and one cosmetic migration-idempotency issue.

### Regression Testing

| Feature | Concern | Result |
|---------|---------|--------|
| OPH-42 (Admin Tenant Detail Page) | New Add-ons section sits between Sprache and Abrechnung; layout preserved | PASS — section follows existing rounded-lg border pattern |
| OPH-52 (Billing Model Config) | Billing section still works | PASS — code path unchanged |
| OPH-99 (Tenant Language Preference) | Reset/Save logic still resets `preferredLocale` | PASS |
| OPH-100 (User Language Override) | Settings/profile page still mounts `UserLanguageSettings` | PASS — order: Logo, Language, User-Language, Price-Lookup |
| OPH-98 / OPH-101 (i18n) | All new tenant-facing strings translated | PARTIAL — admin form is NOT translated (see BUG-1) |
| OPH-8 (Tenant Management) | `GET /api/admin/tenants/[id]` returns new field | PASS — uses `select("*")` |
| OPH-51 (Tenant Logo) | Logo card on settings/profile still renders first | PASS |
| Tenant `Tenant` interface consumers | All `Tenant` consumers must now expect `price_lookup_enabled` (non-optional boolean) | LOW RISK — TypeScript will catch missing assignments at compile time; runtime risk only if DB rows pre-migration lack the column (covered by migration). |

### Cross-Browser & Responsive

Not executed — implementation is uncommitted and the migration has not been applied to any Supabase environment, so live browser testing would fail before reaching the new UI. Recommend re-running QA in browser after migration apply.

### Production-Ready Recommendation

**NOT READY** — at least three issues should be resolved before deployment:

1. **BUG-1 (Medium):** Admin form Add-ons section must be internationalised (OPH-101 dependency).
2. **BUG-2 (Medium):** Clarify "persists immediately" wording — either implement auto-save or rewrite the AC.
3. **BUG-3 (Low) / BUG-6 (Low):** Decide on UX for platform admins on their own settings page and whether the Card or a smaller Badge is correct.

The remaining low-severity items (rate limit, migration idempotency, helper-text wording, sales-rep guard) can be addressed in a follow-up. None of the findings are Critical or High severity.

### Priority Order Suggested for Fixes

1. BUG-1 (Medium) — admin i18n
2. BUG-2 (Medium) — clarify or implement immediate persistence
3. BUG-3 (Low) — platform admin without tenant context
4. BUG-6 (Low) — Card vs. Badge UX
5. BUG-4 (Low) — sales-rep role guard
6. BUG-5 (Low) — helper-text wording review
7. Security low: rate limit + migration `IF NOT EXISTS`

### Fixes Applied (2026-05-17)

| Bug | Resolution |
|-----|------------|
| BUG-1 (i18n) | Admin form now uses `useTranslations("admin.tenantProfile.addons")` with new keys for section title, label, description, aria-label. |
| BUG-2 (immediate persist) | New `handlePriceLookupToggle` calls `onSave({ price_lookup_enabled })` directly when the Switch flips — mirrors the `handleLogoSave` pattern. Reverts local state on failure. |
| BUG-3 (platform admin context) | Status card is now hidden when `role === "platform_admin"` (no meaningful tenant context on own settings page). |
| BUG-4 (sales rep guard) | Status card renders only when `role === "tenant_admin" \|\| role === "tenant_user"`. |
| BUG-5 (wording) | Description softened — removed "Paid add-on:" / "Kostenpflichtiges Zusatzmodul:" prefix in both locales. |
| BUG-6 (Card vs Badge) | Inner content simplified — single row with label + badge + inline helper for inactive state. Removed duplicated helper-text paragraph. Card wrapper kept for consistency with other settings cards. |
| Security: migration | `ADD COLUMN` → `ADD COLUMN IF NOT EXISTS` for safe re-run. |
| Security: rate limit on GET | Not fixed — endpoint returns a single boolean per authenticated user; no PII exposure, no enumeration risk. Deferred to a follow-up if read load becomes an issue. |

## Deployment
_To be added by /deploy_
