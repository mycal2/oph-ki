# OPH-2: Bestellungs-Upload (Web: .eml, PDF, Excel)

## Status: Planned
**Created:** 2026-02-27
**Last Updated:** 2026-02-27

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) — Upload ist nur für authentifizierte Benutzer

## User Stories
- Als Mitarbeiter möchte ich eine E-Mail-Datei (.eml) aus meinem E-Mail-Programm exportieren und hochladen, damit das System die darin enthaltene Bestellung verarbeiten kann.
- Als Mitarbeiter möchte ich eine PDF-Datei mit einer Bestellung hochladen, damit Bestellungen, die als PDF-Anhang kommen, verarbeitet werden können.
- Als Mitarbeiter möchte ich eine Excel-Datei mit einer Bestellung hochladen, damit Bestellungen in Tabellenformat verarbeitet werden können.
- Als Mitarbeiter möchte ich mehrere Dateien gleichzeitig hochladen (z.B. .eml + zugehörige PDFs), damit zusammengehörige Dokumente gemeinsam verarbeitet werden.
- Als Mitarbeiter möchte ich nach dem Upload sofort sehen, ob das Hochladen erfolgreich war und die Verarbeitung gestartet wurde.

## Acceptance Criteria
- [ ] Unterstützte Dateiformate: `.eml`, `.pdf`, `.xlsx`, `.xls`, `.csv`
- [ ] Maximale Dateigröße pro Datei: 25 MB
- [ ] Maximale Anzahl Dateien pro Upload: 10
- [ ] Hochgeladene Dateien werden sicher in Supabase Storage gespeichert (mandantenspezifischer Bucket-Pfad)
- [ ] Upload-Progress wird dem Benutzer angezeigt (Fortschrittsbalken)
- [ ] Nach erfolgreichem Upload wird sofort die Händler-Erkennung (OPH-3) und Extraktion (OPH-4) ausgelöst
- [ ] Benutzer wird zur Bestellübersicht weitergeleitet nach Upload
- [ ] Ungültige Dateitypen werden abgelehnt mit verständlicher Fehlermeldung
- [ ] Dateien sind nur für Benutzer des eigenen Mandanten zugänglich (RLS auf Storage)
- [ ] Original-Dateien werden dauerhaft gespeichert (für Audit / Nachvollziehbarkeit)

## Edge Cases
- Was passiert, wenn eine Datei ein ungültiges Format hat (z.B. `.exe`)? → Ablehnung mit Fehlermeldung, kein Upload
- Was passiert, wenn eine Datei zu groß ist (> 25 MB)? → Fehlermeldung vor dem Upload
- Was passiert, wenn der Upload während des Transfers abbricht? → Fehlermeldung, Benutzer kann erneut versuchen; keine halb-gespeicherten Dateien
- Was passiert, wenn eine exakt gleiche Datei bereits hochgeladen wurde? → Warnung ("Diese Datei wurde bereits am [Datum] hochgeladen"), Benutzer kann trotzdem fortfahren
- Was passiert, wenn die KI-Extraktion nach dem Upload fehlschlägt? → Bestellung wird mit Status "Extraktionsfehler" gespeichert, manuelle Nachbearbeitung möglich
- Was passiert, wenn Supabase Storage nicht erreichbar ist? → Fehlermeldung "Upload momentan nicht möglich, bitte später erneut versuchen"

## Technical Requirements
- Supabase Storage für Dateiablage (Bucket: `orders/{tenant_id}/{order_id}/`)
- Datei-Hash (SHA-256) für Duplikat-Erkennung
- Asynchrone Verarbeitung nach Upload (Hintergrundprozess für Extraktion)
- Max. Upload-Größe in Next.js API-Route konfiguriert (25 MB)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
