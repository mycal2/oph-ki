# OPH-5: Bestellprüfung & manuelle Korrektur

## Status: Planned
**Created:** 2026-02-27
**Last Updated:** 2026-02-27

## Dependencies
- Requires: OPH-4 (KI-Datenextraktion) — extrahierte Daten müssen vorliegen

## User Stories
- Als Mitarbeiter möchte ich die automatisch extrahierten Bestelldaten in einer übersichtlichen UI sehen und mit dem Original-Dokument vergleichen können, damit ich Fehler erkennen und korrigieren kann.
- Als Mitarbeiter möchte ich einzelne Felder der Bestellung direkt im Browser bearbeiten (Artikelnummer, Menge, Preis etc.), damit die Daten vor dem ERP-Export korrekt sind.
- Als Mitarbeiter möchte ich Bestellpositionen hinzufügen oder löschen, damit ich auch bei unvollständiger Extraktion eine vollständige Bestellung erstellen kann.
- Als Mitarbeiter möchte ich sehen, welche Felder vom KI-Modell mit geringer Konfidenz extrahiert wurden (visuelle Markierung), damit ich meine Prüfung auf kritische Stellen fokussieren kann.
- Als Mitarbeiter möchte ich eine Bestellung als "Geprüft und freigegeben" markieren, damit klar ist, dass die Daten manuell validiert wurden und exportiert werden können.
- Als Mitarbeiter möchte ich eine Bestellung ablehnen / erneut extrahieren lassen, wenn die Qualität unzureichend ist.

## Acceptance Criteria
- [ ] Review-UI zeigt Original-Dokument (Vorschau/PDF-Viewer) und extrahierte Daten nebeneinander
- [ ] Alle Canonical-JSON-Felder sind editierbar (inline editing in der Tabelle/Form)
- [ ] Felder mit niedrigem Konfidenz-Score sind visuell markiert (z.B. gelbe Hintergrundfarbe)
- [ ] Bestellpositionen können hinzugefügt, bearbeitet und gelöscht werden
- [ ] Änderungen werden automatisch zwischengespeichert (kein Datenverlust bei Browser-Refresh)
- [ ] "Bestellung freigeben" Button: setzt Status auf "Freigegeben" und aktiviert ERP-Export (OPH-6)
- [ ] "Erneut extrahieren" Button: startet KI-Extraktion neu (bisherige manuelle Änderungen werden nach Bestätigung verworfen)
- [ ] Alle Änderungen werden mit Zeitstempel und Benutzer protokolliert (Audit-Trail)
- [ ] Validierung: Pflichtfelder (mind. 1 Bestellposition mit Beschreibung und Menge) müssen gefüllt sein vor Freigabe
- [ ] Benutzer sieht den Händler (erkannt oder manuell gewählt) und kann ihn in dieser View korrigieren

## Edge Cases
- Was passiert, wenn zwei Mitarbeiter gleichzeitig dieselbe Bestellung bearbeiten? → Optimistic Locking: zweiter Bearbeiter erhält Warnung "Diese Bestellung wird bereits von [Name] bearbeitet"
- Was passiert, wenn der Benutzer den Browser schließt ohne zu speichern? → Auto-Save nach jeder Änderung (Debounce 2 Sekunden); keine Datenverluste
- Was passiert, wenn eine freigegebene Bestellung nachträglich geändert werden muss? → Status wird auf "In Korrektur" zurückgesetzt; erneute Freigabe erforderlich
- Was passiert, wenn das Original-Dokument nicht mehr verfügbar ist (gelöscht)? → Vorschau zeigt Fehlermeldung "Original nicht mehr verfügbar"; Bearbeitung der Daten bleibt möglich
- Was passiert, wenn alle Positionsfelder `null` sind (Extraktion komplett fehlgeschlagen)? → Benutzer kann alle Felder manuell ausfüllen; keine Blockierung

## Technical Requirements
- PDF-Vorschau: Einbettung via iframe oder PDF.js
- Auto-Save: debounced PATCH-Request an API nach jeder Änderung
- Optimistic Locking: `updated_at` Timestamp-Vergleich
- Audit-Log: `order_edits`-Tabelle (order_id, user_id, field, old_value, new_value, timestamp)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
