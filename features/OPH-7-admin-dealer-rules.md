# OPH-7: Admin: Händler-Regelwerk-Verwaltung

## Status: In Progress
**Created:** 2026-02-27
**Last Updated:** 2026-03-01

## Dependencies
- Requires: OPH-3 (Händler-Erkennung) — Admin verwaltet die Erkennungsregeln, die OPH-3 nutzt
- Requires: OPH-1 (Auth) — nur Platform-Admins haben Zugang

## Konzept
Platform-Admins verwalten den globalen Katalog aller Händler-Profile. Diese Profile sind die Grundlage für die automatische Händler-Erkennung (OPH-3) und liefern Kontextinformationen für die KI-Extraktion (OPH-4). Da ein Händler-Format für alle Mandanten gilt, wird Konfigurationsaufwand dramatisch reduziert.

## User Stories
- Als Platform-Admin möchte ich neue Händler-Profile anlegen (Name, Erkennungsregeln, Format-Typ), damit neue Händler automatisch erkannt werden können.
- Als Platform-Admin möchte ich bestehende Händler-Profile bearbeiten und Erkennungsregeln verfeinern, damit die Erkennungsrate kontinuierlich verbessert wird.
- Als Platform-Admin möchte ich für jeden Händler Extraktions-Hints hinterlegen (z.B. "Artikelnummer steht in der zweiten Spalte der Tabelle"), damit Claude präzisere Ergebnisse liefert.
- Als Platform-Admin möchte ich eine Händler-Erkennung mit einer Test-Datei simulieren, damit ich neue Regeln validieren kann, bevor sie live gehen.
- Als Platform-Admin möchte ich sehen, welche Bestellungen für jeden Händler verarbeitet wurden und wie hoch die durchschnittliche Extraktionsgenauigkeit war.

## Acceptance Criteria
- [ ] Admin-Bereich ist nur für Benutzer mit Rolle `platform_admin` zugänglich
- [ ] CRUD für Händler-Profile: Name, Beschreibung, Status (aktiv/inaktiv)
- [ ] Pro Händler: konfigurierbare Erkennungsregeln: E-Mail-Domains, Absender-Adressen (Wildcards), Betreff-Pattern (Regex), Dateiname-Pattern
- [ ] Pro Händler: Extraktions-Hints (Freitext-Felder, die in den Claude-Prompt einfließen)
- [ ] Pro Händler: Format-Typ (Email-Text, PDF-Tabelle, Excel-Template, Gemischt)
- [ ] Test-Funktion: Admin lädt eine Beispieldatei hoch → System zeigt, welcher Händler erkannt worden wäre und mit welchem Konfidenz-Score
- [ ] Händler-Profile werden sofort nach Speichern in der Produktion wirksam (kein Deploy-Zyklus)
- [ ] Audit-Log: Alle Änderungen an Händler-Profilen werden mit Admin-User und Timestamp protokolliert
- [ ] Händler-Liste zeigt: Name, Anzahl verarbeiteter Bestellungen (total), Datum letzter Bestellung, Status

## Edge Cases
- Was passiert, wenn ein Händler-Profil deaktiviert wird, während noch Bestellungen in Verarbeitung sind? → Laufende Verarbeitungen werden noch mit dem alten Profil abgeschlossen; neue Uploads erkennen den Händler nicht mehr
- Was passiert, wenn zwei Händler-Profile dieselbe Erkennungsregel haben? → System warnt beim Speichern ("Regelkonflikt mit Händler X"); Admin muss auflösen
- Was passiert, wenn ein Händler-Profil gelöscht wird? → Soft-Delete (historische Bestellungen behalten die Zuordnung); keine Datenverluste

## Technical Requirements
- Nur `platform_admin`-Rolle kann `dealers`-Tabelle schreiben (RLS)
- Regex-Validierung der Pattern-Felder im Frontend und Backend
- Extraktions-Hints werden in KI-Prompt interpoliert (sicher: kein Prompt-Injection möglich)
- Händler-Profile werden gecacht (TTL: 5 Minuten) für Performance

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview
Platform-Admins get a dedicated admin section to manage the global dealer catalogue. The `dealers` table already exists with all recognition rule fields and the correct RLS policies. This feature adds the management UI, two small schema additions, and a set of admin-only API routes.

---

### Component Structure

```
Admin Dealers Page  (/admin/dealers)  — platform_admin only
+-- PageHeader ("Händler-Profile", + "Neuer Händler" button)
+-- DealerAdminTable
|   +-- Row: Name | Format | Stadt | Bestellungen | Letzte Bestellung | Status | Aktionen
|   +-- Aktionen: [Bearbeiten] [Aktivieren / Deaktivieren]
|   +-- Loading skeleton / empty state
+-- DealerFormSheet  (slides in from right — create OR edit)
|   +-- Tab: Profil
|   |   +-- Name (required)
|   |   +-- Beschreibung (optional)
|   |   +-- Format-Typ (E-Mail Text | PDF-Tabelle | Excel | Gemischt)
|   |   +-- Adresse (Strasse, PLZ, Stadt, Land)
|   |   +-- Status toggle (Aktiv / Inaktiv)
|   +-- Tab: Erkennungsregeln
|   |   +-- E-Mail-Domains (tag input)
|   |   +-- Absender-Adressen (tag input, wildcards allowed)
|   |   +-- Betreff-Pattern (tag input, regex validated on entry)
|   |   +-- Dateiname-Pattern (tag input, regex validated on entry)
|   |   +-- Regelkonflikt-Warnung (if a rule exists in another dealer)
|   +-- Tab: Extraktions-Hints
|   |   +-- Freitext textarea (fed into Claude prompt as context)
|   |   +-- Character count + help text
|   +-- Tab: Audit-Log  (edit mode only)
|       +-- Table: Datum | Admin | Aktion | Geänderte Felder
+-- DealerTestDialog  (modal)
    +-- File dropzone (email / PDF / Excel)
    +-- [Test starten] button
    +-- Result: "Erkannter Händler: Henry Schein GmbH (Konfidenz: 87%)"
    +-- Or: "Kein Händler erkannt"
```

---

### Data Model

**Additions to `dealers` table:**
- `description TEXT` — free-text description of the dealer (new)
- `format_type` — extended with `'mixed'` option (in addition to existing email_text, pdf_table, excel)

*(All recognition rule arrays and address fields already exist)*

**New table: `dealer_audit_log`**
Each entry records:
- Which dealer was changed
- Which platform admin made the change (user ID + email)
- Action type: created | updated | deactivated | reactivated
- Snapshot of changed fields (before and after values as JSON)
- Timestamp

---

### API Routes (New — all require platform_admin role)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/dealers` | All dealers (incl. inactive) with order counts + last order date |
| POST | `/api/admin/dealers` | Create a new dealer profile |
| GET | `/api/admin/dealers/[id]` | Full dealer detail |
| PATCH | `/api/admin/dealers/[id]` | Update dealer (writes audit entry) |
| DELETE | `/api/admin/dealers/[id]` | Soft-delete (sets active = false) |
| GET | `/api/admin/dealers/[id]/audit` | Audit log for a specific dealer |
| POST | `/api/admin/dealers/test-recognition` | Run a file through recognition, return match + confidence |

---

### Tech Decisions

1. **Slide-out Sheet for create/edit** — Admin can keep the dealer list visible while editing; faster than full page navigation. Consistent with modern admin UIs.

2. **Tag inputs for array fields** — Recognition rules are string arrays. A tag input (type → Enter to add, × to remove) prevents comma/newline typos and makes the array nature of the data visually clear.

3. **Real-time regex validation** — Subject and filename patterns are validated against `new RegExp(value)` immediately on entry. Invalid regex is rejected before the tag is added.

4. **Conflict detection on save** — The API checks if any of the submitted domains/addresses/patterns already exist in another active dealer before persisting. Returns a warning (not a hard block) with the conflicting dealer name. The frontend shows this as a dismissible alert.

5. **Audit log written at API level** — On PATCH/DELETE, the API reads the current row, computes a diff, and writes to `dealer_audit_log`. Simpler and more debuggable than database triggers.

6. **Test recognition reuses existing logic** — The test endpoint runs the same matching algorithm as OPH-3/OPH-4 against the uploaded file content. No file is persisted. Returns dealer name + confidence score, or "no match".

7. **Order counts in a single query** — The list endpoint aggregates `COUNT(*)` and `MAX(created_at)` from the orders table per dealer in one SQL query — no N+1 problem.

8. **Navigation: platform_admin only section** — A new "Admin" group appears in the sidebar/top-nav only when `useCurrentUserRole()` returns `platform_admin`. Regular users never see it.

---

### Navigation Addition

```
Settings:  Team | Händler-Zuordnungen
Admin:     Händler-Profile    ← NEW (platform_admin only)
```

---

### No New npm Packages

All required UI components are already installed:
- `Sheet` — slide-out panel
- `Tabs` — tabbed form sections
- `Badge` + `Input` — tag inputs (composed manually)
- `Dialog` — test recognition modal
- `Table` — dealer list and audit log

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
