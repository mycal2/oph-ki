# OPH-8: Admin: Mandanten-Management

## Status: Planned
**Created:** 2026-02-27
**Last Updated:** 2026-03-01

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

- [ ] **AC-1:** Admin-Bereich `/admin/tenants` ist nur für `platform_admin`-Rolle zugänglich (Middleware + Seitenguard + API)
- [ ] **AC-2:** Mandanten-Liste zeigt: Name, Slug, ERP-Typ, Status (Aktiv/Inaktiv/Testphase), Bestellungen gesamt, Datum letzter Upload, Datum erstellt
- [ ] **AC-3:** Neuen Mandanten anlegen: Felder Name (Pflicht), Slug (Pflicht, URL-sicher, eindeutig), Kontakt-E-Mail (Pflicht), ERP-Typ (SAP/Dynamics365/Sage/Custom), Status (aktiv/inaktiv/Testphase)
- [ ] **AC-4:** Mandanten bearbeiten: alle Felder aus AC-3 außer Slug (Slug ist unveränderlich nach Erstellung)
- [ ] **AC-5:** Mandant deaktivieren → Status `inactive`; Mandant reaktivieren → Status `active`; kein Hard-Delete möglich
- [ ] **AC-6:** Benutzer-Tab pro Mandant: Liste aller Benutzer mit Name, E-Mail, Rolle, Status, letzter Login
- [ ] **AC-7:** Benutzer einladen (im Namen des Mandanten): E-Mail-Adresse + Rolle auswählen (tenant_user / tenant_admin) → Einladungs-E-Mail wird versendet
- [ ] **AC-8:** Benutzer deaktivieren/reaktivieren über den Admin-Bereich
- [ ] **AC-9:** Nutzungsstatistiken pro Mandant: Bestellungen gesamt, Bestellungen letzter Monat, letzter Upload-Zeitpunkt
- [ ] **AC-10:** CSV-Export: eine CSV-Datei mit allen Mandanten (Name, Slug, Status, ERP-Typ, Kontakt-E-Mail, erstellt am)

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
_To be added by /qa_

## Deployment
_To be added by /deploy_
