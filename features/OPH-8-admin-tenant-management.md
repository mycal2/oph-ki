# OPH-8: Admin: Mandanten-Management

## Status: Deployed
**Created:** 2026-02-27
**Last Updated:** 2026-03-02
**Deployed:** 2026-03-02

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) — Mandanten-Tabelle und User-Profile-Struktur bereits vorhanden
- Requires: OPH-7 (Admin: Händler-Regelwerk) — Admin-Bereich und `requirePlatformAdmin()` Auth-Helper wiederverwendet
- Enables: OPH-9 (ERP-Mapping-Konfiguration) — ERP-Typ pro Mandant wird hier gepflegt

## Konzept

Platform-Admins verwalten alle Mandanten (Dentalhersteller) der Plattform über einen zentralen Admin-Bereich. Ein Mandant entspricht einem Kunden (Unternehmen), der die Plattform nutzt. Die Mandanten-Verwaltung umfasst: CRUD für Mandanten-Profile, Aktivierung/Deaktivierung von Mandanten, sowie vollständige Benutzerverwaltung für jeden Mandanten (inkl. Einladungen im Namen des Mandanten). Nutzungsstatistiken (Bestellvolumen) ermöglichen eine schnelle Übersicht über die Aktivität jedes Mandanten.

**Wichtig:** Die `tenants`-Tabelle und das gesamte Auth-System existieren bereits aus OPH-1. OPH-8 fügt lediglich die Admin-Verwaltungsoberfläche und die zugehörigen Admin-API-Routen hinzu.

---

## User Stories

- Als Platform-Admin möchte ich alle Mandanten in einer Liste sehen (Name, Status, ERP-Typ, Bestellanzahl), damit ich einen schnellen Überblick über alle Kunden habe.
- Als Platform-Admin möchte ich neue Mandanten anlegen (Name, Slug, Kontakt-E-Mail, ERP-Typ), damit neue Kunden schnell ongeboardet werden können.
- Als Platform-Admin möchte ich Mandanten-Profile bearbeiten (Name, Kontakt-E-Mail, ERP-Typ, Status), damit ich Änderungen der Kundendaten pflegen kann.
- Als Platform-Admin möchte ich Mandanten deaktivieren (und reaktivieren), damit der Zugang bei Vertragsproblemen sofort gesperrt werden kann.
- Als Platform-Admin möchte ich die Benutzer eines Mandanten einsehen und verwalten — einladen, deaktivieren, reaktivieren — damit ich Support-Anfragen ohne Umwege über den Kunden lösen kann.
- Als Platform-Admin möchte ich pro Mandant sehen: Anzahl Bestellungen (gesamt + letzter Monat), Datum letzter Upload, damit ich die Aktivität und Billing-Relevanz schnell beurteilen kann.
- Als Platform-Admin möchte ich alle Mandanten-Daten als CSV exportieren, damit ich die Buchhaltung und CRM-Systeme aktuell halten kann.

---

## Acceptance Criteria

- [x] **AC-1:** Admin-Bereich `/admin/tenants` ist nur für `platform_admin`-Rolle zugänglich (Middleware + Seitenguard + API) -- PASS
- [x] **AC-2:** Mandanten-Liste zeigt: Name, Slug, ERP-Typ, Status (Aktiv/Inaktiv/Testphase), Bestellungen gesamt, Datum letzter Upload, Datum erstellt -- PASS
- [x] **AC-3:** Neuen Mandanten anlegen: Felder Name (Pflicht), Slug (Pflicht, URL-sicher, eindeutig), Kontakt-E-Mail (Pflicht), ERP-Typ (SAP/Dynamics365/Sage/Custom), Status (aktiv/inaktiv/Testphase) -- PASS
- [x] **AC-4:** Mandanten bearbeiten: alle Felder aus AC-3 außer Slug (Slug ist unveränderlich nach Erstellung) -- PASS
- [x] **AC-5:** Mandant deaktivieren → Status `inactive`; Mandant reaktivieren → Status `active`; kein Hard-Delete möglich -- PASS (with BUG-7, BUG-8)
- [x] **AC-6:** Benutzer-Tab pro Mandant: Liste aller Benutzer mit Name, E-Mail, Rolle, Status, letzter Login -- PASS (with BUG-1, BUG-2)
- [x] **AC-7:** Benutzer einladen (im Namen des Mandanten): E-Mail-Adresse + Rolle auswählen (tenant_user / tenant_admin) → Einladungs-E-Mail wird versendet -- PASS (with BUG-3, BUG-4)
- [x] **AC-8:** Benutzer deaktivieren/reaktivieren über den Admin-Bereich -- PASS (with BUG-5, BUG-6)
- [ ] **AC-9:** Nutzungsstatistiken pro Mandant: Bestellungen gesamt, Bestellungen letzter Monat, letzter Upload-Zeitpunkt -- **FAIL** (BUG-9: "Bestellungen letzter Monat" not implemented)
- [x] **AC-10:** CSV-Export: eine CSV-Datei mit allen Mandanten (Name, Slug, Status, ERP-Typ, Kontakt-E-Mail, erstellt am) -- PASS

---

## Edge Cases

- **Mandant deaktiviert während aktiver Session:** Der `tenant_status`-Wert im JWT wird beim nächsten Token-Refresh aktualisiert. Bis dahin (max. Supabase-Session-TTL) können Benutzer noch Requests machen — die API-Routen prüfen `tenant_status` aus dem JWT. Für sofortige Invalidierung: Platform-Admin kann zusätzlich die Benutzer manuell deaktivieren (AC-8).
- **Slug-Konflikt bei Erstellung:** Wenn der eingegebene Slug bereits vergeben ist, gibt die API einen 409-Conflict zurück. Das Frontend zeigt eine klare Fehlermeldung.
- **Reaktivierung eines Mandanten:** Alle Benutzer des Mandanten können sich sofort wieder einloggen; historische Daten sind vollständig erhalten.
- **Kein Hard-Delete:** Die API erlaubt keine Löschung von Mandanten. Deaktivierung ist der einzige Offboarding-Pfad; Datenlöschung erfolgt über OPH-12 (DSGVO-Prozess).
- **Einladung an bereits existierende E-Mail:** Falls die E-Mail bereits in einem anderen Mandanten existiert, lehnt Supabase die Einladung ab. Die API gibt die Fehlermeldung an das Frontend weiter.
- **CSV-Export bei vielen Mandanten:** Export ist auf 1.000 Mandanten limitiert. Ausreichend für MVP.
- **Slug-Format:** Slug muss nur Kleinbuchstaben, Zahlen und Bindestriche enthalten (`[a-z0-9-]+`), min. 2, max. 50 Zeichen.

---

## Technical Requirements

- API-Routen unter `/api/admin/tenants/` (analog zu `/api/admin/dealers/`)
- Bestehenden `requirePlatformAdmin()` Auth-Helper wiederverwenden
- Bestehende `tenants`-Tabelle und `user_profiles`-Tabelle aus OPH-1 — keine neuen Tabellen nötig
- Nutzungsstatistiken: aggregierte Queries aus `orders`-Tabelle (GROUP BY tenant_id + Datumsfilter)
- Benutzer-Einladungen: bestehenden `/api/team/invite`-Endpunkt wiederverwenden oder adaptieren, damit Platform-Admins für beliebige Mandanten einladen können
- CSV-Export: Server-side Generierung, direkter Download via API-Route (kein S3/Storage)
- Rate Limiting auf mutierenden Endpunkten (POST, PATCH, DELETE) — `checkAdminRateLimit()` wiederverwenden

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview

OPH-8 is purely a management UI and API layer — **zero new database tables**. The `tenants`, `user_profiles`, and Supabase Auth infrastructure built in OPH-1 already stores everything we need. This feature adds the admin-only screens and routes to read, create, update, and report on that data.

The admin UI follows the exact same pattern established in OPH-7 (dealer management): a full-page table with a slide-out Sheet for editing, protected by the existing `requirePlatformAdmin()` guard.

---

### Component Structure

```
/admin/tenants  —  TenantAdminPage  (platform_admin only)
+-- PageHeader: "Mandanten-Verwaltung"
|   +-- "Neuer Mandant" button
|   +-- "CSV exportieren" button (downloads CSV immediately)
+-- TenantAdminTable
|   +-- Toolbar: Search field | "Inaktive anzeigen" toggle
|   +-- Table columns:
|   |   Name | Slug | ERP-Typ | Status | Bestellungen | Letzter Upload | Erstellt am | Aktionen
|   +-- Status badges: Aktiv (grün) / Inaktiv (outline) / Testphase (gelb)
|   +-- Actions dropdown per row: [Bearbeiten] [Deaktivieren / Reaktivieren]
|   +-- Loading skeleton (while data loads)
|   +-- Empty state (no tenants yet)
+-- TenantFormSheet  (slides in from right — create OR edit)
|   +-- Tab: Profil
|   |   +-- Name (Pflicht)
|   |   +-- Slug  (Pflicht, auto-abgeleitet, gesperrt nach Erstellen)
|   |   +-- Kontakt-E-Mail (Pflicht)
|   |   +-- ERP-Typ  (SAP / Dynamics365 / Sage / Custom)
|   |   +-- Status   (Aktiv / Inaktiv / Testphase)
|   +-- Tab: Benutzer  (nur im Bearbeiten-Modus, ausgeblendet bei Neuanlage)
|       +-- Benutzer-Tabelle: Name | E-Mail | Rolle | Status | Letzter Login | Aktionen
|       +-- Aktionen je Benutzer: [Deaktivieren / Reaktivieren]
|       +-- "Benutzer einladen" Button → TenantInviteDialog
+-- TenantInviteDialog  (modal, öffnet sich über dem Sheet)
    +-- E-Mail-Adresse (Pflicht)
    +-- Rolle (tenant_user / tenant_admin)
    +-- Absenden / Abbrechen
```

---

### API Routes (all require `platform_admin`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/tenants` | All tenants with usage stats (orders total, last month, last upload) |
| POST | `/api/admin/tenants` | Create new tenant |
| GET | `/api/admin/tenants/[id]` | Full tenant record |
| PATCH | `/api/admin/tenants/[id]` | Update tenant (name, email, erp_type, status) |
| GET | `/api/admin/tenants/[id]/users` | All users for a tenant (with email + last login via admin API) |
| POST | `/api/admin/tenants/[id]/users/invite` | Invite user on behalf of a specific tenant |
| PATCH | `/api/admin/tenants/[id]/users/[userId]` | Toggle user status (active / inactive) |
| GET | `/api/admin/tenants/export` | Stream a CSV of all tenants (metadata only) |

---

### Data Model — What's Stored Where

No new tables. All data lives in existing structures:

**`tenants` table** (OPH-1) — stores the tenant record:
- Name, Slug (unique URL-safe identifier), Status, ERP-Typ, Kontakt-E-Mail, Erstellt am

**`user_profiles` table** (OPH-1) — stores per-user data:
- Linked to tenant via `tenant_id`, Vorname, Nachname, Rolle, Status

**Supabase Auth** — stores per-user email + last sign-in timestamp
- Fetched via the admin client (service role key), same pattern as OPH-1's team management

**`orders` table** (OPH-2) — provides usage statistics:
- Counted by `tenant_id` and filtered by date for "last 30 days" and "last upload" stats
- Simple aggregate query, no separate analytics table

---

### Tech Decisions

**1. No new database tables**
Everything needed already exists from OPH-1 and OPH-2. OPH-8 is 100% additive UI and API.

**2. New platform-admin invite endpoint (distinct from `/api/team/invite`)**
The existing invite route sends invites within the platform-admin's own tenant context. For OPH-8, the platform-admin must be able to invite into *any* tenant. A new route at `/api/admin/tenants/[id]/users/invite` accepts the target tenant ID as part of the URL — reusing the same Supabase `inviteUserByEmail()` mechanism but bypassing the context check.

**3. Slug is auto-generated, then locked**
When the admin types a tenant name, the Slug field auto-fills (lowercase, hyphens). The admin can adjust it before saving. Once the tenant is created, the Slug field becomes read-only. Slugs are used in URLs and data relationships — changing them after creation could break existing references.

**4. Users tab hidden during creation**
You can't manage users for a tenant that doesn't exist yet. The "Benutzer" tab only appears in edit mode (after the tenant record has been created).

**5. CSV export is server-streamed (no file storage)**
The export API generates the CSV row-by-row and streams it directly to the browser as a download — no temporary files in Supabase Storage. Fast, simple, no cleanup needed.

**6. Usage stats via direct aggregation**
Order counts and last-upload timestamp are computed with a single GROUP BY query on the `orders` table, filtered by tenant. No caching for MVP — the tenant list is short (< 100 tenants) and reads are infrequent.

**7. Navigation: second link in the "Admin" group**
The top navigation already has an "Admin" group (added in OPH-7) showing "Händler-Profile". OPH-8 adds "Mandanten" as a second link in that group — only visible to `platform_admin` users.

---

### No New npm Packages

All UI components needed are already installed:
- `Sheet` — slide-out tenant form (same as OPH-7)
- `Tabs` — Profil / Benutzer tabs
- `Dialog` — invite user modal
- `Table` — tenant list and user list
- `Badge`, `Select`, `Input`, `Button` — form controls

## QA Test Results

**Tested by:** QA / Red-Team Pen-Test
**Date:** 2026-03-02
**Build status:** PASS (TypeScript compiles without errors)
**Scope:** AC-1 through AC-5, AC-9, AC-10 (Backend API routes + tenant CRUD + security)

---

### AC-1: Admin area /admin/tenants only accessible by platform_admin role (Middleware + page guard + API)

**Result: PASS**

Three-layer protection is correctly implemented:

**Layer 1 -- Middleware (route-level):**
- File: `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/supabase/middleware.ts` lines 148-158
- The middleware checks `url.pathname.startsWith("/admin")` and redirects non-`platform_admin` users to `/dashboard`.
- Unauthenticated users are redirected to `/login` (lines 107-111).
- Inactive users and deactivated tenants are also blocked (lines 130-146).

**Layer 2 -- Page guard (client-side):**
- File: `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/(protected)/admin/tenants/page.tsx` lines 14, 93-101
- Uses `useCurrentUserRole()` hook to check `isPlatformAdmin`.
- Renders "Zugriff verweigert" message if role is not platform_admin.
- Shows loading skeleton while role is being determined (lines 84-91).

**Layer 3 -- API routes (server-side):**
- Every API route calls `requirePlatformAdmin()` from `src/lib/admin-auth.ts`:
  - `GET /api/admin/tenants` -- line 15 of `route.ts`
  - `POST /api/admin/tenants` -- line 87 of `route.ts`
  - `GET /api/admin/tenants/[id]` -- line 27 of `[id]/route.ts`
  - `PATCH /api/admin/tenants/[id]` -- line 73 of `[id]/route.ts`
  - `GET /api/admin/tenants/export` -- line 12 of `export/route.ts`
  - `GET /api/admin/tenants/[id]/users` -- line 27 of `users/route.ts`
  - `POST /api/admin/tenants/[id]/users/invite` -- line 28 of `invite/route.ts`
  - `PATCH /api/admin/tenants/[id]/users/[userId]` -- line 28 of `[userId]/route.ts`

**Navigation guard:**
- File: `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/layout/top-navigation.tsx` lines 31, 39-42
- The "Mandanten" nav link has `adminOnly: true` and is filtered out for non-admin users.

**NOTE:** The middleware passes API routes through without role checks (line 101-104: `if (isApiRoute) { return supabaseResponse; }`). This is correct because API routes handle their own auth via `requirePlatformAdmin()`.

---

### AC-2: Tenant list shows: Name, Slug, ERP-Typ, Status, Bestellungen gesamt, Datum letzter Upload, Datum erstellt

**Result: PASS**

**API response structure:**
- File: `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/tenants/route.ts` lines 55-68
- Returns `TenantAdminListItem[]` with fields: `id, name, slug, status, erp_type, contact_email, order_count, last_upload_at, created_at`

**Type definition:**
- File: `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/types.ts` lines 412-423
- `TenantAdminListItem` includes all required fields.

**UI table columns:**
- File: `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/admin/tenant-admin-table.tsx` lines 140-149
- Columns: Name (+ contact_email subtitle), Slug, ERP-Typ, Status, Bestellungen, Letzter Upload, Erstellt am, Actions

**Status badges:**
- File: `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/admin/tenant-admin-table.tsx` lines 25-29
- Three states mapped: `active` = "Aktiv" (green), `inactive` = "Inaktiv" (muted), `trial` = "Testphase" (yellow)

**All required columns verified present:**
- Name: PASS (line 162)
- Slug: PASS (line 167-169, hidden below md breakpoint)
- ERP-Typ: PASS (line 170-174, hidden below sm breakpoint)
- Status: PASS (lines 175-184, hidden below sm breakpoint)
- Bestellungen gesamt: PASS (lines 186-188)
- Datum letzter Upload: PASS (lines 189-192, hidden below lg breakpoint)
- Datum erstellt: PASS (lines 194-196, hidden below lg breakpoint)

---

### AC-3: Create tenant: Fields Name (required), Slug (required, URL-safe, unique), Kontakt-E-Mail (required), ERP-Typ, Status

**Result: PASS**

**Zod validation schema:**
- File: `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/validations.ts` lines 370-387
- `createTenantSchema` validates:
  - `name`: string, min 1, max 200, trimmed -- PASS
  - `slug`: string, min 2, max 50, regex `^[a-z0-9-]+$` -- PASS
  - `contact_email`: string, min 1, email format -- PASS
  - `erp_type`: enum `["SAP", "Dynamics365", "Sage", "Custom"]` -- PASS
  - `status`: enum `["active", "inactive", "trial"]`, default `"active"` -- PASS

**Slug validation:**
- File: `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/validations.ts` lines 361-368
- Regex: `/^[a-z0-9-]+$/` -- correctly restricts to lowercase letters, numbers, hyphens only.
- Min: 2, Max: 50 -- matches spec.

**Slug uniqueness check:**
- File: `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/tenants/route.ts` lines 108-119
- Queries `tenants` table for existing slug with `.eq("slug", input.slug)`.
- Returns 409 Conflict with message "Dieser Slug ist bereits vergeben." -- PASS

**API endpoint:**
- File: `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/tenants/route.ts` lines 85-154
- POST handler: auth check, rate limit, Zod validation, slug uniqueness check, insert, return 201 with tenant data.

**Rate limiting on POST:**
- PASS -- line 91 calls `checkAdminRateLimit(user.id)`.

---

### AC-4: Edit tenant: all fields from AC-3 except Slug (Slug is immutable after creation)

**Result: PASS**

**Update schema (Slug excluded):**
- File: `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/validations.ts` lines 389-407
- `updateTenantSchema` includes ONLY: `name`, `contact_email`, `erp_type`, `status` (all optional).
- `slug` is NOT present in the schema -- correctly enforcing immutability.
- Zod's default behavior strips unknown keys, so even if a request body includes `slug`, it will be removed by `safeParse()`.

**PATCH endpoint:**
- File: `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/tenants/[id]/route.ts` lines 60-146
- Auth check: line 73 -- PASS
- Rate limit: line 77 -- PASS
- UUID validation: lines 65-71 -- PASS
- Zod validation: lines 80-89 -- PASS
- Existence check (404): lines 94-105 -- PASS
- Empty payload check (400): lines 115-119 -- PASS
- Update uses only validated fields (lines 108-113) -- PASS

**Slug immutability defense-in-depth:**
- The update payload is built exclusively from `parsed.data` (line 109: `Object.entries(input)`), which comes from `updateTenantSchema`. Since `slug` is not in the schema, it can never reach the database update.
- Verified: No `.passthrough()` or `.strict()` calls on the schema that would change Zod's default strip behavior.

---

### AC-5: Deactivate tenant -> Status inactive; Reactivate -> Status active; no hard delete possible

**Result: PASS**

**Deactivate/Reactivate:**
- The PATCH endpoint (`/api/admin/tenants/[id]`) accepts `status: "active" | "inactive" | "trial"` in the update body.
- File: `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/(protected)/admin/tenants/page.tsx` lines 44-52
- `handleToggleStatus`: Computes new status -- if currently `"inactive"`, sets to `"active"`; otherwise sets to `"inactive"`.
- This is sent via `updateTenant(tenantId, { status: newStatus })`.

**UI for toggle:**
- File: `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/admin/tenant-admin-table.tsx` lines 213-228
- Dropdown shows "Deaktivieren" (with PowerOff icon, destructive text) for non-inactive tenants.
- Dropdown shows "Reaktivieren" (with Power icon) for inactive tenants.

**No hard delete (no DELETE endpoint):**
- PASS -- Grep across all files in `src/app/api/admin/tenants/` for `DELETE` returns zero matches.
- None of the route files export a `DELETE` function.
- The only DELETE function in the admin area is in `src/app/api/admin/dealers/[id]/route.ts` (which is soft-delete anyway, for dealers, not tenants).

#### BUG-7: No confirmation dialog before deactivating a tenant

- **Severity:** Medium
- **Priority:** P2
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/(protected)/admin/tenants/page.tsx` lines 44-52 and `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/admin/tenant-admin-table.tsx` lines 213-220
- **Description:** Clicking "Deaktivieren" in the tenant row dropdown immediately calls `onToggleStatus(tenant.id)` with no confirmation dialog. Deactivating a tenant blocks ALL of that tenant's users from accessing the platform. This is a high-impact action that should require explicit confirmation. An accidental click could lock out an entire organization.
- **Steps to reproduce:**
  1. Open /admin/tenants.
  2. Click the three-dot menu on an active tenant.
  3. Click "Deaktivieren" -- the tenant is immediately deactivated with no confirmation.
- **Expected:** A confirmation dialog asking "Sind Sie sicher? Alle Benutzer dieses Mandanten werden gesperrt." before proceeding.

#### BUG-8: Toggle status logic loses "trial" state

- **Severity:** Medium
- **Priority:** P2
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/(protected)/admin/tenants/page.tsx` lines 48-50
- **Description:** The toggle logic is: `const newStatus = tenant.status === "inactive" ? "active" : "inactive";`. This means that if a tenant is in "trial" status and the admin clicks "Deaktivieren", the tenant becomes "inactive" (correct). But when the admin clicks "Reaktivieren" to bring it back, it becomes "active" -- NOT "trial". The original trial status is lost and cannot be recovered through the toggle action. The spec defines three states (active/inactive/trial), but the toggle only cycles between active and inactive.
- **Steps to reproduce:**
  1. Create a tenant with status "trial".
  2. Click "Deaktivieren" -- status becomes "inactive".
  3. Click "Reaktivieren" -- status becomes "active" (not "trial").
- **Expected:** Reactivation should restore the previous status before deactivation, or the admin should be warned that the tenant will be set to "active" instead of "trial".

---

### AC-9: Usage stats per tenant: Bestellungen gesamt, Bestellungen letzter Monat, letzter Upload-Zeitpunkt

**Result: FAIL**

**Bestellungen gesamt:**
- PASS -- File: `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/tenants/route.ts` lines 37-53
- Order count per tenant is computed by iterating over all orders and counting by `tenant_id`.
- Returned as `order_count` in `TenantAdminListItem`.

**Letzter Upload-Zeitpunkt:**
- PASS -- The last upload timestamp is derived from the first (most recent) order for each tenant, since orders are fetched in descending `created_at` order. Returned as `last_upload_at`.

**Bestellungen letzter Monat:**
- FAIL -- This field is completely missing.
- The type `TenantAdminListItem` (file: `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/types.ts` lines 412-423) does NOT include an `orders_last_month` or equivalent field.
- The API endpoint does NOT compute a last-30-days count. It only computes total order count and last upload timestamp.
- The UI table does NOT display a "Bestellungen letzter Monat" column.
- The Tech Design (line 121 of this spec) lists "orders total, last month, last upload" as part of the GET endpoint purpose, but the implementation omits "last month".

#### BUG-9 (AC-9 Failure): "Bestellungen letzter Monat" stat is not implemented

- **Severity:** High
- **Priority:** P1
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/tenants/route.ts` lines 34-53 and `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/types.ts` lines 412-423
- **Description:** AC-9 requires three usage statistics: (1) Bestellungen gesamt, (2) Bestellungen letzter Monat, (3) letzter Upload-Zeitpunkt. Only (1) and (3) are implemented. The "orders last month" count is completely absent from the type definition, API response, and UI.
- **Steps to reproduce:**
  1. Call `GET /api/admin/tenants` as a platform admin.
  2. Inspect the response JSON for any `orders_last_month` or similar field.
  3. None is present.
- **Expected:** The `TenantAdminListItem` type should include `orders_last_month: number`. The API should filter orders by `created_at >= NOW() - 30 days` and return the count. The UI should display this value.

#### BUG-10: Order stats query fetches all orders up to 10,000 rows (scalability issue)

- **Severity:** Medium
- **Priority:** P2
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/tenants/route.ts` lines 37-41
- **Description:** The order stats computation fetches up to 10,000 individual order rows from the `orders` table and aggregates them in JavaScript. This is inefficient and will not scale. The Tech Design (line 64 of the spec) specifies "aggregierte Queries aus orders-Tabelle (GROUP BY tenant_id + Datumsfilter)" but the implementation does NOT use GROUP BY or any database-level aggregation. Instead it does a full table scan limited to 10,000 rows.
- **Impact:** If there are more than 10,000 orders across all tenants, the stats will be incorrect (undercounted). The query also transfers unnecessary data over the wire (all order records instead of just aggregated counts).
- **Steps to reproduce:** Insert more than 10,000 orders across all tenants. The order count will be capped/incorrect.
- **Expected:** Use a database-level aggregation query such as:
  ```sql
  SELECT tenant_id, COUNT(*) as total, MAX(created_at) as last_upload_at
  FROM orders GROUP BY tenant_id
  ```
  Or use Supabase RPC with a server-side function.

---

### AC-10: CSV export: a CSV file with all tenants (Name, Slug, Status, ERP-Typ, Kontakt-E-Mail, erstellt am)

**Result: PASS**

**CSV export endpoint:**
- File: `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/tenants/export/route.ts` lines 1-74

**Auth check:**
- PASS -- line 12 calls `requirePlatformAdmin()`.

**1000 tenant limit:**
- PASS -- line 20 uses `.limit(1000)`.

**CSV headers:**
- PASS -- line 31: `["Name", "Slug", "Status", "ERP-Typ", "Kontakt-E-Mail", "Erstellt am"]`
- All six required fields are present.

**CSV data rows:**
- PASS -- lines 32-39: Maps each tenant to `[name, slug, status, erp_type, contact_email, created_at]`.

**CSV formatting:**
- Semicolon separator (line 42-44) -- appropriate for German/European locale where commas are used as decimal separators.
- BOM prefix for Excel UTF-8 compatibility (lines 47-48) -- PASS.
- Proper CSV field escaping (lines 69-74) -- handles semicolons, quotes, and newlines within field values.

**Download response headers:**
- `Content-Type: text/csv; charset=utf-8` -- PASS
- `Content-Disposition: attachment; filename="mandanten-export-YYYY-MM-DD.csv"` -- PASS

**Client-side download trigger:**
- File: `/Users/michaelmollath/projects/ai-coding-starter-kit/src/hooks/use-admin-tenants.ts` lines 210-230
- Creates a Blob, generates an Object URL, clicks a hidden anchor element, then cleans up. Standard browser download approach.

#### BUG-11: CSV export has no rate limiting

- **Severity:** Low
- **Priority:** P3
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/tenants/export/route.ts`
- **Description:** The CSV export endpoint does not call `checkAdminRateLimit()`. While it is a GET (read-only) endpoint, the spec (line 67 of this document) mentions rate limiting on mutating endpoints. However, the export generates a potentially large CSV server-side and is more expensive than a typical GET. An attacker with admin credentials could hammer this endpoint. Low risk since admin access is already tightly controlled.

---

### Edge Cases Verification

| Edge Case | Result | Evidence |
|-----------|--------|----------|
| Slug conflict on creation -> 409 | PASS | `route.ts` lines 108-119 |
| No hard delete (no DELETE endpoint) | PASS | No DELETE export in any tenant API file |
| Slug format: `[a-z0-9-]+`, min 2, max 50 | PASS | `validations.ts` lines 361-368 |
| CSV export limited to 1000 tenants | PASS | `export/route.ts` line 20 |

---

### Security Audit (Red-Team Perspective) -- AC-1 through AC-5, AC-9, AC-10

#### Authentication & Authorization

| Check | Result | Evidence |
|-------|--------|----------|
| `requirePlatformAdmin()` on GET list | PASS | `route.ts` line 15 |
| `requirePlatformAdmin()` on POST create | PASS | `route.ts` line 87 |
| `requirePlatformAdmin()` on GET detail | PASS | `[id]/route.ts` line 27 |
| `requirePlatformAdmin()` on PATCH update | PASS | `[id]/route.ts` line 73 |
| `requirePlatformAdmin()` on GET export | PASS | `export/route.ts` line 12 |
| Middleware blocks /admin/* for non-admin | PASS | `middleware.ts` lines 152-158 |
| Page-level guard (isPlatformAdmin) | PASS | `page.tsx` lines 94-101 |
| Nav link hidden for non-admin | PASS | `top-navigation.tsx` lines 31, 39-42 |

#### Input Validation

| Check | Result | Evidence |
|-------|--------|----------|
| UUID validation on [id] param (GET detail) | PASS | `[id]/route.ts` lines 20-25 |
| UUID validation on [id] param (PATCH update) | PASS | `[id]/route.ts` lines 65-71 |
| Zod validation on POST create body | PASS | `route.ts` lines 95-103 |
| Zod validation on PATCH update body | PASS | `[id]/route.ts` lines 81-89 |
| Slug regex prevents injection | PASS | `/^[a-z0-9-]+$/` -- no special chars |
| Email format validation | PASS | `validations.ts` line 380 |
| ERP type restricted to enum | PASS | `validations.ts` lines 381-383 |
| Status restricted to enum | PASS | `validations.ts` lines 384-386 |
| Name max length prevents abuse | PASS | Max 200 chars (line 374) |
| Slug max length prevents abuse | PASS | Max 50 chars (line 364) |

#### Rate Limiting

| Check | Result | Evidence |
|-------|--------|----------|
| Rate limit on POST create | PASS | `route.ts` line 91 |
| Rate limit on PATCH update | PASS | `[id]/route.ts` line 77 |
| Rate limit on GET list | NOT PRESENT | Read-only; acceptable |
| Rate limit on GET detail | NOT PRESENT | Read-only; acceptable |
| Rate limit on GET export | NOT PRESENT | See BUG-11 |

#### SQL Injection Prevention

| Check | Result | Evidence |
|-------|--------|----------|
| Parameterized queries via Supabase | PASS | All queries use `.eq()`, `.select()`, `.insert()`, `.update()` -- Supabase SDK handles parameterization |
| No raw SQL strings | PASS | No `supabase.rpc()` or raw SQL in tenant routes |

#### Data Exposure

| Check | Result | Evidence |
|-------|--------|----------|
| POST response includes full tenant record | NOTE | `route.ts` line 144 returns `tenant as unknown as Tenant`. The `select()` call returns all columns. Consider returning only necessary fields. Low risk since response goes to platform_admin only. |
| GET list does not expose sensitive fields | PASS | `route.ts` line 22 selects only specific columns |
| CSV export contains only metadata | PASS | `export/route.ts` line 18 selects only `name, slug, status, erp_type, contact_email, created_at` |

#### SEC-4: Slug uniqueness check is not atomic (race condition)

- **Severity:** Low
- **Priority:** P3
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/tenants/route.ts` lines 108-119
- **Description:** The slug uniqueness check is performed as a separate SELECT query (line 108-113) before the INSERT (lines 123-133). Between the SELECT and INSERT, another concurrent request could insert the same slug, causing a database-level unique constraint violation that would surface as a generic 500 error rather than a clean 409 Conflict. This is a classic TOCTOU race condition.
- **Impact:** Very low in practice since only platform_admins can create tenants, and concurrent tenant creation with the same slug is extremely unlikely. The database's unique constraint on slug (from OPH-1 migration) provides a safety net.
- **Recommendation:** Wrap the INSERT in a try-catch that specifically handles unique constraint violations and returns 409 as a fallback.

---

### Summary -- All Tested ACs

| AC | Verdict | Bugs Found |
|----|---------|------------|
| AC-1 | PASS | None |
| AC-2 | PASS | None |
| AC-3 | PASS | None |
| AC-4 | PASS | None |
| AC-5 | PASS | BUG-7 (Medium), BUG-8 (Medium) |
| AC-9 | **FAIL** | BUG-9 (High), BUG-10 (Medium) |
| AC-10 | PASS | BUG-11 (Low) |

### Bug Priority Ranking (This Test Round)

| Priority | ID | Severity | Summary |
|----------|----|----------|---------|
| P1 | BUG-9 | High | "Bestellungen letzter Monat" stat completely missing -- AC-9 FAIL |
| P2 | BUG-7 | Medium | No confirmation dialog before deactivating a tenant |
| P2 | BUG-8 | Medium | Toggle status loses "trial" state -- reactivation always sets "active" |
| P2 | BUG-10 | Medium | Order stats fetch all rows (up to 10K) instead of using GROUP BY aggregation |
| P3 | BUG-11 | Low | CSV export lacks rate limiting |
| P3 | SEC-4 | Low | Slug uniqueness check is not atomic (TOCTOU race condition) |

### Recommendations

**Must fix before release:**
- BUG-9 (P1) -- Implement the "Bestellungen letzter Monat" statistic. Add `orders_last_month: number` to `TenantAdminListItem`, compute a 30-day filtered count in the API, and display it in the UI. This is a hard AC failure.

**Should fix:**
- BUG-8 (P2) -- The trial-to-inactive-to-active cycle loses the original trial state. Either store the previous status before deactivation, or warn the admin during reactivation.
- BUG-7 (P2) -- Add a confirmation dialog for tenant deactivation (affects all users in that tenant).
- BUG-10 (P2) -- Replace the in-memory aggregation with a proper database GROUP BY query. Current approach caps at 10,000 orders and transfers unnecessary data.

**Nice to have:**
- BUG-11, SEC-4 (P3) -- Low-impact improvements.

---

### Previous Test Round (AC-6, AC-7, AC-8)

_The following results were recorded in a prior QA round and are preserved below for reference._

---

**Scope:** AC-6, AC-7, AC-8 (User management within tenant admin panel)

---

### AC-6: User tab per tenant -- List of all users with Name, E-Mail, Rolle, Status, letzter Login

**Result: PASS (with bugs noted)**

The Users tab is correctly rendered only in edit mode (not during tenant creation), as specified.

**Evidence:**
- `src/components/admin/tenant-form-sheet.tsx` lines 275-279: `{!isNew && (<TabsTrigger value="users" ...>)}` -- correctly hidden for new tenants.
- `src/components/admin/tenant-form-sheet.tsx` lines 369-481: Full user table with columns for Name, Rolle, Status, Letzter Login, and actions.
- `src/app/api/admin/tenants/[id]/users/route.ts` lines 14-110: GET endpoint returns `TenantUserListItem[]` with `id, email, first_name, last_name, role, status, last_sign_in_at`.
- `src/lib/types.ts` lines 426-434: `TenantUserListItem` type correctly defines all required fields.

**Data columns present in UI:**
- Name: PRESENT (lines 414-419, combined `first_name + last_name`)
- E-Mail: PRESENT but as subtitle under Name, NOT a separate column (line 417-419)
- Rolle: PRESENT (line 421-425, with `ROLE_LABELS` mapping)
- Status: PRESENT (lines 426-435, with badge display)
- Letzter Login: PRESENT (lines 437-440, formatted as `de-DE` locale date)

**Sub-verdict:** PASS -- All five data points are visible. E-Mail is displayed as a sub-label under Name rather than as a dedicated column, which is a reasonable responsive design choice.

#### BUG-1: listUsers fetches ALL platform users, not just tenant users

- **Severity:** Medium
- **Priority:** P2
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/tenants/[id]/users/route.ts` lines 67-70
- **Description:** The endpoint calls `adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })` which fetches up to 1000 auth users from the ENTIRE platform, then filters in-memory by matching `userIds`. This approach:
  1. Does not scale beyond 1000 total platform users (only page 1 is fetched, users on subsequent pages are missed).
  2. Fetches sensitive auth data (emails, metadata) for ALL users across ALL tenants, even though only a small subset is needed.
  3. Performance degrades linearly as total user count grows.
- **Steps to reproduce:** Have more than 1000 users across all tenants. Open the Users tab for any tenant. Users whose auth records are on page 2+ will show empty emails and null last_sign_in_at values.
- **Expected:** Fetch auth data only for the specific user IDs belonging to this tenant, e.g. by calling `adminClient.auth.admin.getUserById()` per user, or implementing pagination.

#### BUG-2: Rolle and Letzter Login columns hidden on mobile (below sm breakpoint)

- **Severity:** Low
- **Priority:** P3
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/admin/tenant-form-sheet.tsx` lines 402, 404
- **Description:** The table headers for "Rolle" and "Letzter Login" use `className="hidden sm:table-cell"`, hiding them on viewports below 640px. While the sheet itself is full-width on mobile, users on small screens cannot see the Role or Last Login columns. The AC specifies all five fields should be visible.
- **Steps to reproduce:** Open /admin/tenants, edit a tenant, switch to Users tab on a 375px viewport.
- **Expected:** All columns visible, or a responsive card layout that shows all data.

---

### AC-7: Invite user (on behalf of tenant) -- E-Mail + Rolle -> invitation email sent

**Result: PASS (with bugs noted)**

The invite flow is correctly implemented with proper tenant context and role selection.

**Evidence:**
- `src/components/admin/tenant-invite-dialog.tsx` lines 1-142: Dialog with email input, role selector (tenant_user / tenant_admin), submit/cancel buttons.
- `src/app/api/admin/tenants/[id]/users/invite/route.ts` lines 1-109: POST endpoint with Zod validation, tenant existence check, inactive tenant blocking, and Supabase `inviteUserByEmail()`.
- `src/lib/validations.ts` lines 410-418: `adminInviteUserSchema` validates email format and role enum.
- Invite metadata passes `tenant_id` and `role` via `data:` parameter (line 73-76), which populates `raw_user_meta_data` so the `handle_new_user` trigger (migration line 156-186) creates the user_profile correctly.

**Edge case: Invitation to already registered email:**
- PASS -- `src/app/api/admin/tenants/[id]/users/invite/route.ts` lines 80-86: Checks for `"already been registered"` in error message and returns 409 with German error text.

**Edge case: Invitation to inactive tenant:**
- PASS -- `src/app/api/admin/tenants/[id]/users/invite/route.ts` lines 63-68: Checks `tenant.status === "inactive"` and returns 403.

**Edge case: User belongs to correct tenant (tenant_id check):**
- PASS -- The invite route uses the tenant ID from the URL path (`tenantId` from params) and passes it as metadata to Supabase. The `handle_new_user` trigger reads `tenant_id` from `raw_user_meta_data` and inserts it into `user_profiles`.

#### BUG-3 (Critical): Invite error messages NOT displayed in the invite dialog

- **Severity:** High
- **Priority:** P1
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/admin/tenant-invite-dialog.tsx` lines 57-72
- **Description:** When an invitation fails (e.g., email already registered, inactive tenant, network error), the `onInvite` callback returns `false`, but the dialog does NOT display the specific error message to the user. The error path at line 67-71 only checks `if (ok)` for success but does nothing on failure. The actual error message is stored in `mutationError` in the `useAdminTenants` hook, which is rendered on the page BEHIND the open dialog (in `page.tsx` line 128-131). The user sees the dialog with no feedback.
- **Steps to reproduce:**
  1. Open /admin/tenants, edit a tenant, go to Users tab.
  2. Click "Einladen" to open the invite dialog.
  3. Enter an email that is already registered.
  4. Click "Einladung senden".
  5. The dialog shows no error message. The error appears on the page behind the dialog.
- **Expected:** The dialog should display the specific error (e.g., "Diese E-Mail-Adresse ist bereits registriert.") inline within the dialog's error Alert.
- **Root cause:** The `onInvite` prop returns `Promise<boolean>` but does not propagate the error message string. The dialog has an `error` state (`setError`) but it is never set from the API response.

#### BUG-4: Unused `UserRole` import in tenant-invite-dialog

- **Severity:** Low
- **Priority:** P3
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/admin/tenant-invite-dialog.tsx` line 23
- **Description:** `import type { UserRole } from "@/lib/types"` is imported but never used in the component. Minor code hygiene issue.

---

### AC-8: Deactivate/reactivate users via admin panel

**Result: PASS (with bugs noted)**

The toggle user status feature is correctly implemented with proper tenant verification and auth metadata sync.

**Evidence:**
- `src/components/admin/tenant-form-sheet.tsx` lines 230-236: `handleToggleUser` computes new status (active->inactive or inactive->active) and calls `onToggleUserStatus`. On success, reloads user list.
- `src/components/admin/tenant-form-sheet.tsx` lines 454-470: Dropdown menu per user row with "Deaktivieren" (for active users, red text) or "Reaktivieren" (for inactive users).
- `src/app/api/admin/tenants/[id]/users/[userId]/route.ts` lines 1-99: PATCH endpoint with full implementation.

**Security checks in toggle endpoint:**
- UUID validation: PASS (lines 21-26, both `tenantId` and `userId`)
- Auth check: PASS (line 28, `requirePlatformAdmin()`)
- Rate limiting: PASS (lines 32-33, `checkAdminRateLimit`)
- Zod validation: PASS (lines 36-45, `toggleUserStatusSchema` with `z.enum(["active", "inactive"])`)
- User-tenant relationship: PASS (lines 50-62, `.eq("id", userId).eq("tenant_id", tenantId)`)
- Profile update: PASS (lines 65-76)
- Auth metadata sync: PASS (lines 79-89, `updateUserById` with `app_metadata: { user_status: status }`)

**Edge case: Auth metadata updated when user status changes:**
- PASS -- `src/app/api/admin/tenants/[id]/users/[userId]/route.ts` lines 79-84: After updating user_profiles, the route calls `adminClient.auth.admin.updateUserById(userId, { app_metadata: { user_status: status } })`. This ensures the JWT reflects the new status on next token refresh.
- NOTE: The auth metadata update failure is treated as non-blocking (lines 86-89, only logs error). The profile is updated regardless. This is acceptable behavior as documented in the edge cases ("bis dahin (max. Supabase-Session-TTL) koennen Benutzer noch Requests machen").

#### BUG-5: UPDATE query does not include tenant_id filter (defense-in-depth gap)

- **Severity:** Low
- **Priority:** P3
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/tenants/[id]/users/[userId]/route.ts` lines 65-68
- **Description:** The UPDATE query uses `.eq("id", userId)` without also adding `.eq("tenant_id", tenantId)`. Although the preceding verification (lines 50-55) already confirms the user belongs to the tenant, defense-in-depth best practice would add the tenant filter to the UPDATE as well. This protects against theoretical TOCTOU (Time-of-Check-Time-of-Use) race conditions where the user's tenant could change between the SELECT and UPDATE.
- **Steps to reproduce:** Theoretical race condition; no practical exploit in current architecture.
- **Expected:** `adminClient.from("user_profiles").update({ status }).eq("id", userId).eq("tenant_id", tenantId)`

#### BUG-6: No confirmation dialog before deactivating a user

- **Severity:** Medium
- **Priority:** P2
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/admin/tenant-form-sheet.tsx` lines 454-470
- **Description:** Clicking "Deaktivieren" in the dropdown immediately triggers the status toggle without any confirmation prompt. Deactivating a user locks them out of the platform. An accidental click on the destructive action cannot be undone without a second deliberate action (reactivating). While reactivation is possible, a confirmation dialog would prevent unintentional deactivations.
- **Steps to reproduce:**
  1. Open /admin/tenants, edit a tenant, go to Users tab.
  2. Click the three-dot menu on any active user.
  3. Click "Deaktivieren" -- the user is immediately deactivated with no confirmation.
- **Expected:** A confirmation dialog asking "Sind Sie sicher, dass Sie diesen Benutzer deaktivieren moechten?" before proceeding.

---

### Security Audit (Red-Team Perspective)

#### Authentication & Authorization

| Check | Result | Evidence |
|-------|--------|----------|
| `requirePlatformAdmin()` on GET users | PASS | `route.ts` line 27 |
| `requirePlatformAdmin()` on POST invite | PASS | `invite/route.ts` line 28 |
| `requirePlatformAdmin()` on PATCH toggle | PASS | `[userId]/route.ts` line 28 |
| Middleware blocks non-admin page access | PASS | `middleware.ts` lines 152-158 |
| Page-level guard (isPlatformAdmin) | PASS | `page.tsx` lines 94-101 |
| Inactive user blocked by `requirePlatformAdmin` | PASS | `admin-auth.ts` lines 37-42 |

#### Input Validation

| Check | Result | Evidence |
|-------|--------|----------|
| UUID validation on tenant ID (GET users) | PASS | `route.ts` lines 20-25 |
| UUID validation on tenant ID (POST invite) | PASS | `invite/route.ts` lines 21-26 |
| UUID validation on tenant ID + user ID (PATCH) | PASS | `[userId]/route.ts` lines 21-26 |
| Zod validation on invite body | PASS | `invite/route.ts` lines 36-45, `adminInviteUserSchema` |
| Zod validation on toggle body | PASS | `[userId]/route.ts` lines 36-45, `toggleUserStatusSchema` |
| Email format validation | PASS | `validations.ts` line 413 |
| Role enum validation (tenant_user/tenant_admin only) | PASS | `validations.ts` lines 415-417 |
| Status enum validation (active/inactive only) | PASS | `validations.ts` lines 47-49 |

#### Rate Limiting

| Check | Result | Evidence |
|-------|--------|----------|
| Rate limit on POST invite | PASS | `invite/route.ts` lines 32-33 |
| Rate limit on PATCH toggle | PASS | `[userId]/route.ts` lines 32-33 |
| Rate limit on GET users | NOT PRESENT | `route.ts` -- no rate limit on read endpoint |

The GET endpoint lacks rate limiting. While read-only endpoints are typically lower risk, this endpoint fetches ALL auth users (see BUG-1), making it more expensive than average. Low priority.

#### User-Tenant Relationship Verification

| Check | Result | Evidence |
|-------|--------|----------|
| Tenant existence check (GET users) | PASS | `route.ts` lines 32-43 |
| Tenant existence check (POST invite) | PASS | `invite/route.ts` lines 50-60 |
| User-tenant ownership check (PATCH toggle) | PASS | `[userId]/route.ts` lines 50-62 |
| Profiles filtered by tenant_id (GET users) | PASS | `route.ts` line 49 |

#### SEC-1: Information Disclosure via listUsers

- **Severity:** Medium
- **Priority:** P2
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/tenants/[id]/users/route.ts` lines 67-86
- **Description:** The endpoint fetches ALL auth users across the platform (up to 1000) via `listUsers` and filters in-memory. While the response only returns data for the requested tenant's users, the server-side code processes email addresses and metadata for ALL users. In a multi-tenant SaaS platform, this violates the principle of least privilege. A compromised admin client or logging misconfiguration could expose cross-tenant user data. This also has DSGVO implications (processing more personal data than necessary).
- **Recommendation:** Use `adminClient.auth.admin.getUserById(userId)` in a loop (or parallel Promise.all) for the specific user IDs, rather than fetching all users and filtering.

#### SEC-2: No CSRF protection on mutating endpoints

- **Severity:** Low
- **Priority:** P3
- **Description:** The POST and PATCH endpoints rely on cookie-based Supabase auth. While Next.js App Router API routes require explicit fetch calls (not vulnerable to simple form-based CSRF), there is no explicit CSRF token validation. The `SameSite=Lax` cookie setting provides baseline protection for same-site requests, and the `requirePlatformAdmin()` check is strong. Risk is low but noted for defense-in-depth.

#### SEC-3: Invite does not create user_profile synchronously (relies on DB trigger)

- **Severity:** Low
- **Priority:** P3
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/tenants/[id]/users/invite/route.ts` lines 72-77
- **Description:** The invite endpoint passes `tenant_id` and `role` via the Supabase `data` parameter, relying on the `handle_new_user` database trigger to create the `user_profiles` row. If the trigger fails silently (e.g., tenant_id FK constraint violation if tenant is deleted between invite and user creation), the auth user will exist without a profile, causing auth failures. The API does not verify post-invite that the profile was created.
- **Recommendation:** Low risk in practice, since tenant deletion is not supported (AC-5: "kein Hard-Delete moeglich"). Noted for awareness.

---

### Summary

| AC | Verdict | Bugs Found |
|----|---------|------------|
| AC-6 | PASS | BUG-1 (Medium), BUG-2 (Low) |
| AC-7 | PASS | BUG-3 (High), BUG-4 (Low) |
| AC-8 | PASS | BUG-5 (Low), BUG-6 (Medium) |

### Bug Priority Ranking

| Priority | ID | Severity | Summary |
|----------|----|----------|---------|
| P1 | BUG-3 | High | Invite error messages not displayed in dialog -- user gets no feedback on failure |
| P2 | BUG-1 | Medium | listUsers fetches ALL platform users (scalability + privacy) |
| P2 | BUG-6 | Medium | No confirmation dialog before deactivating a user |
| P2 | SEC-1 | Medium | Information disclosure risk from bulk user fetch |
| P3 | BUG-2 | Low | Rolle + Letzter Login columns hidden on mobile |
| P3 | BUG-4 | Low | Unused UserRole import |
| P3 | BUG-5 | Low | UPDATE missing tenant_id filter (defense-in-depth) |
| P3 | SEC-2 | Low | No explicit CSRF protection |
| P3 | SEC-3 | Low | Profile creation relies on DB trigger |

### Recommendation

**Must fix before release:** BUG-3 (P1) -- The invite dialog must propagate error messages to the user. Currently, failed invitations produce zero visible feedback inside the dialog.

**Should fix:** BUG-1 / SEC-1 (P2) -- Replace `listUsers` with per-user lookups to fix the scalability ceiling and reduce unnecessary personal data processing. BUG-6 (P2) -- Add a confirmation step for destructive user deactivation.

**Nice to have:** BUG-2, BUG-4, BUG-5, SEC-2, SEC-3 (P3) -- Low-impact improvements.

---

## QA Test Results -- Frontend Component Review

**Tested by:** QA / Red-Team Pen-Test (Frontend Focus)
**Date:** 2026-03-02
**Build status:** PASS (`npm run build` compiles without TypeScript errors)
**Scope:** All 6 frontend components listed below, tested against spec and UI requirements.

**Components reviewed:**
1. `src/app/(protected)/admin/tenants/page.tsx` -- Admin page
2. `src/components/admin/tenant-admin-table.tsx` -- Tenant list table
3. `src/components/admin/tenant-form-sheet.tsx` -- Create/edit sheet with tabs
4. `src/components/admin/tenant-invite-dialog.tsx` -- Invite dialog
5. `src/hooks/use-admin-tenants.ts` -- Data hook
6. `src/components/layout/top-navigation.tsx` -- Navigation update

---

### 1. Page-Level Guard (`page.tsx`)

**Result: PASS**

| Check | Result | Evidence |
|-------|--------|----------|
| Checks `platform_admin` role before rendering | PASS | Line 14: `useCurrentUserRole()`, line 94: `if (!isPlatformAdmin)` |
| Loading state while role loads | PASS | Lines 84-91: Skeleton placeholder rendered when `isLoadingRole` is true |
| Access denied state for non-admins | PASS | Lines 96-101: Renders "Zugriff verweigert" message |
| Error state for data fetch failures | PASS | Lines 117-126: `error` displayed in destructive Alert with retry button |
| Mutation error state | PASS | Lines 127-131: `mutationError` displayed in destructive Alert |
| Uses `useCallback` for stable handler refs | PASS | `handleCreateNew`, `handleEdit`, `handleToggleStatus`, `handleSave`, `handleInviteUser`, `handleToggleUserStatus` all wrapped in `useCallback` |

**No issues found in page-level component.**

---

### 2. Table Requirements (`tenant-admin-table.tsx`) -- AC-2 Spec Compliance

**Result: PASS (all required elements present)**

| Requirement | Result | Evidence |
|-------------|--------|----------|
| Column: Name | PASS | Line 142 `<TableHead>Name</TableHead>`, line 162 |
| Column: Slug | PASS | Line 143, hidden below md breakpoint |
| Column: ERP-Typ | PASS | Line 144, hidden below sm breakpoint |
| Column: Status | PASS | Line 145, hidden below sm breakpoint |
| Column: Bestellungen | PASS | Line 146, right-aligned |
| Column: Letzter Upload | PASS | Line 147, hidden below lg breakpoint |
| Column: Erstellt am | PASS | Line 148, hidden below lg breakpoint |
| Column: Aktionen (actions dropdown) | PASS | Line 149 (empty header, dropdown in line 198-229) |
| Search field | PASS | Lines 98-105: Input with search icon, filters by name/slug/email |
| "Inaktive anzeigen" toggle | PASS | Lines 107-115: Button toggles `showInactive`, shows inactive count |
| Loading skeleton | PASS | Lines 77-91: 5 skeleton rows plus toolbar skeletons |
| Empty state | PASS | Lines 131-136: Building icon with contextual message (search vs. no data) |
| Status badges: Aktiv (green) | PASS | Line 26: `bg-green-100 text-green-800` |
| Status badges: Inaktiv (outline) | PASS | Line 27: `text-muted-foreground`, rendered with `variant="outline"` (line 177) |
| Status badges: Testphase (yellow) | PASS | Line 28: `bg-yellow-100 text-yellow-800` |
| "CSV exportieren" button | PASS | Lines 118-121: Button with Download icon calls `onExportCsv` |
| "Neuer Mandant" button | PASS | Lines 122-126: Button with Plus icon calls `onCreateNew` |
| Row click opens edit sheet | PASS | Line 159: `onClick={() => onEdit(tenant.id)}` on TableRow |
| Dropdown: Bearbeiten | PASS | Lines 210-212 |
| Dropdown: Deaktivieren / Reaktivieren | PASS | Lines 213-228, conditional on status |
| Dropdown trigger stops propagation | PASS | Line 204: `onClick={(e) => e.stopPropagation()}` |
| Filtered count display | PASS | Lines 240-242: "X von Y Mandanten" |

**Responsive behavior:**
- Slug hidden below 768px (md) -- acceptable
- ERP-Typ and Status hidden below 640px (sm) -- acceptable
- Letzter Upload and Erstellt am hidden below 1024px (lg) -- acceptable
- Toolbar stacks vertically on mobile (line 96: `flex-col gap-3 sm:flex-row`) -- PASS

**EXISTING BUG REFERENCE:** The "Inaktive anzeigen" toggle label text differs from spec ("+ N inaktive" vs. "Inaktive anzeigen"), but this is a UX enhancement, not a bug.

---

### 3. Form Sheet (`tenant-form-sheet.tsx`) -- AC-3, AC-4, AC-6 Spec Compliance

**Result: PASS (with existing bugs already documented)**

| Requirement | Result | Evidence |
|-------------|--------|----------|
| Tab: Profil visible always | PASS | Lines 272-274 |
| Tab: Benutzer hidden during creation | PASS | Lines 275-279: `{!isNew && (...)}` |
| Tab: Benutzer visible in edit mode | PASS | Line 275 condition evaluates true when `tenantId` is set |
| Field: Name (required) | PASS | Lines 287-296: required attr, maxLength 200 |
| Field: Slug (required, auto-generated) | PASS | Lines 299-314: auto-generated from name (line 190-193), locked after creation (line 307: `disabled={!isNew}`) |
| Field: Kontakt-E-Mail (required) | PASS | Lines 318-326: type="email", required attr |
| Field: ERP-Typ (select) | PASS | Lines 330-346: SAP/Dynamics365/Sage/Custom options |
| Field: Status (select) | PASS | Lines 348-365: active/inactive/trial options |
| Slug auto-generation from name | PASS | Lines 89-99: `generateSlug()` handles umlauts (ae/oe/ue/ss), strips special chars |
| Slug locked after creation | PASS | Line 307: `disabled={!isNew}`, line 308: `bg-muted` styling |
| Slug manually editable before creation | PASS | Lines 196-199: `handleSlugChange` allows editing, sets `slugTouched` to prevent auto-override |
| Users table: Name column | PASS | Lines 414-419 |
| Users table: E-Mail (as subtitle) | PASS | Lines 417-419 (sub-label, not dedicated column) |
| Users table: Rolle column | PASS | Lines 421-425 |
| Users table: Status column | PASS | Lines 426-435 |
| Users table: Letzter Login column | PASS | Lines 437-440 |
| Users table: Actions (deactivate/reactivate) | PASS | Lines 442-472 |
| "Benutzer einladen" button | PASS | Lines 375-383: UserPlus icon, opens invite dialog |
| Loading state for tenant data | PASS | Lines 256-261: Skeleton while loading |
| Loading state for users list | PASS | Lines 386-391: 3 skeleton rows |
| Empty state for users | PASS | Lines 392-395: "Noch keine Benutzer vorhanden." |
| Submit disabled when required fields empty | PASS | Line 497: `disabled={isMutating \|\| !name.trim() \|\| !slug.trim() \|\| !contactEmail.trim()}` |
| Submit button text changes (create vs. edit) | PASS | Line 500: `isNew ? "Erstellen" : "Speichern"` |
| Cancel button | PASS | Lines 487-492 |
| Loading spinner during mutation | PASS | Line 499: Loader2 spinner when `isMutating` |
| Form resets on open (new mode) | PASS | Lines 156-170: `useEffect` calls `resetForm()` for new, `populateForm()` for edit |
| Users reload after invite/toggle | PASS | Lines 233-236, 238-243: `loadUsers()` called on success |
| Sheet scrollable content | PASS | Line 283: `<ScrollArea>` wraps tab content |

**Slug generation quality:**
- Handles German umlauts: `ae, oe, ue, ss` -- PASS
- Strips non-alphanumeric chars -- PASS
- Removes leading/trailing hyphens -- PASS
- Max 50 chars -- PASS

**useEffect cleanup analysis:**
- Line 156-171 (`open` effect): No cleanup needed -- the `.then()` sets state synchronously. However, if the sheet is closed before the fetch resolves, `setIsLoadingTenant(false)` and `populateForm()` will update unmounted state. This causes a React warning in development but no memory leak in production (React 18+ suppresses the warning). **Low concern.**
- Line 183-186 (`activeTab` effect): Same pattern. No cleanup function. If tab changes before `onFetchUsers` resolves, stale state may be set. **Low concern.**

---

### 4. Invite Dialog (`tenant-invite-dialog.tsx`) -- AC-7 Spec Compliance

**Result: PASS (with existing BUG-3 already documented)**

| Requirement | Result | Evidence |
|-------------|--------|----------|
| E-Mail field (required) | PASS | Lines 100-108: type="email", required, placeholder |
| Role select (tenant_user / tenant_admin) | PASS | Lines 112-121: Two options |
| Success feedback | PASS | Lines 91-97: Green Alert "Einladung wurde erfolgreich gesendet." |
| Error feedback (client-side) | PASS | Lines 85-89: Red Alert for validation errors |
| Error feedback (server-side) | **FAIL** | **BUG-3 (already documented)**: API errors not shown in dialog |
| Loading state during submission | PASS | Line 134: `disabled={isMutating}`, line 134 shows Loader2 spinner |
| Submit disabled when email empty | PASS | Line 133: `disabled={isMutating \|\| !email.trim()}` |
| Form resets on close | PASS | Lines 45-50: `reset()` clears email, role, error, success |
| Cancel button | PASS | Lines 125-131 |
| Dialog renders on top of sheet | PASS | Radix Dialog renders in a portal; configured in line 510-518 of form-sheet |

**EXISTING BUG-3** remains the most critical frontend issue: when `onInvite` returns `false`, the dialog shows NO error feedback. The error is only visible on the page behind the sheet.

**EXISTING BUG-4** confirmed: `UserRole` type imported on line 23 but never referenced in component body.

---

### 5. Data Hook (`use-admin-tenants.ts`) -- Quality Review

**Result: PASS (well-structured)**

| Check | Result | Evidence |
|-------|--------|----------|
| Initial data fetch on mount | PASS | Lines 58-60: `useEffect` calls `fetchTenants()` |
| Error handling on fetch | PASS | Lines 43-44: Sets error message, clears tenants |
| Network error handling | PASS | Lines 50-52: Catches fetch exceptions |
| Loading state managed correctly | PASS | Lines 36-37, finally block at line 54 |
| Mutation error cleared before each mutation | PASS | Lines 65, 95, 155, 184 |
| Mutation loading state (isMutating) | PASS | Set true at start, false in finally blocks |
| Auto-refetch after create | PASS | Line 80: `await fetchTenants()` |
| Auto-refetch after update | PASS | Line 110: `await fetchTenants()` |
| CSV export download mechanism | PASS | Lines 210-230: Blob + Object URL + click + cleanup |
| Object URL revoked after download | PASS | Line 226: `URL.revokeObjectURL(url)` |
| All callbacks wrapped in useCallback | PASS | `fetchTenants`, `createTenant`, `updateTenant`, `fetchTenant`, `fetchTenantUsers`, `inviteUser`, `toggleUserStatus`, `exportCsv` |
| No memory leaks in useEffect | PASS | Single effect with stable dependency; no subscriptions or intervals |
| TypeScript return type explicitly declared | PASS | Lines 12-26: `UseAdminTenantsReturn` interface |

**Potential issue:** `fetchTenantUsers` returns `[]` on any error (line 148), with no error feedback to the UI. The users tab silently shows "Noch keine Benutzer vorhanden" if the fetch fails. This is a minor UX gap -- the user cannot distinguish between "no users exist" and "failed to load users".

---

### 6. Navigation (`top-navigation.tsx`) -- AC-1 Spec Compliance

**Result: PASS**

| Requirement | Result | Evidence |
|-------------|--------|----------|
| "Mandanten" link present | PASS | Line 31: `{ href: "/admin/tenants", label: "Mandanten", adminOnly: true }` |
| Placed in admin section | PASS | Line 31: Immediately after "Haendler-Profile" (line 30) |
| Only visible to platform_admin | PASS | Lines 39-42: `navLinks` filtered by `!link.adminOnly \|\| isPlatformAdmin` |
| Active state highlighting works | PASS | Lines 76-79 (mobile), 112-115 (desktop): `pathname.startsWith(href)` matches `/admin/tenants` |
| Mobile navigation includes link | PASS | Lines 74-95: Same `navLinks` array used for mobile Sheet nav |

---

### 7. General Frontend Quality

**Build & Lint:**

| Check | Result | Evidence |
|-------|--------|----------|
| TypeScript compiles | PASS | `npm run build` succeeds with zero errors |
| No unused imports (critical) | **BUG-4** | `UserRole` unused in tenant-invite-dialog.tsx line 23 |
| All shadcn/ui components used (no custom re-implementations) | PASS | Uses Sheet, Tabs, Dialog, Table, Badge, Select, Input, Button, Label, ScrollArea, Skeleton, DropdownMenu, Alert -- all from `@/components/ui/` |

**Responsive Design:**

| Breakpoint | Check | Result |
|------------|-------|--------|
| 375px (mobile) | Table columns hidden appropriately | PASS: Only Name + Bestellungen + Actions visible |
| 375px (mobile) | Toolbar stacks vertically | PASS: `flex-col` on mobile |
| 375px (mobile) | Sheet full-width | PASS: `w-full` on SheetContent |
| 375px (mobile) | Navigation hamburger menu | PASS: `md:hidden` on hamburger |
| 768px (tablet) | Slug column appears | PASS: `hidden md:table-cell` |
| 768px (tablet) | ERP-Typ + Status columns appear | PASS: `hidden sm:table-cell` |
| 1440px (desktop) | All columns visible | PASS: No `hidden` on Name, all breakpoints satisfied |

**Loading States:**

| Component | Loading State | Result |
|-----------|--------------|--------|
| Page (role loading) | Skeleton | PASS |
| Tenant list | 5 skeleton rows | PASS |
| Form sheet (tenant data) | 4 skeleton fields | PASS |
| Users tab | 3 skeleton rows | PASS |
| Submit button | Loader2 spinner + disabled | PASS |
| Invite dialog | Loader2 spinner + disabled | PASS |

**Error Handling:**

| Component | Error Handling | Result |
|-----------|---------------|--------|
| Page fetch error | Destructive Alert + retry | PASS |
| Page mutation error | Destructive Alert | PASS |
| Invite dialog (client) | Error Alert | PASS |
| Invite dialog (server) | **MISSING** | BUG-3 |
| Users tab fetch error | Silent (empty state) | **NEW FINDING -- BUG-12** |
| CSV export error | mutationError set | PASS |

---

### New Bug Found in This Review

#### BUG-12: Users tab silently shows empty state on fetch failure

- **Severity:** Medium
- **Priority:** P2
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/hooks/use-admin-tenants.ts` lines 137-150 and `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/admin/tenant-form-sheet.tsx` lines 392-395
- **Description:** When the `fetchTenantUsers` API call fails (network error, 500, auth failure), the hook returns an empty array `[]` without setting any error state. The Users tab then displays "Noch keine Benutzer vorhanden." -- identical to the genuine empty state. The admin cannot distinguish between "this tenant truly has no users" and "the user list failed to load." No retry mechanism is available on the Users tab.
- **Steps to reproduce:**
  1. Open /admin/tenants, edit a tenant that has users.
  2. Simulate a network failure (e.g., disconnect, or API returns 500).
  3. Switch to the Users tab.
  4. The tab shows "Noch keine Benutzer vorhanden." with no error indication.
- **Expected:** An error state should be shown (e.g., "Benutzer konnten nicht geladen werden.") with a retry button, distinct from the genuine empty state.

---

### Consolidated Bug Summary (All Rounds)

| Priority | ID | Severity | Component | Summary |
|----------|----|----------|-----------|---------|
| P1 | BUG-3 | High | tenant-invite-dialog.tsx | Invite error messages NOT shown in dialog -- user gets zero feedback on failure |
| P1 | BUG-9 | High | route.ts (GET tenants), types.ts | "Bestellungen letzter Monat" stat missing -- AC-9 hard FAIL |
| P2 | BUG-1 | Medium | users/route.ts | listUsers fetches ALL platform users (scalability + privacy) |
| P2 | BUG-6 | Medium | tenant-form-sheet.tsx | No confirmation before deactivating a user |
| P2 | BUG-7 | Medium | tenant-admin-table.tsx, page.tsx | No confirmation before deactivating a tenant |
| P2 | BUG-8 | Medium | page.tsx | Toggle status loses "trial" state on reactivation |
| P2 | BUG-10 | Medium | route.ts (GET tenants) | Order stats fetch all rows instead of GROUP BY |
| P2 | BUG-12 | Medium | use-admin-tenants.ts, tenant-form-sheet.tsx | Users tab shows empty state on fetch failure (no error feedback) |
| P2 | SEC-1 | Medium | users/route.ts | Information disclosure from bulk user fetch |
| P3 | BUG-2 | Low | tenant-form-sheet.tsx | Rolle + Letzter Login hidden on mobile |
| P3 | BUG-4 | Low | tenant-invite-dialog.tsx | Unused UserRole import |
| P3 | BUG-5 | Low | [userId]/route.ts | UPDATE missing tenant_id filter |
| P3 | BUG-11 | Low | export/route.ts | CSV export lacks rate limiting |
| P3 | SEC-2 | Low | All POST/PATCH routes | No explicit CSRF token |
| P3 | SEC-3 | Low | invite/route.ts | Profile creation relies on DB trigger |
| P3 | SEC-4 | Low | route.ts (POST tenants) | Slug uniqueness TOCTOU race condition |

**Total: 16 findings (2 P1, 7 P2, 7 P3)**

### AC Verdict Summary (All Rounds Combined)

| AC | Verdict | Blocking Bugs |
|----|---------|---------------|
| AC-1 | **PASS** | None |
| AC-2 | **PASS** | None |
| AC-3 | **PASS** | None |
| AC-4 | **PASS** | None |
| AC-5 | **PASS** | BUG-7, BUG-8 (non-blocking) |
| AC-6 | **PASS** | BUG-1, BUG-2, BUG-12 (non-blocking) |
| AC-7 | **PASS** | BUG-3 (should fix before release) |
| AC-8 | **PASS** | BUG-5, BUG-6 (non-blocking) |
| AC-9 | **FAIL** | BUG-9 (missing "Bestellungen letzter Monat") |
| AC-10 | **PASS** | BUG-11 (non-blocking) |

### Release Recommendation

**NOT ready for release.** One acceptance criterion (AC-9) is failing due to BUG-9. Two P1 bugs must be resolved:

1. **BUG-9 (P1):** Implement "Bestellungen letzter Monat" statistic in type, API, and UI.
2. **BUG-3 (P1):** Propagate invite error messages into the invite dialog so users see failure feedback.

After fixing these two, the feature can move to Deployed status.

## Deployment
_To be added by /deploy_
