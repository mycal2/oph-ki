# OPH-11: Bestellhistorie & Dashboard

## Status: Planned
**Created:** 2026-02-27
**Last Updated:** 2026-02-27

## Dependencies
- Requires: OPH-6 (ERP-Export) — Bestellungen müssen vollständig durch die Pipeline gelaufen sein

## User Stories
- Als Mitarbeiter möchte ich eine Übersicht aller eingegangenen Bestellungen (sortiert nach Datum, neueste zuerst) sehen, damit ich den Überblick über alle zu bearbeitenden Bestellungen behalte.
- Als Mitarbeiter möchte ich Bestellungen nach Status filtern (Neu / In Prüfung / Freigegeben / Exportiert / Fehler), damit ich gezielt offene Bestellungen bearbeiten kann.
- Als Mitarbeiter möchte ich eine Bestellungssuche nach Händlername, Bestellnummer oder Datum durchführen, damit ich eine spezifische Bestellung schnell finde.
- Als Mandanten-Admin möchte ich ein Dashboard mit aggregierten Kennzahlen sehen (Bestellungen diese Woche, durchschnittliche Bearbeitungszeit, Extraktionsgenauigkeit), damit ich die Nutzung und Effizienz im Blick habe.
- Als Mitarbeiter möchte ich aus der Liste direkt in die Review-Ansicht einer Bestellung springen, damit die Navigation effizient ist.

## Acceptance Criteria
- [ ] Listenansicht: Tabelle mit Spalten: Eingangsdatum, Händler, Bestellnummer (extrahiert), Status, Bearbeiter (letzter), Aktionen
- [ ] Statusfilter als Tabs oder Dropdown: Alle / Neu / In Prüfung / Freigegeben / Exportiert / Fehler
- [ ] Freitextsuche über Händlername und Bestellnummer (extrahiert)
- [ ] Datumsbereich-Filter (von/bis)
- [ ] Paginierung: 25 Bestellungen pro Seite
- [ ] Dashboard-Kacheln: Bestellungen heute, diese Woche, diesen Monat; offene Bestellungen (nicht exportiert); Fehlerrate letzte 7 Tage
- [ ] Klick auf Bestellung → direkter Sprung zur Review-Ansicht (OPH-5)
- [ ] Bestellstatus wird in Echtzeit aktualisiert (Polling alle 30 Sekunden oder Supabase Realtime)
- [ ] Alle Daten sind mandantenspezifisch (RLS)

## Edge Cases
- Was passiert, wenn ein Mandant tausende Bestellungen hat? → Paginierung und Datenbankindexes sichern Performance (< 500ms Ladezeit)
- Was passiert, wenn eine Suche keine Ergebnisse liefert? → "Keine Bestellungen gefunden" mit Hinweis auf aktive Filter
- Was passiert, wenn ein Benutzer nur bestimmte Bestellungen sehen soll (zukünftiges Feature)? → MVP: alle Benutzer eines Mandanten sehen alle Bestellungen; Berechtigungen auf Bestellungsebene ist Post-MVP

## Technical Requirements
- Supabase Realtime oder Polling für Live-Status-Updates
- Datenbankindizes auf `tenant_id`, `status`, `created_at`, `dealer_id`
- Server-Side Pagination mit Cursor oder Offset
- Dashboard-Kennzahlen: aggregierte SQL-Queries (keine separates Analytics-Tool für MVP)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
