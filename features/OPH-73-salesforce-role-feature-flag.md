# OPH-73: Salesforce App — Sales Rep Role & Tenant Feature Flag (SF-2)

## Status: Planned
**Created:** 2026-04-17
**Last Updated:** 2026-04-17
**PRD:** [Salesforce App PRD](../docs/SALESFORCE-PRD.md)

## Dependencies
- OPH-1: Multi-Tenant Auth (existing role system)
- OPH-8: Admin: Mandanten-Management (tenant configuration)

## User Stories
- As a platform admin, I want to enable or disable the Salesforce App for a specific tenant so that only paying/approved tenants get access.
- As a platform admin, I want to set a unique subdomain slug for each tenant so that the Salesforce App is accessible at `{slug}.ids.online`.
- As a platform admin, I want to see at a glance which tenants have the Salesforce App enabled.
- As a sales rep, I want my role to restrict me to the Salesforce App only so that I don't accidentally access the OPH back-office.

## Acceptance Criteria
- [ ] New `sales_rep` role value is available in the user role system (alongside `tenant_admin`, `tenant_user`, `platform_admin`).
- [ ] New fields on tenant configuration: `salesforce_enabled` (boolean, default false) and `salesforce_slug` (string, unique, nullable).
- [ ] Platform admin can toggle `salesforce_enabled` and set `salesforce_slug` on the tenant detail page in OPH.
- [ ] `salesforce_slug` is validated: lowercase alphanumeric + hyphens only, 3-30 characters, unique across all tenants, not in the reserved slug blocklist.
- [ ] Middleware enforces: `sales_rep` users accessing OPH domain → redirect to their tenant's Salesforce subdomain.
- [ ] Middleware enforces: non-`sales_rep` users accessing a Salesforce subdomain → reject with an error page.
- [ ] Middleware enforces: `sales_rep` users accessing a Salesforce subdomain that does NOT belong to their tenant → reject.
- [ ] The tenant detail page in OPH Admin shows the Salesforce App status (enabled/disabled) and the configured subdomain URL.

## Edge Cases
- Platform admin tries to set a slug that is already taken by another tenant: validation error with clear message.
- Platform admin disables Salesforce App while sales reps are logged in: next request shows "App deaktiviert" page.
- Tenant has sales rep users but Salesforce App is disabled: users exist but cannot log in via subdomain.
- Platform admin changes the slug: old subdomain immediately stops working, new one starts working.

---

## Tech Design (Solution Architect)

### Overview
OPH-73 is the foundation layer for the entire Salesforce App — it adds the new role, the two tenant config fields, and the middleware rules that enforce access control. No new UI pages are needed; changes land in the existing tenant admin panel and the existing middleware.

---

### A) Component Structure

```
OPH Admin → Tenant Detail (tenant-form-sheet.tsx)
+-- (Existing tabs: Profil, Benutzer, Artikel, etc.)
+-- NEW Tab: "Salesforce App"
    +-- Feature toggle (Switch: Salesforce App aktivieren)
    +-- Subdomain Slug input (text: "meisinger")
    |   +-- Live preview label: "meisinger.ids.online"
    |   +-- Validation feedback (taken / invalid / reserved)
    +-- Status display (Active URL link, or "Nicht aktiviert")
```

Middleware (lib/supabase/middleware.ts) — extended logic:
```
On every authenticated request:
+-- Extract subdomain from Host header
+-- If role = "sales_rep":
|   +-- If on OPH domain → redirect to {app_metadata.salesforce_slug}.ids.online
|   +-- If on Salesforce subdomain that doesn't match their slug → reject
+-- If role ≠ "sales_rep" AND on a non-OPH subdomain:
    +-- Reject with "Zugang nicht möglich" error page
```

---

### B) Data Model

**Tenants table — two new columns:**
```
salesforce_enabled  boolean   default false   (is the Salesforce App active?)
salesforce_slug     text      unique nullable  (subdomain slug, e.g. "meisinger")
```

**UserRole type — one new value:**
```
Existing: "tenant_user" | "tenant_admin" | "platform_admin" | "platform_viewer"
New:      + "sales_rep"
```

**User app_metadata — one new field (added to sales_rep users at invite time):**
```
salesforce_slug: string   (mirrors their tenant's slug — allows middleware to
                           enforce correct subdomain without a DB lookup)
```

Storing `salesforce_slug` in app_metadata follows the exact same pattern as `tenant_id` and `role` — it's written once at user creation and read on every request via the JWT.

---

### C) Tech Decisions

**Why store `salesforce_slug` in app_metadata?**
The middleware runs on every request at the edge. A DB lookup per request would be slow and expensive. By caching the slug in the Supabase JWT (app_metadata), the middleware gets the slug for free from the already-validated session — zero extra latency.

**Why extend the existing tenant form sheet rather than a new page?**
The tenant form sheet already handles billing, email settings, logos, and more. A new "Salesforce App" tab follows the same pattern as the existing tabs and avoids creating a separate admin page for two fields.

**Why is this a platform admin responsibility, not tenant admin?**
Enabling the Salesforce App and configuring the slug has DNS/billing implications. Only platform admins should control which tenants get this feature.

**Validation for `salesforce_slug`:**
- Lowercase, alphanumeric + hyphens only, 3–30 characters
- Must be unique across all tenants (checked server-side before saving)
- Blocked reserved words: `www`, `api`, `app`, `admin`, `mail`, `smtp`, `oph-ki`, `oph-ki-dev`, `oph-ki-staging`, `salesforce`
- Validated in `updateTenantSchema` (Zod, same pattern as existing fields)

---

### D) Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/` | New migration: add columns to tenants, add `sales_rep` to role enum |
| `src/lib/types.ts` | Add `sales_rep` to `UserRole`, add two fields to `Tenant` interface |
| `src/lib/validations.ts` | Add `salesforce_enabled` + `salesforce_slug` to `updateTenantSchema`; add `sales_rep` to `adminInviteUserSchema` |
| `src/lib/supabase/middleware.ts` | Add subdomain-based routing rules for `sales_rep` role |
| `src/components/admin/tenant-form-sheet.tsx` | Add "Salesforce App" tab with toggle + slug input |
| `src/app/api/admin/tenants/[id]/route.ts` | PATCH handler already uses `updateTenantSchema` — no logic change needed |

---

### E) Dependencies
No new npm packages required. All changes use existing tools (Supabase, Zod, shadcn/ui Switch + Input).

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
