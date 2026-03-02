# OPH-15: Dealer Column Mapping for Extraction

## Status: Planned
**Created:** 2026-03-02
**Last Updated:** 2026-03-02

## Dependencies
- Requires: OPH-3 (Händler-Erkennung & Händler-Profile) — column mappings are per dealer, stored alongside dealer profiles
- Requires: OPH-7 (Admin: Händler-Regelwerk-Verwaltung) — admin UI extends the dealer edit sheet with a new tab
- Modifies: OPH-4 (KI-Datenextraktion) — extraction prompt is enriched with column mapping context
- Related: OPH-14 (Dealer Data Transformations) — column mappings guide extraction input; OPH-14 transforms output values

## Konzept

Händler verwenden in ihren Bestellungen oft nicht eindeutig beschriftete Spalten. Beispiel: Henry Schein liefert zwei Nummern-Spalten — Spalte 1 ist die ISO-Nummer, Spalte 2 die Artikelnummer, aber die Spalten sind nicht beschriftet. Ohne explizites Mapping muss die KI raten, was die einzelnen Spalten bedeuten.

**Dealer Column Mappings** sind strukturierte Regeln pro Händler (global, für alle Mandanten gleich), die der KI-Extraktion sagen: "Für diesen Händler bedeutet Spalte X = Feld Y im Canonical JSON."

Da ein Händler verschiedene Bestellformate nutzen kann (z.B. PDF-Tabelle vs. Excel), können **mehrere Mapping-Profile pro Format-Typ** definiert werden. Das System wählt automatisch das richtige Profil basierend auf dem erkannten Dateityp.

**Pipeline-Position:** Rohe Bestelldatei → [Column Mapping Kontext] → KI-Extraktion → Canonical JSON

**Verwaltung:** Ausschließlich durch Platform-Admins, im bestehenden Händler-Profil-Sheet (OPH-7 Admin UI) als neuer Tab.

---

## User Stories

- Als Platform-Admin möchte ich für einen Händler definieren, welche Spalte in dessen Bestellungen welchem Canonical-JSON-Feld entspricht (z.B. "Spalte 1 = ISO-Nummer, Spalte 2 = Artikelnummer"), damit die KI-Extraktion ambige oder unbeschriftete Spalten korrekt interpretiert.
- Als Platform-Admin möchte ich Spalten sowohl über die Position (z.B. "Spalte 3") als auch über den Header-Text (z.B. "Best.-Nr.") zuordnen können, damit sowohl beschriftete als auch unbeschriftete Bestellformate abgedeckt sind.
- Als Platform-Admin möchte ich mehrere Mapping-Profile pro Händler anlegen können — eines je Format-Typ (PDF, Excel, E-Mail-Text) — damit unterschiedliche Bestellformate desselben Händlers korrekt verarbeitet werden.
- Als Platform-Admin möchte ich beliebige Canonical-JSON-Felder als Ziel wählen können (product_code, quantity, order_number, etc.), damit die Mappings flexibel genug für jedes Händler-Format sind.
- Als Platform-Admin möchte ich die Column Mappings im bestehenden Händler-Profil-Sheet (Tab "Spalten-Mapping") verwalten, damit ich nicht zu einer separaten Seite navigieren muss.
- Als System möchte ich die Column Mappings als zusätzlichen Kontext in den KI-Extraktions-Prompt einfügen, damit die KI die Spalten korrekt den Feldern zuordnet.

---

## Acceptance Criteria

- **AC-1:** Column Mappings sind pro Händler definiert (global, nicht mandantenspezifisch). Alle Mandanten, die mit diesem Händler arbeiten, profitieren automatisch.
- **AC-2:** Pro Händler können mehrere Mapping-Profile angelegt werden, jeweils einem Format-Typ zugeordnet: `pdf_table`, `excel`, `email_text`. Maximal ein Profil pro Format-Typ pro Händler.
- **AC-3:** Das System wählt automatisch das passende Mapping-Profil basierend auf dem `format_type` des Händler-Profils (OPH-3) und dem tatsächlichen Datei-Typ der hochgeladenen Bestellung. Wenn kein passendes Profil existiert, wird kein Column Mapping angewendet (Fallback auf allgemeine Extraktion).
- **AC-4:** Jedes Mapping-Profil besteht aus einer geordneten Liste von Spalten-Zuordnungen. Jede Zuordnung hat:
  - Match-Typ: `position` (1-basierter Spaltenindex), `header` (Text-Matching, case-insensitive), oder `both` (Position UND Header angegeben; Header hat Priorität wenn beides matcht)
  - Position (optional, Pflicht wenn Match-Typ = `position` oder `both`): 1-basierter Spaltenindex
  - Header-Text (optional, Pflicht wenn Match-Typ = `header` oder `both`): erwarteter Spaltenname
  - Ziel-Feld (Pflicht): Canonical-JSON-Feldpfad (z.B. `order_number`, `items[].product_code`, `items[].quantity`)
- **AC-5:** Beliebige Canonical-JSON-Feldpfade sind als Ziel gültig. Das System validiert NICHT gegen ein festes Schema — unbekannte Pfade werden akzeptiert (die KI ignoriert sie wenn nicht relevant).
- **AC-6:** Admin-UI: Neuer Tab "Spalten-Mapping" im Händler-Edit-Sheet (OPH-7). Der Tab zeigt:
  - Format-Typ-Auswahl (Tabs oder Dropdown) für die vorhandenen Profile
  - Button "Neues Profil" zum Anlegen eines Profils für einen weiteren Format-Typ
  - Editierbare Tabelle der Spalten-Zuordnungen (Position, Header, Zielfeld, Match-Typ)
  - Buttons zum Hinzufügen, Löschen und Umordnen von Zeilen
- **AC-7:** Column Mappings werden beim Speichern des Händler-Profils mit gespeichert. Validierung: mindestens ein Mapping-Eintrag pro Profil, keine doppelten Zielfelder innerhalb eines Profils.
- **AC-8:** Die KI-Extraktion (OPH-4) erhält die Column Mappings als strukturierten Kontext im Prompt, z.B.:
  > "Für diesen Händler gelten folgende Spalten-Zuordnungen: Spalte 1 = ISO-Nummer (product_code), Spalte 2 = Artikelnummer (manufacturer_code), Spalte 3 = Menge (quantity)."
  Die Mappings werden zusätzlich zu den bestehenden `extraction_hints` übergeben.
- **AC-9:** Wenn kein Column Mapping für den erkannten Händler/Format-Typ existiert, arbeitet die KI-Extraktion wie bisher ohne zusätzlichen Kontext (kein Fehler, kein Abbruch).
- **AC-10:** Änderungen an Column Mappings sind sofort wirksam für alle nachfolgenden Extraktionen. Bereits extrahierte Bestellungen sind nicht betroffen.

---

## Edge Cases

- **Kein Column Mapping definiert:** KI-Extraktion läuft wie bisher mit allgemeinen Regeln und ggf. `extraction_hints`. Kein Fehler, kein Abbruch.
- **Konflikt: Zwei Einträge beanspruchen dieselbe Position:** Validierung beim Speichern lehnt ab mit Fehlermeldung "Position X ist doppelt vergeben."
- **Doppelte Zielfelder:** Validierung beim Speichern lehnt ab — jedes Zielfeld darf pro Profil nur einmal vorkommen.
- **Position überschreitet tatsächliche Spaltenanzahl der Bestellung:** Mapping wird für diese Bestellung ignoriert (kein Fehler). KI fällt auf allgemeine Extraktion zurück für das betroffene Feld.
- **Header-Text findet keine Übereinstimmung:** Mapping wird für diese Bestellung ignoriert. KI extrahiert das Feld nach bestem Wissen.
- **Händler nutzt verschiedene Formate (PDF + Excel):** Separate Profile pro Format-Typ lösen dies. Wenn kein Profil für den konkreten Dateityp existiert, greift allgemeine Extraktion.
- **Gleichzeitige Bearbeitung durch zwei Admins:** Last-Write-Wins (akzeptabel für internes Tool, konsistent mit anderen Admin-Features).
- **Canonical-JSON-Feld existiert nicht (Tippfehler):** Wird akzeptiert und gespeichert. Die KI erhält den Hinweis und versucht ihn zu interpretieren — im schlimmsten Fall wird das Feld ignoriert.

---

## Out of Scope

- Mandantenspezifische Column Mappings (Mappings sind immer global pro Händler)
- Auto-Learning: System lernt nicht automatisch aus manuellen Korrekturen
- Column Mapping Versionshistorie (einfaches Überschreiben, kein Rollback)
- Validierung gegen ein festes Canonical-JSON-Schema (bewusst offen gehalten)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
