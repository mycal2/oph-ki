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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
