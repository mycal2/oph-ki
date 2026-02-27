# OPH-9: Admin: ERP-Mapping-Konfiguration

## Status: Planned
**Created:** 2026-02-27
**Last Updated:** 2026-02-27

## Dependencies
- Requires: OPH-8 (Admin: Mandanten-Management) — Konfiguration pro Mandant
- Requires: OPH-6 (ERP-Export) — Mapping-Regeln werden vom Export genutzt

## Konzept
Jeder Mandant hat spezifische Anforderungen an das ERP-Import-Format (andere Spaltenreihenfolge, andere Feldnamen, andere Nummerierungslogik). Platform-Admins konfigurieren diese Mapping-Regeln über eine UI — kein Code-Deployment nötig.

Mapping-Pipeline: `Canonical JSON → [Mapping-Regeln] → ERP-Ausgabedatei`

## User Stories
- Als Platform-Admin möchte ich für jeden Mandanten das Ausgabeformat (CSV / XML / JSON) konfigurieren, damit jeder Mandant die für sein ERP passende Datei erhält.
- Als Platform-Admin möchte ich für CSV-Exporte die Spaltenreihenfolge, Spaltennamen und Datenquellen (aus welchem Canonical-JSON-Feld) definieren.
- Als Platform-Admin möchte ich Transformationsregeln definieren (z.B. "Menge runden auf 0 Dezimalstellen", "Preis multiplizieren mit 1.19 für MwSt."), damit Daten korrekt ins ERP passen.
- Als Platform-Admin möchte ich eine Mapping-Konfiguration mit einem Beispiel-Canonical-JSON testen, damit ich sicherstellen kann, dass der Export korrekt aussieht.
- Als Platform-Admin möchte ich Mapping-Konfigurationen zwischen Mandanten kopieren (als Ausgangsbasis), damit ich Zeit bei ähnlichen ERP-Systemen spare.

## Acceptance Criteria
- [ ] Pro Mandant: ein aktives ERP-Mapping-Profil (kann versioniert sein)
- [ ] Konfigurierbar: Ausgabeformat (CSV, XML, JSON), Zeichensatz, Zeilenende, Dezimaltrennzeichen
- [ ] CSV-Konfiguration: Tabelle mit Zeilen (Ausgabe-Spalte → Quelle im Canonical JSON → optionale Transformation)
- [ ] XML-Konfiguration: XML-Template mit Handlebars-ähnlichen Platzhaltern (`{{order.order_number}}`)
- [ ] Verfügbare Transformationen: `to_uppercase`, `to_lowercase`, `round(n)`, `date_format(pattern)`, `multiply(n)`, `default(value)`, `trim`
- [ ] Test-Funktion: Admin gibt Beispiel-Canonical-JSON ein (oder wählt eine existierende Bestellung) → System zeigt den generierten Export-Inhalt
- [ ] Pflichtfeld-Markierung: Admin kann Felder als Pflichtfelder markieren (blockieren Export wenn `null`)
- [ ] Versionshistorie: Änderungen an Mappings werden versioniert; Rollback auf frühere Version möglich
- [ ] Konfiguration wird sofort wirksam (kein Deploy)

## Edge Cases
- Was passiert, wenn ein Canonical-JSON-Feld umbenannt wird (Schema-Evolution)? → Mapping bleibt mit altem Feldnamen; System warnt Admin "Feld nicht gefunden: [feldname]" beim Test
- Was passiert, wenn keine Mapping-Konfiguration für einen Mandanten existiert? → ERP-Export (OPH-6) verweigert Export mit Fehlermeldung
- Was passiert, wenn eine Transformation einen Fehler erzeugt (z.B. `round` auf nicht-numerisches Feld)? → Fehler wird beim Speichern abgefangen; Test-Funktion zeigt konkreten Fehler

## Technical Requirements
- Mapping-Konfiguration als JSONB in `tenant_erp_configs`-Tabelle gespeichert
- Transformations-Engine: reine Funktionsbibliothek ohne externe Abhängigkeiten
- XML-Template-Rendering: Handlebars.js (serverseitig)
- Versionierung: Append-only mit `version_number` und `created_at`; aktuell aktive Version per Flag

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
