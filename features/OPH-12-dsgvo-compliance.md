# OPH-12: DSGVO-Compliance & Datenaufbewahrung

## Status: Planned
**Created:** 2026-02-27
**Last Updated:** 2026-02-27

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) — Datenschutz beginnt bei der Identität

## Kontext
Bestellungen enthalten personenbezogene Daten (Namen und Adressen von Endkunden der Händler). Als Plattform-Betreiber sind wir Auftragsverarbeiter (AV) für die Dentalhersteller (Verantwortliche). DSGVO-Konformität ist keine Option, sondern Pflicht.

## User Stories
- Als Mandant möchte ich sicherstellen, dass meine Bestelldaten nur so lange gespeichert werden, wie es für die Verarbeitung notwendig ist, damit wir unsere DSGVO-Pflichten als Verantwortliche erfüllen.
- Als Mandanten-Admin möchte ich eine Datenaufbewahrungsrichtlinie für meinen Mandanten konfigurieren (z.B. automatische Löschung nach 90 Tagen), damit alte Bestelldaten nicht unnötig gespeichert bleiben.
- Als Mitarbeiter möchte ich eine einzelne Bestellung und ihre Original-Dateien auf Anfrage löschen können (Recht auf Löschung des Händler-Endkunden), damit wir Auskunfts- und Löschanfragen nachkommen können.
- Als Platform-Admin möchte ich einen vollständigen Audit-Log aller Datenzugriffe und -änderungen einsehen können, damit wir bei Datenschutzvorfällen Rechenschaft ablegen können.
- Als Platform-Betreiber möchte ich einen Auftragsverarbeitungsvertrag (AVV) im System verfügbar haben, damit die rechtliche Grundlage für die Datenverarbeitung dokumentiert ist.

## Acceptance Criteria
- [ ] Alle Daten werden ausschließlich auf EU-Servern gespeichert (Supabase EU-Region: eu-central-1 Frankfurt)
- [ ] Konfigurierbare Datenaufbewahrungsdauer pro Mandant (Standard: 90 Tage; min: 30 Tage; max: 365 Tage)
- [ ] Automatischer Lösch-Job: läuft täglich, löscht Bestellungen (inkl. Dateien in Storage und canonical JSON) nach Ablauf der Aufbewahrungsdauer
- [ ] Manuelle Löschung einzelner Bestellungen durch Mandanten-Admin möglich (inkl. aller zugehörigen Dateien)
- [ ] Nach Löschung: keine Wiederherstellungsmöglichkeit (Hard-Delete, nicht Soft-Delete für personenbezogene Daten)
- [ ] Audit-Log: alle Datenzugriffe (Lesen, Ändern, Löschen) werden protokolliert (Benutzer, Timestamp, Aktion, Objekt-ID)
- [ ] Audit-Log ist unveränderlich (Append-only, kein DELETE auf Audit-Einträge)
- [ ] Datenschutzerklärung und AVV-Link im Benutzerbereich
- [ ] Export der eigenen Daten (Benutzer kann alle seine Bestelldaten als ZIP herunterladen — "Recht auf Datenportabilität")
- [ ] Bei Mandanten-Löschung (OPH-8): vollständige Datenlöschung innerhalb 30 Tagen

## Edge Cases
- Was passiert, wenn eine Bestellung exportiert wurde, aber die Aufbewahrungsdauer abläuft? → Automatische Löschung findet trotzdem statt; Mandant wird per E-Mail 14 Tage vorher gewarnt
- Was passiert, wenn ein Benutzer einen Audit-Log-Eintrag löschen möchte? → Technisch nicht möglich (Append-only-Tabelle ohne DELETE-RLS)
- Was passiert, wenn eine Bestellung eine aktive Verarbeitung hat (Status "In Extraktion"), wenn die Löschanfrage kommt? → Manuelles Löschen nicht möglich während aktiver Verarbeitung; nach Abschluss möglich

## Technical Requirements
- EU-Region: Supabase-Projekt in `eu-central-1` (Frankfurt)
- Automatischer Lösch-Job: Supabase Cron (pg_cron) oder separater Cron-Service
- Audit-Log: separate Tabelle `audit_log` mit RLS: Lesen nur für `platform_admin` und eigener `tenant_id`; kein DELETE für niemanden
- Storage-Löschung: Supabase Storage API zum Löschen von Bucket-Objekten
- Lösch-Quittierung: E-Mail-Bestätigung nach vollständiger Datenlöschung

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
