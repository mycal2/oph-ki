# OPH-3: Händler-Erkennung & Händler-Profile

## Status: Planned
**Created:** 2026-02-27
**Last Updated:** 2026-02-27

## Dependencies
- Requires: OPH-2 (Bestellungs-Upload) — Dateien müssen vorliegen, bevor Händler erkannt werden kann

## Konzept
Händler (z.B. Henry Schein, Dentsply Sirona, lokale Dental-Händler) versenden Bestellungen immer in einem ähnlichen Format, unabhängig davon, welcher Dentalhersteller der Empfänger ist. Händler-Profile sind **globale** Datensätze, die für alle Mandanten wiederverwendet werden. Einmal erkannte Muster werden nicht doppelt konfiguriert.

Ein Händler-Profil enthält:
- Identifikations-Merkmale (E-Mail-Domänen, typische Absender-Adressen, Betreff-Muster)
- Hinweise für die KI-Extraktion (z.B. "Artikelnummern in Spalte 3", "Bestellnummer im Betreff nach #")
- Bekannte Formattypen (Freitext in E-Mail, PDF-Tabelle, Excel-Template)

## User Stories
- Als System möchte ich nach dem Upload automatisch den Händler anhand bekannter Erkennungsmerkmale identifizieren, damit die zugehörigen Extraktionsregeln angewendet werden können.
- Als Mitarbeiter möchte ich sehen, welcher Händler erkannt wurde und die Erkennung ggf. manuell korrigieren, damit Fehler bei der Erkennung behoben werden können.
- Als Mitarbeiter möchte ich einen unbekannten Händler als "Neu" markieren und grundlegende Informationen eingeben, damit neue Händler ins System aufgenommen werden können.
- Als Platform-Admin möchte ich Händler-Profile global anlegen, bearbeiten und Erkennungsregeln pflegen, damit alle Mandanten davon profitieren (OPH-7 baut darauf auf).

## Acceptance Criteria
- [ ] Nach dem Upload wird automatisch eine Händler-Erkennung durchgeführt
- [ ] Erkennungslogik prüft in dieser Reihenfolge: E-Mail-Absender-Domain → Absender-Adresse → Betreff-Pattern → Dateiname-Pattern
- [ ] Erkannter Händler wird der Bestellung zugeordnet und in der UI angezeigt (Name + Konfidenz-Score)
- [ ] Mitarbeiter können die automatische Erkennung manuell überschreiben (Händler aus Liste wählen)
- [ ] Unbekannte Händler werden mit Status "Unbekannt" markiert (kein Abbruch der Verarbeitung)
- [ ] Händler-Profil enthält: Name, bekannte Domänen/Adressen, Format-Typ (Email-Text / PDF-Tabelle / Excel), Extraktions-Hints für KI
- [ ] Händler-Daten sind global (nicht mandantenspezifisch) — alle Mandanten teilen denselben Händler-Katalog
- [ ] Jede Bestellung protokolliert: erkannter Händler, Erkennungsmethode, Konfidenz-Score

## Edge Cases
- Was passiert, wenn kein Händler erkannt wird? → Bestellung erhält Status "Händler unbekannt", Extraktion läuft trotzdem mit allgemeinen Regeln weiter
- Was passiert, wenn mehrere Händler-Profile passen (Konfidenz-Tie)? → Der Händler mit dem höchsten Konfidenz-Score gewinnt; bei Gleichstand wird Benutzer zur manuellen Auswahl aufgefordert
- Was passiert, wenn ein Händler dieselbe Absender-Domain für verschiedene Regionen nutzt? → Händler-Profile können Sub-Profile haben oder über zusätzliche Pattern differenziert werden
- Was passiert, wenn ein Mitarbeiter den Händler falsch zuweist? → Admin kann Zuweisung korrigieren; Fehler wird nicht ans Extraktionsmodell zurückgemeldet (kein Auto-Learning in MVP)

## Technical Requirements
- Händler-Erkennung: regelbasierter Matching-Algorithmus (kein ML in MVP)
- Erkennungsregeln in Datenbank gespeichert (pflegbar durch Admin)
- Konfidenz-Score: 0–100 % (basierend auf Anzahl und Stärke der Treffer)
- Globale `dealers`-Tabelle ohne `tenant_id` (shared across all tenants)
- RLS: Alle authentifizierten Benutzer können Händler lesen; nur Platform-Admins können schreiben

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
