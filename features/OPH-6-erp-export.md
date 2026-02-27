# OPH-6: ERP-Export & Download

## Status: Planned
**Created:** 2026-02-27
**Last Updated:** 2026-02-27

## Dependencies
- Requires: OPH-5 (Bestellprüfung) — nur freigegebene Bestellungen können exportiert werden
- Requires: OPH-9 (Admin: ERP-Mapping-Konfiguration) — für produktiven Betrieb; MVP-Phase: einfache Basiskonfiguration per Code

## Konzept
Das Canonical JSON (aus OPH-4) wird per kundenspeziifischen Mapping-Regeln in das Zielformat des ERP-Systems des Mandanten transformiert. Der Benutzer lädt die fertige Datei herunter und importiert sie manuell in sein ERP.

Unterstützte Ausgabeformate (MVP):
- **CSV** (konfigurierbare Spalten, Trennzeichen, Zeichensatz)
- **XML** (frei konfigurierbares Schema)
- **JSON** (direkte Ausgabe des Canonical JSON oder transformiert)

Spätere Erweiterung (P1+):
- SAP IDOC-Format
- Dynamics 365 Import-Format
- Sage-spezifische Formate

## User Stories
- Als Mitarbeiter möchte ich eine freigegebene Bestellung mit einem Klick in das Format meines ERP-Systems exportieren, damit ich die Datei direkt in mein ERP importieren kann.
- Als Mitarbeiter möchte ich nach dem Export sehen, dass die Bestellung als "Exportiert" markiert wurde, damit ich den Status der Verarbeitung nachvollziehen kann.
- Als Mitarbeiter möchte ich eine bereits exportierte Bestellung erneut exportieren können (z.B. nach ERP-Importfehler), damit ich nicht von vorne anfangen muss.
- Als Mitarbeiter möchte ich vor dem Export eine Vorschau des Export-Inhalts sehen, damit ich sicherstellen kann, dass die Daten korrekt transformiert wurden.

## Acceptance Criteria
- [ ] Export-Button ist nur für Bestellungen mit Status "Freigegeben" aktiv
- [ ] Export generiert eine Datei im konfigurierten ERP-Format des Mandanten
- [ ] Datei-Download startet sofort im Browser (kein E-Mail-Versand)
- [ ] Export-Datei enthält korrekt gemappte Felder gemäß Mandanten-Konfiguration
- [ ] Bestellung erhält Status "Exportiert" nach erfolgreichem Download-Start
- [ ] Erneuter Export ist jederzeit möglich (keine Einschränkung)
- [ ] Export-Vorschau zeigt die ersten 10 Zeilen / das transformierte Dokument vor dem Download
- [ ] Jeder Export wird protokolliert (Timestamp, Benutzer, Format, Dateiname)
- [ ] Für MVP: mindestens CSV-Export mit konfigurierbaren Spalten muss funktionieren
- [ ] Dateiname des Exports: `{mandant}_{bestellnummer}_{datum}.{format}`

## Edge Cases
- Was passiert, wenn keine ERP-Mapping-Konfiguration für den Mandanten vorhanden ist? → Fehlermeldung "Keine ERP-Konfiguration gefunden. Bitte wenden Sie sich an den Administrator."
- Was passiert, wenn ein Pflichtfeld in der Canonical JSON `null` ist, aber im ERP-Mapping als Pflichtfeld markiert ist? → Export wird verhindert; Fehlermeldung zeigt fehlendes Feld; Benutzer muss in OPH-5 korrigieren
- Was passiert, wenn die Transformation sehr lange dauert (große Bestellung)? → Maximale Transformationszeit: 10 Sekunden; bei Überschreitung Fehlermeldung
- Was passiert, wenn das ERP-System des Kunden ein unerwartetes Zeichenproblem hat (Encoding)? → Encoding ist in der Mandanten-Konfiguration einstellbar (UTF-8, ISO-8859-1, Windows-1252)

## Technical Requirements
- Transformation läuft serverseitig (API Route) — kein Client-seitiges Datei-Generieren
- Mapping-Engine: Template-basiert (Handlebars oder eigene Implementierung)
- Für CSV: konfigurierbare Trennzeichen, Quote-Zeichen, Header-Zeile, Zeichensatz
- Für XML: konfigurierbares XML-Template mit Placeholder-Syntax
- Datei wird direkt aus dem Response-Stream an den Browser geliefert (kein Storage-Zwischenspeicher)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
