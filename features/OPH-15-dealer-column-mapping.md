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

### Component Structure

```
DealerFormSheet (already exists — extended with new tab)
+-- Tab: Profil (existing, unchanged)
+-- Tab: Erkennungsregeln (existing, unchanged)
+-- Tab: Spalten-Mapping (NEW)
|   +-- FormatTypeTabs (pdf_table / excel / email_text)
|   |   +-- "Neues Profil" button (if format type has no profile yet)
|   |   +-- ColumnMappingTable (per selected format type)
|   |       +-- ColumnMappingRow (repeating)
|   |       |   +-- Match-Typ selector (position / header / both)
|   |       |   +-- Position input (1-based number, shown if type = position/both)
|   |       |   +-- Header-Text input (shown if type = header/both)
|   |       |   +-- Target field input (free-text canonical JSON path)
|   |       |   +-- Delete row button
|   |       +-- "Zeile hinzufügen" button
|   |       +-- "Profil löschen" button (danger zone)
|   +-- "Spalten-Mapping speichern" button (independent of dealer profile save)
+-- Tab: Verlauf (existing, unchanged)
```

### Data Model

**New table: `dealer_column_mapping_profiles`**

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `dealer_id` | Links to `dealers` table (global, not tenant-scoped) |
| `format_type` | One of: `pdf_table`, `excel`, `email_text` |
| `mappings` | JSON array of column rules (see below) |
| `created_at` / `updated_at` | Audit timestamps |

Constraint: maximum one profile per `(dealer_id, format_type)` combination.

**Each column rule (inside `mappings` array):**

| Field | Description |
|-------|-------------|
| `match_type` | `"position"`, `"header"`, or `"both"` |
| `position` | Column number (1-based), present when match_type = position or both |
| `header_text` | Expected column header label (case-insensitive), present when match_type = header or both |
| `target_field` | Canonical JSON field path, e.g. `items[].product_code`, `order_number` |

**RLS:** Platform-admins write; all authenticated users read (same as `dealers` table).

### New API Routes

| Route | Purpose |
|-------|---------|
| `GET /api/admin/dealers/[id]/column-mappings` | Load all mapping profiles for a dealer |
| `PUT /api/admin/dealers/[id]/column-mappings/[formatType]` | Upsert a profile for one format type (full replacement) |
| `DELETE /api/admin/dealers/[id]/column-mappings/[formatType]` | Remove a profile entirely |

Column mappings are saved independently (their own "Speichern" button) — not bundled into the existing dealer PATCH endpoint.

### AI Extraction Integration

The existing extract route (`/api/orders/[orderId]/extract`) already builds two context blocks for Claude:
1. `extraction_hints` — free-text notes on the dealer
2. `mappingsContext` — OPH-14 field label and article number translations

OPH-15 adds a **third context block**: `columnMappingContext`

**How the right profile is selected:** The file's MIME type (already stored on `order_files`) is mapped to a format type: PDF → `pdf_table`, Excel → `excel`, plain text/email → `email_text`. The extract route fetches the matching `dealer_column_mapping_profiles` row and formats it into natural language inserted into the Claude prompt.

**Example prompt addition:**
> "Spalten-Zuordnung für diesen Händler: Spalte 1 = ISO-Nummer (items[].iso_number), Spalte 2 = Artikelnummer (items[].product_code), Spalte 3 = Menge (items[].quantity)."

If no matching profile exists, extraction continues as today with no additional context.

### Tech Decisions

| Decision | Why |
|----------|-----|
| Separate table, not JSONB on `dealers` | A dealer can have up to 3 independent profiles (one per format type); a join table allows atomic upsert per format type without overwriting other profiles |
| `PUT` (full replace) not `PATCH` | Admin edits the complete rule set for a format type in one shot — partial update adds unnecessary complexity |
| Independent save button in the tab | Column mapping changes are separate from dealer profile changes; avoids entangling two different data sets in one save action |
| File MIME type → format type mapping | MIME type is already stored on `order_files` at upload time — no new file inspection needed at extraction |
| Platform-admin read + write, all-auth read | Same RLS pattern as `dealers` — mappings are global and read during extraction for any tenant's orders |
| No version history | Out of scope by design; consistent with keeping this a fast-iteration internal tool |

### New Packages Required

None — uses existing Supabase, shadcn/ui (Tabs, Table, Select, Input, Button), and Next.js.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
