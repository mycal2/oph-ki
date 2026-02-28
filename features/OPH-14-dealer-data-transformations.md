# OPH-14: Händler-Datentransformationen (Dealer Data Transformations)

## Status: In Progress
**Created:** 2026-02-28
**Last Updated:** 2026-02-28

## Dependencies
- Requires: OPH-3 (Händler-Erkennung) — dealer must first be identified before transformations can be applied
- Required by: OPH-4 (KI-Datenextraktion) — mappings are passed to Claude as extraction context
- Required by: OPH-7 (Admin: Händler-Regelwerk-Verwaltung) — admin UI extends to manage mappings
- Related: OPH-9 (Admin: ERP-Mapping-Konfiguration) — ERP field mappings interact with field label translations

## Konzept

Händler verwenden eigene Bezeichnungssysteme, die nicht mit den ERP-Systemen der Hersteller übereinstimmen:

1. **Artikel-Nummern-Mapping**: Händler Henry Schein bestellt Artikel `HS-12345`, aber das Hersteller-ERP kennt nur `MFG-6789`. Jeder Hersteller hat eigene ERP-Artikelnummern, daher ist dieses Mapping **mandantenspezifisch**.

2. **Einheiten-Konvertierung**: Händler bestellt `2 Karton`, gemeint sind `20 Einzeleinheiten`. Da eine Karton-Größe pro Händler fix ist (unabhängig vom Hersteller), kann dieses Mapping **global** vorgegeben und von Mandanten überschrieben werden.

3. **Feldbeschriftungen**: Händler verwendet `PO-Nr.`, das Hersteller-ERP erwartet `Bestellreferenz`. Da jeder Hersteller verschiedene ERP-Felder hat, ist das Mapping **mandantenspezifisch**.

**Verwaltungsmodell**: Platform-Admins pflegen globale Basis-Mappings (leere `tenant_id`), die als Vorlage für alle Mandanten gelten. Mandanten-Admins können ergänzen und überschreiben (mandantenspezifische Einträge haben Vorrang).

**Verwendung in der KI-Extraktion (OPH-4)**:
- Mappings werden als Kontext an Claude übergeben (Prompt-Anreicherung)
- Nach der KI-Extraktion wendet ein deterministischer Übersetzungsschritt die Mappings nochmals an (doppelte Absicherung)
- Unbekannte Händler-Artikelnummern: Rohwert bleibt erhalten, Bestellung wird für manuelle Prüfung markiert

---

## User Stories

### Platform-Admin
- Als Platform-Admin möchte ich globale Einheiten-Konvertierungen anlegen (z.B. `Karton` → `10 Stück` für Henry Schein), damit alle Mandanten sofort davon profitieren, ohne selbst konfigurieren zu müssen.
- Als Platform-Admin möchte ich Basis-Artikelnummern-Mappings vorsehen, die als Ausgangspunkt für Mandanten dienen.
- Als Platform-Admin möchte ich sehen, welche Mappings mandantenübergreifend genutzt werden und welche überschrieben wurden.

### Mandanten-Admin
- Als Mandanten-Admin möchte ich Händler-Artikelnummern meinen ERP-Artikelnummern zuordnen (z.B. `HS-12345` → `MFG-6789`), damit Claude und das System die richtigen ERP-Codes in exportierten Dateien verwenden.
- Als Mandanten-Admin möchte ich Einheiten-Konvertierungen für Händler überschreiben, wenn mein ERP eine andere Basiseinheit verwendet als die globale Vorgabe.
- Als Mandanten-Admin möchte ich Feldbeschriftungs-Übersetzungen konfigurieren (z.B. `PO-Nr.` → `Bestellreferenz`), damit extrahierte Felder korrekt meinen ERP-Feldern zugeordnet werden.
- Als Mandanten-Admin möchte ich eine Warnung sehen, wenn eine Bestellung Händler-Artikelnummern enthält, für die noch kein Mapping existiert.

### Mitarbeiter (Tenant User)
- Als Mitarbeiter möchte ich in der Bestellprüfung sehen, welche Händler-Artikelnummern automatisch übersetzt wurden und welche ohne Mapping vorliegen.
- Als Mitarbeiter möchte ich Artikelnummern ohne Mapping direkt aus der Bestellprüfung heraus anlegen können (Quick-Add).

---

## Acceptance Criteria

### Datenhaltung
- [ ] Tabelle `dealer_data_mappings` mit Feldern: `id`, `dealer_id`, `tenant_id` (nullable = global), `mapping_type`, `dealer_value`, `erp_value`, `conversion_factor` (nur für `unit_conversion`), `description`, `active`, Timestamps
- [ ] `mapping_type` CHECK IN (`article_number`, `unit_conversion`, `field_label`)
- [ ] `(dealer_id, tenant_id, mapping_type, dealer_value)` ist UNIQUE — kein doppeltes Mapping pro Händler/Mandant/Typ/Wert
- [ ] RLS: Platform-Admin kann global (tenant_id = NULL) und mandantenspezifisch schreiben; Mandanten-Admin kann nur eigene Einträge (tenant_id = eigene tenant_id) schreiben; alle authentifizierten Benutzer können Mappings lesen

### Verwaltungspriorität
- [ ] Bei Abfrage gilt: Mandantenspezifischer Eintrag hat Vorrang vor globalem Eintrag für denselben `(dealer_id, mapping_type, dealer_value)`-Schlüssel

### Admin-UI
- [ ] Platform-Admin-Bereich: CRUD für globale Mappings, filterbar nach Händler und Mapping-Typ
- [ ] Mandanten-Admin-Bereich: Tabellen-Ansicht der Mappings für eigenen Mandanten, inklusive globale Basis-Mappings (schreibgeschützt mit "Überschreiben"-Option)
- [ ] Import per CSV: Mandanten-Admin kann eine Mapping-Tabelle als CSV hochladen (Spalten: `dealer_name`, `dealer_value`, `erp_value`, optional `conversion_factor`, `description`)
- [ ] Export als CSV: bestehende Mappings exportierbar

### KI-Integration (OPH-4)
- [ ] Vor Übergabe an Claude: Relevante Mappings (für erkannten Händler + Mandant) werden als strukturierten Kontext in den Prompt eingefügt
- [ ] Nach KI-Extraktion: Deterministischer Übersetzungsschritt wendet `article_number`- und `field_label`-Mappings auf das extrahierte JSON an
- [ ] Bei Einheiten-Konvertierung: `quantity` wird mit `conversion_factor` multipliziert; `unit` wird auf `erp_value` gesetzt

### Fehlende Mappings
- [ ] Wenn eine Händler-Artikelnummer kein Mapping hat: Rohwert (`dealer_value`) bleibt im extrahierten Datensatz erhalten
- [ ] Bestellung erhält Status-Flag `has_unmapped_articles: true` wenn mindestens ein Artikel kein Mapping hat
- [ ] Mitarbeiter sieht in der Bestellprüfung (OPH-5) eine Warnung: „X Artikelnummer(n) ohne ERP-Zuordnung"
- [ ] Quick-Add aus der Bestellprüfung: Mitarbeiter kann direkt zur Mapping-Verwaltung springen, mit vorausgefüllter Händler-Artikelnummer

### Audit & Qualitätssicherung
- [ ] Alle Änderungen an Mappings werden mit Benutzer-ID und Timestamp protokolliert
- [ ] Statistik: Wie viele Bestellungen haben ungemappte Artikel? (pro Händler, pro Mandant)

---

## Edge Cases

- **Händler-Artikelnummer ohne Mapping**: Rohwert bleibt erhalten, Bestellung wird für manuelle Prüfung markiert (kein Abbruch der Verarbeitung).
- **Duplikat-Mapping beim CSV-Import**: System überschreibt bestehende Einträge wenn `(dealer_value, mapping_type)` bereits existiert; Nutzer wird informiert (X überschrieben, Y neu angelegt).
- **Mandantenspezifischer Eintrag überschreibt globalen**: Globaler Eintrag bleibt erhalten; mandantenspezifischer hat Vorrang. Wenn mandantenspezifischer Eintrag gelöscht wird, fällt System auf globalen zurück.
- **Händler noch nicht erkannt (recognition_method = "none")**: Keine Mappings anwendbar — Rohwerte bleiben, Bestellung wird für manuelle Prüfung markiert.
- **Einheiten-Konvertierung führt zu Nicht-Ganzzahl**: Abrunden und in Kommentar vermerken (z.B. `2,5 Karton → 25 Stück`).
- **Globales Mapping durch Platform-Admin geändert**: Ändert sofort das Verhalten für alle Mandanten, die keinen mandantenspezifischen Override haben; neue Bestellungen sind betroffen, historische bleiben unberührt.
- **Groß-/Kleinschreibung in Artikel-Nummern**: Vergleich case-insensitive (z.B. `hs-12345` = `HS-12345`).
- **Leerzeichen in Händler-Werten**: Trimmen vor Vergleich.

---

## Technical Notes

### Datenmodell-Skizze

```
dealer_data_mappings
├── id                UUID PK
├── dealer_id         UUID FK → dealers.id (NOT NULL)
├── tenant_id         UUID FK → tenants.id (NULL = global / platform-seeded)
├── mapping_type      TEXT CHECK('article_number', 'unit_conversion', 'field_label')
├── dealer_value      TEXT NOT NULL  -- z.B. "HS-12345", "Karton", "PO-Nr."
├── erp_value         TEXT NOT NULL  -- z.B. "MFG-6789", "Stück", "Bestellreferenz"
├── conversion_factor DECIMAL(10,4)  -- nur für unit_conversion (z.B. 10.0 für Karton → 10 Stück)
├── description       TEXT           -- optional Freitext
├── active            BOOLEAN NOT NULL DEFAULT TRUE
├── created_by        UUID FK → user_profiles.id
├── created_at        TIMESTAMPTZ
└── updated_at        TIMESTAMPTZ

UNIQUE (dealer_id, tenant_id, mapping_type, lower(dealer_value))
```

### Abfrage-Logik (Vorrang mandantenspezifisch > global)

```sql
-- Für einen erkannten Händler (dealer_id) und Mandanten (tenant_id):
SELECT DISTINCT ON (mapping_type, lower(dealer_value))
  *
FROM dealer_data_mappings
WHERE dealer_id = $dealer_id
  AND (tenant_id = $tenant_id OR tenant_id IS NULL)
  AND active = TRUE
ORDER BY mapping_type, lower(dealer_value),
         (tenant_id IS NOT NULL) DESC  -- mandantenspezifisch hat Vorrang
```

### RLS-Policies
- SELECT: alle authentifizierten Benutzer können lesen
- INSERT/UPDATE/DELETE (tenant_id IS NULL): nur `platform_admin`
- INSERT/UPDATE/DELETE (tenant_id = eigene tenant_id): `platform_admin` oder `tenant_admin`

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

```
Settings (Tenant Admin) — /settings/dealer-mappings
├── DealerMappingPageHeader
│   ├── Title + description
│   └── Import CSV / Export CSV buttons
├── DealerSelector (dropdown — pick which dealer's mappings to view)
├── MappingTypeFilter (tabs: Alle | Artikelnummern | Einheiten | Felder)
└── DealerMappingsTable
    ├── GlobalMappingRow (gray "Global" badge, read-only, "Überschreiben" button)
    ├── TenantMappingRow (editable, "Löschen" button, "Eigene Zuordnung" badge)
    ├── AddMappingForm (inline row at the bottom of the table)
    └── CsvImportDialog (upload → preview → confirm → import results)

Admin (Platform Admin Only) — /admin/dealer-mappings
├── DealerSelector
├── MappingTypeFilter
├── DealerMappingsTable (same component, platform_admin can write global entries)
│   └── TenantOverrideIndicator ("X Mandanten haben überschrieben" per row)
└── CsvImportDialog

Order Review Integration (OPH-5, future)
└── UnmappedArticlesBanner
    ├── "3 Artikelnummern ohne ERP-Zuordnung" warning badge
    └── Link to /settings/dealer-mappings?dealer=XXX&prefill=HS-12345 (Quick-Add)
```

### Data Model

**New table: `dealer_data_mappings`**

| Field | Description |
|---|---|
| id | Unique identifier |
| dealer_id | Which dealer these mappings belong to (FK → dealers) |
| tenant_id | Which manufacturer owns this — **null = global**, seeded by platform admin |
| mapping_type | One of: `article_number`, `unit_conversion`, `field_label` |
| dealer_value | The dealer's term (e.g. `HS-12345`, `Karton`, `PO-Nr.`) — case-insensitive comparison |
| erp_value | What to translate it to (e.g. `MFG-6789`, `Stück`, `Bestellreferenz`) |
| conversion_factor | Only for unit conversions — multiplier (e.g. `10` for Karton → 10 Stück) |
| description | Optional free-text note |
| active | Soft-delete flag |
| created_by | Which user created this entry (audit trail — FK → user_profiles) |
| timestamps | created_at, updated_at |

**Priority rule**: Tenant-specific entry wins over global entry for same `(dealer_id, mapping_type, dealer_value)`. When tenant deletes their override, the global entry becomes active again automatically.

**No changes to existing tables** for OPH-14. The `has_unmapped_articles` flag on `orders` will be added during OPH-4/OPH-5.

### API Routes

| Route | Who uses it | Purpose |
|---|---|---|
| `GET /api/dealer-mappings` | All authenticated users | List mappings for a dealer, merged with tenant priority |
| `POST /api/dealer-mappings` | tenant_admin, platform_admin | Create one mapping |
| `PATCH /api/dealer-mappings/[id]` | Owner of that mapping entry | Edit dealer_value, erp_value, factor, description |
| `DELETE /api/dealer-mappings/[id]` | Owner of that mapping entry | Soft-delete (active = false) |
| `POST /api/dealer-mappings/import` | tenant_admin, platform_admin | CSV bulk import with upsert |
| `GET /api/dealer-mappings/export` | tenant_admin, platform_admin | Download CSV of current mappings |

**Authorization**: Tenant admins can only create/edit/delete rows where `tenant_id = their own tenant`. Platform admins can also manage global rows (`tenant_id = null`).

### Server Utility (for OPH-4 Integration)

New server-only file: `src/lib/dealer-mappings.ts`

- **`getMappingsForDealer(dealerId, tenantId)`** — fetches all applicable mappings applying the global → tenant-specific priority rule. Called by OPH-4 before invoking Claude.
- **`applyMappings(extractedData, mappings)`** — post-processing step after Claude returns extracted JSON: replaces dealer article numbers with ERP numbers, converts units (quantity × factor), translates field labels. Flags any item that couldn't be translated.

Called twice in OPH-4: once to build Claude prompt context, and once for deterministic post-processing of the returned JSON.

### Tech Decisions

| Decision | Why |
|---|---|
| Single `dealer_data_mappings` table (not 3 separate tables) | All three types share the same schema. One table = simpler queries and one admin UI component. |
| `tenant_id = NULL` for global entries | Clean SQL pattern: `WHERE tenant_id = $mine OR tenant_id IS NULL` with `DISTINCT ON` ordering gives priority without complex joins. |
| Two separate admin pages (/settings vs /admin) | Different audiences with different permissions. Shared table components, different route guards. |
| Server-side CSV parsing | No client-side library needed. Server validates and upserts — cleaner error handling, no XSS risk from malicious CSV. |
| Shared server utility in `lib/dealer-mappings.ts` | OPH-4 and the API routes both need mapping lookup. Avoids duplication and makes OPH-4 integration straightforward. |

### New Pages

| Route | Access | Purpose |
|---|---|---|
| `/settings/dealer-mappings` | tenant_admin only | Manage per-tenant article, unit, and field mappings |
| `/admin/dealer-mappings` | platform_admin only | Manage global platform-seeded mappings |

### New Packages

- **`papaparse`** — CSV parsing for import/export (lightweight, browser + Node compatible, no native deps)

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
