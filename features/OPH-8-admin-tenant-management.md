# OPH-8: Admin: Mandanten-Management

## Status: Planned
**Created:** 2026-02-27
**Last Updated:** 2026-02-27

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) — Mandanten-Struktur muss bestehen

## User Stories
- Als Platform-Admin möchte ich neue Mandanten (Dentalhersteller) anlegen und ihnen eine eigene isolierte Umgebung einrichten, damit neue Kunden schnell onboardet werden können.
- Als Platform-Admin möchte ich Mandanten aktivieren und deaktivieren, damit ich den Systemzugang bei Vertragsproblemen oder Offboarding steuern kann.
- Als Platform-Admin möchte ich für jeden Mandanten grundlegende Konfiguration pflegen (Name, Land, Kontakt, ERP-System-Typ), damit wir wissen, welches ERP-Format für diesen Kunden vorbereitet werden muss.
- Als Platform-Admin möchte ich die Benutzer eines Mandanten einsehen und verwalten (einladen, deaktivieren), damit ich Support-Anfragen schnell bearbeiten kann.
- Als Platform-Admin möchte ich Nutzungsstatistiken pro Mandant sehen (Bestellungen/Monat, API-Kosten), damit wir die Abrechnung vorbereiten können.

## Acceptance Criteria
- [ ] Platform-Admin-Bereich ist nur für `platform_admin`-Rolle zugänglich
- [ ] CRUD für Mandanten: Firmenname, Land, Kontakt-E-Mail, ERP-Typ (SAP / Dynamics 365 / Sage / Sonstige), Status (aktiv/inaktiv/Testphase)
- [ ] Bei Mandanten-Erstellung: automatische Erstellung eines initialen Tenant-Admin-Accounts (E-Mail-Einladung)
- [ ] Benutzer-Liste pro Mandant: Name, E-Mail, Rolle, letzter Login, Status
- [ ] Deaktivierung eines Mandanten: alle zugehörigen Benutzer-Sessions werden invalidiert; Login verweigert
- [ ] Nutzungsstatistiken: Anzahl verarbeiteter Bestellungen (gesamt, letzter Monat), verwendete Claude API-Tokens (geschätzte Kosten), letzter Upload-Zeitpunkt
- [ ] Mandanten-Daten-Export: Download einer CSV mit allen Mandanteninformationen (für Buchhaltung)

## Edge Cases
- Was passiert, wenn ein Mandant deaktiviert wird, während ein Mitarbeiter gerade eine Bestellung bearbeitet? → Aktive Session wird bei nächstem API-Request invalidiert; Benutzer sieht Hinweis "Ihr Konto wurde deaktiviert"
- Was passiert, wenn ein Mandant reaktiviert wird? → Alle Benutzer können sich sofort wieder einloggen; historische Daten sind vollständig erhalten
- Was passiert, wenn ein Mandant versehentlich gelöscht werden soll? → Kein Hard-Delete; nur Deaktivierung möglich; Datenlöschung nur per separatem DSGVO-Prozess (OPH-12)

## Technical Requirements
- Admin-Panel als separater Bereich `/admin` in der Next.js App (Middleware prüft `platform_admin`-Rolle)
- Mandanten-Tabelle: `tenants` mit Status, ERP-Typ, Metadaten
- Nutzungsstatistiken: aggregierte Queries aus `orders`-Tabelle (kein separates Analytics-System für MVP)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
