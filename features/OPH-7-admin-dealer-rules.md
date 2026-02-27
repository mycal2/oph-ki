# OPH-7: Admin: Händler-Regelwerk-Verwaltung

## Status: Planned
**Created:** 2026-02-27
**Last Updated:** 2026-02-27

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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
