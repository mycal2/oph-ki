# OPH-9: Admin: ERP-Mapping-Konfiguration

## Status: In Review
**Created:** 2026-02-27
**Last Updated:** 2026-03-02

## Dependencies
- Requires: OPH-8 (Admin: Mandanten-Management) — Konfiguration ist immer einem Mandanten zugeordnet
- Requires: OPH-6 (ERP-Export & Download) — Mapping-Regeln werden bei jedem Export ausgewertet
- Modifies: OPH-6 — Export-Logik muss Mapping-Konfiguration konsultieren

## Konzept

Jeder Mandant hat spezifische Anforderungen an das ERP-Import-Format (Spaltenreihenfolge, Feldnamen, Datentypen, Zeichensatz). Platform-Admins konfigurieren diese Regeln über eine UI — kein Code-Deployment nötig. Konfigurationen sind versioniert, können rückgängig gemacht und zwischen Mandanten übertragen werden.

**Mapping-Pipeline:** `Canonical JSON → [Mapping-Regeln] → ERP-Ausgabedatei`

**Canonical JSON** = das von der KI extrahierte, normalisierte Bestelldaten-Objekt (order_number, order_date, items[], etc.)

**Zielgruppe:** Ausschließlich Platform-Admins (internes Team) — kein Mandantenzugang.

---

## User Stories

- Als Platform-Admin möchte ich für jeden Mandanten das Ausgabeformat (CSV / XML / JSON) sowie technische Einstellungen (Zeichensatz, Dezimaltrennzeichen, Zeilenende) konfigurieren, damit jeder Mandant genau die Datei erhält, die sein ERP erwartet.
- Als Platform-Admin möchte ich für CSV-Exporte eine geordnete Liste von Spalten definieren (Ausgabename, Quelle im Canonical JSON, optionale Transformation), damit die Spaltenstruktur exakt dem ERP-Importtemplate des Mandanten entspricht.
- Als Platform-Admin möchte ich für XML-Exporte ein Handlebars-Template (`{{order.order_number}}`, `{{#each order.items}}...{{/each}}`) definieren, damit strukturell komplexe XML-Formate ohne Code-Änderungen konfiguriert werden können.
- Als Platform-Admin möchte ich Transformationsregeln auf Feldebene definieren (`to_uppercase`, `round(n)`, `multiply(n)`, `date_format(pattern)`, `default(value)`, `trim`, `to_lowercase`), damit Rohwerte korrekt in das Zielformat des ERP umgewandelt werden.
- Als Platform-Admin möchte ich eine Mapping-Konfiguration mit einem Beispiel-Canonical-JSON testen (manuell eingegeben oder aus einer existierenden Bestellung ausgewählt), damit ich den generierten Export-Inhalt vor dem Liveschalten prüfen kann.
- Als Platform-Admin möchte ich die Versionshistorie einer Mapping-Konfiguration einsehen und auf eine frühere Version zurückrollen, damit fehlerhafte Änderungen schnell rückgängig gemacht werden können.
- Als Platform-Admin möchte ich die aktive Mapping-Konfiguration eines Mandanten als Ausgangsbasis auf einen anderen Mandanten kopieren, damit ich Zeit bei ähnlichen ERP-Systemen spare.
- Als Platform-Admin möchte ich pro Mandant einstellen, ob ein fehlender Export-Mapping-Block den Export blockiert oder einen generischen Fallback-CSV auslöst, damit ich das Verhalten je nach Mandantenreife steuern kann.

---

## Acceptance Criteria

- **AC-1:** Pro Mandant gibt es genau einen aktiven Mapping-Konfigurationsdatensatz. Alle früheren Versionen bleiben unbegrenzt erhalten.
- **AC-2:** Konfigurierbare technische Exportparameter pro Mandant: Ausgabeformat (CSV, XML, JSON), Zeichensatz (UTF-8, Latin-1, Windows-1252), Dezimaltrennzeichen (Punkt, Komma), Zeilenende (LF, CRLF).
- **AC-3:** Fallback-Modus ist pro Mandant einstellbar: `block` (Export wird verweigert wenn kein Mapping konfiguriert) oder `fallback_csv` (generischer CSV mit allen Canonical-JSON-Feldern in Standardreihenfolge). Default: `block`.
- **AC-4 (CSV):** CSV-Konfiguration besteht aus einer geordneten Liste von Spalten. Jede Spalte hat: Ausgabe-Spaltenname (Pflicht), Canonical-JSON-Pfad als Datenquelle (Pflicht, z.B. `order.order_number`, `items[].product_code`), optionale Transformation, Pflichtfeld-Flag.
- **AC-5 (XML):** XML-Konfiguration besteht aus einem Freitext-Template mit Handlebars-Syntax: `{{order.order_number}}` für skalare Werte, `{{#each order.items}}...{{/each}}` für Listenwiederholugen. Template wird beim Speichern auf Handlebars-Syntaxfehler geprüft — ungültige Templates werden abgelehnt.
- **AC-6 (Transformationen):** Folgende Transformationen sind verfügbar und kombinierbar (Reihenfolge der Ausführung entspricht Konfigurationsreihenfolge): `to_uppercase`, `to_lowercase`, `trim`, `round(n)` (n Dezimalstellen), `multiply(n)` (numerische Multiplikation), `date_format(pattern)` (Datumsformatierung nach Pattern, z.B. `DD.MM.YYYY`), `default(value)` (Fallback wenn Feld null/leer).
- **AC-7 (Test-Funktion):** Admin kann eine Mapping-Konfiguration testen durch: (a) manuelles Eingeben eines Canonical-JSON-Objekts, oder (b) Auswählen einer existierenden, approbierten Bestellung des Mandanten. Das System zeigt den vollständigen generierten Export-Inhalt als Text-Preview an.
- **AC-8 (Pflichtfelder):** Felder, die als Pflichtfeld markiert sind, blockieren den Export, wenn der Feldwert im Canonical JSON `null` oder leer ist. Die Fehlermeldung benennt das fehlende Feld konkret.
- **AC-9 (Versionshistorie):** Jede gespeicherte Änderung erzeugt eine neue Version mit: Versionsnummer (auto-increment), Timestamp, optionalem Änderungskommentar. Alle Versionen sind in einer Liste einsehbar.
- **AC-10 (Rollback):** Admin kann eine beliebige frühere Version als neue aktive Version wiederherstellen. Dies erzeugt eine neue Versionseinträg (Kopie der alten) — die Historie bleibt unverändert.
- **AC-11 (Kopieren):** Admin kann die aktiv Konfiguration (Spaltenregeln, Format, Transformationen) von Mandant A zu Mandant B kopieren. Die Kopie wird im Zielmandanten als neue Version gespeichert. Die Versionshistorie des Quellmandanten wird NICHT übertragen.
- **AC-12:** Konfigurationsänderungen sind sofort wirksam ohne Deployment. Laufende Exporte nutzen die zum Zeitpunkt des Exports aktive Version.
- **AC-13:** Die gesamte Verwaltungsoberfläche ist ausschließlich Platform-Admins zugänglich (kein Mandantenzugang).

---

## Edge Cases

- **Schema-Evolution:** Wenn ein Canonical-JSON-Feld umbenannt wird (z.B. `order_no` → `order_number`) und eine Mapping-Konfiguration noch den alten Pfad referenziert, gibt die Test-Funktion eine Warnung aus: "Feld nicht gefunden: [feldpfad]". Der Export läuft weiter (Feld gibt `null` zurück), so dass `default(value)` greifen kann.
- **Kein Mapping konfiguriert + Fallback = `block`:** ERP-Export-Endpoint gibt HTTP 409 zurück mit Nachricht "Kein ERP-Mapping konfiguriert für diesen Mandanten."
- **Kein Mapping konfiguriert + Fallback = `fallback_csv`:** Export liefert alle Canonical-JSON-Felder in einer generischen CSV-Datei ohne Transformation.
- **Transformationsfehler (z.B. `round` auf nicht-numerischen String):** Fehler wird beim Testen sichtbar; der Export einer echten Bestellung erzeugt eine leere Zelle für das betroffene Feld und protokolliert eine Warnung.
- **XML-Syntaxfehler im Template:** Handlebars-Parse-Fehler wird beim Speichern abgefangen; der Datensatz wird nicht gespeichert und die Fehlerstelle wird dem Admin angezeigt.
- **Kopieren auf Mandant mit bestehendem Mapping:** Die Kopie wird als neue Version zum Zielmandanten hinzugefügt. Die bestehende aktive Version des Zielmandanten bleibt in der Historie erhalten.
- **Gleichzeitige Bearbeitung durch zwei Admins:** Last-Write-Wins (akzeptabel für internes Tool). Beide Saves erzeugen je eine neue Version.
- **JSON-Pfad auf Array-Element ohne Index (`items[].product_code`):** Für CSV-Export: jedes Listen-Element erzeugt eine eigene Zeile im Output (Standardverhalten für Bestellpositionen).

---

## Out of Scope (für dieses Feature)

- Mandanten-seitige Konfigurationsoberfläche (nur Platform-Admin)
- Automatischer Schema-Migration wenn Canonical-JSON-Felder umbenannt werden
- Live-API-Push direkt ins ERP (MVP: Datei-Download bleibt)
- Diff-Anzeige zwischen zwei Versionen

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

```
Admin: ERP-Konfiguration (/admin/erp-configs)
+-- ErpConfigList
|   +-- Tenant row: Name, Format-Badge, Version, Last Updated
|   +-- "Konfigurieren" button → opens ErpConfigPage
|
+-- ErpConfigPage (full dedicated page per tenant)
    +-- PageHeader: Tenant name, Format tabs (CSV / XML / JSON)
    |
    +-- TechnicalSettingsPanel
    |   +-- Charset selector (UTF-8, Latin-1, Windows-1252)
    |   +-- Decimal separator (Punkt / Komma)
    |   +-- Line ending (LF / CRLF)
    |   +-- Fallback mode (block / fallback_csv)
    |
    +-- FormatConfigPanel (switches by active format tab)
    |   +-- CsvColumnBuilder (CSV only)
    |   |   +-- Ordered column list (move up/down buttons)
    |   |   +-- Each column: output name, source field, transformations
    |   |   +-- TransformationEditor (add/remove per column)
    |   |   +-- "Spalte hinzufügen" button
    |   |
    |   +-- XmlTemplateEditor (XML only)
    |       +-- Large text area with Handlebars syntax
    |       +-- Available variables reference (collapsible panel)
    |
    +-- ActionBar
    |   +-- "Test" button → opens TestDialog
    |   +-- "Kopieren von..." button → opens CopyFromDialog
    |   +-- Comment input (optional note for this save)
    |   +-- "Speichern" button (creates new version)
    |
    +-- VersionHistoryPanel (collapsible sidebar)
        +-- Version list: v1, v2, v3... with timestamp + comment
        +-- "Wiederherstellen" button on each version

+-- TestDialog
|   +-- OrderSelector (pick existing approved order of this tenant)
|   +-- OR: JSON paste area (manual Canonical JSON input)
|   +-- "Test ausführen" button
|   +-- OutputPreview (generated file content as plain text)
|   +-- Warning list (unknown field paths, null required fields)
|
+-- CopyFromDialog
    +-- TenantSelector (dropdown of all other tenants)
    +-- Warning: "Überschreibt aktuelle Konfiguration"
    +-- "Kopieren" button
```

### Data Model

**Extended `erp_configs` table** (existing table, new columns added):
- Everything that exists today stays unchanged
- New: `xml_template` — the Handlebars template text for XML exports
- New: `line_ending` — LF or CRLF
- New: `decimal_separator` — `.` or `,`
- New: `fallback_mode` — `block` or `fallback_csv` (default: `block`)
- Each entry in the existing `column_mappings` JSONB array is extended with a `transformations` list (ordered array of transformation steps per column)

**New `erp_config_versions` table**:
- Links to a `erp_configs` record (one config → many version snapshots)
- Stores the complete config as a JSONB snapshot at the time of saving
- Version number (auto-incremented per config)
- Optional comment entered by the admin
- Created by (user ID) and timestamp
- Append-only — versions are never modified or deleted

### API Routes

| Route | Purpose |
|-------|---------|
| `GET /api/admin/erp-configs` | List all tenants with their active config status |
| `GET /api/admin/erp-configs/[tenantId]` | Load active config + full version history |
| `PUT /api/admin/erp-configs/[tenantId]` | Save changes → creates new version snapshot |
| `POST /api/admin/erp-configs/[tenantId]/test` | Run config against an order or sample JSON, return preview |
| `POST /api/admin/erp-configs/[tenantId]/rollback/[versionId]` | Restore a version as new active config |
| `POST /api/admin/erp-configs/[tenantId]/copy-from/[sourceTenantId]` | Copy another tenant's config here |

The **existing export routes** (`/api/orders/[orderId]/export`) already read from `erp_configs` — they will automatically pick up the new columns (transformations, xml_template, fallback_mode, etc.) once the export engine is updated.

### Tech Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Where to manage configs | New page `/admin/erp-configs` | Complex enough (versioning, test, copy) to deserve its own page rather than a tab inside the tenant sheet |
| Versioning strategy | Snapshot per save in `erp_config_versions` | Simplest approach — no diff tracking needed, full snapshots are small JSONB objects. Rollback = copy snapshot to active config. |
| XML templates | Handlebars library | Purpose-built for this exact use case (`{{field}}`, `{{#each}}`) — no custom parser needed |
| Date formatting | `date-fns` library | Standard, tree-shakable, handles all patterns like `DD.MM.YYYY` |
| Column ordering | ChevronUp / ChevronDown buttons | Same pattern as OPH-15 dealer column mapping — consistent UX, no drag library needed |
| Transformation engine | Pure functions, no library | The 7 supported transforms (`to_uppercase`, `round`, `multiply`, `date_format`, `default`, `trim`, `to_lowercase`) are simple enough to implement inline |
| Test function execution | Server-side API call | Transformations and Handlebars rendering happen server-side — same engine as the real export. Guarantees WYSIWYG preview. |

### New Dependencies

| Package | Purpose |
|---------|---------|
| `handlebars` | Render XML export templates with `{{order.field}}` and `{{#each order.items}}` syntax |
| `date-fns` | Date formatting transformations (e.g. `date_format("DD.MM.YYYY")`) |

## QA Test Results

**Tested:** 2026-03-02 (Round 2)
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Build Status:** PASS (clean production build, no TypeScript or lint errors)
**Previous Round:** Round 1 on 2026-03-02 found 7 bugs. No fixes have been applied since -- all bugs still present.

---

### Acceptance Criteria Status

#### AC-1: One active config per tenant, all versions preserved -- PASS
- [x] Database migration creates unique index `idx_erp_configs_tenant_unique` on `erp_configs(tenant_id)` -- enforces one config per tenant
- [x] `erp_config_versions` table is append-only (no UPDATE or DELETE RLS policies)
- [x] PUT endpoint creates new version snapshot on every save
- [x] Versions are never modified or deleted by any endpoint

#### AC-2: Configurable technical export parameters -- PASS
- [x] Format selector: CSV, XML, JSON tabs present in UI (`erp-config-editor.tsx` lines 209-266)
- [x] Encoding selector: UTF-8, Latin-1, Windows-1252 options present (lines 411-422)
- [x] Decimal separator: Punkt (.) / Komma (,) options present (lines 425-438)
- [x] Line ending: LF / CRLF options present (lines 441-456)
- [x] Zod validation enforces allowed values server-side (`validations.ts` lines 522-553)
- [x] All parameters persisted in database and version snapshot (PUT endpoint lines 230-302)

#### AC-3: Fallback mode configurable per tenant (default: block) -- PARTIAL FAIL
- [x] Fallback mode selector in UI: Block / Fallback CSV (lines 459-478)
- [x] Database column `fallback_mode` defaults to `block` (migration line 15-16)
- [x] Export route returns HTTP 409 with correct message when config exists with `fallback_mode=block`
- [ ] BUG: Export route defaults to `fallback_csv` when NO config row exists -- see BUG-001

#### AC-4 (CSV): Ordered column list with source, target, required, transformations -- FAIL
- [x] CsvColumnBuilder UI component present with add/remove/reorder functionality
- [x] Each column has: target_column_name (required), source_field (required), required toggle, transformations editor
- [x] ChevronUp/ChevronDown buttons for reordering (lines 197-220)
- [ ] BUG: Source field suggestions use path-based names but the engine only supports bare field names -- see BUG-002

#### AC-5 (XML): Handlebars template with syntax validation -- PASS
- [x] XmlTemplateEditor component with large textarea (`erp-xml-template-editor.tsx`)
- [x] Handlebars syntax documented with example template (lines 16-39)
- [x] Template validated on save (PUT endpoint line 213-221, calls `validateHandlebarsTemplate`)
- [x] Invalid templates rejected with error message
- [x] Available variables reference panel (collapsible, lines 107-130)

#### AC-6 (Transformations): All 7 transform types available and combinable -- PARTIAL FAIL
- [x] `to_uppercase` -- implemented in `applyTransformation` (`erp-transformations.ts` line 29)
- [x] `to_lowercase` -- implemented (line 32)
- [x] `trim` -- implemented (line 35)
- [x] `round(n)` -- implemented with `parseFloat` + `toFixed` (lines 37-42)
- [x] `multiply(n)` -- implemented (lines 44-48)
- [ ] BUG: `date_format(pattern)` -- `date-fns` v4 rejects `DD.MM.YYYY` (the suggested pattern) with an error; requires `dd.MM.yyyy` -- see BUG-008
- [x] `default(value)` -- implemented (lines 62-67)
- [x] Transformations are ordered and applied in sequence (`applyTransformations` lines 77-83)
- [x] Up to 10 transformations per column (Zod enforced, `validations.ts` line 518)
- [x] Parameterized transforms require a non-empty param (Zod refine, lines 493-501)

#### AC-7 (Test function): Manual JSON or existing order -- PARTIAL FAIL
- [x] Test dialog with two modes: JSON input and order selection (`erp-config-test-dialog.tsx`)
- [x] Sample JSON pre-populated with realistic test data (lines 29-93)
- [x] Output preview displayed as plain text in ScrollArea (lines 290-294)
- [x] Warnings displayed for unknown fields and missing required fields (lines 276-287)
- [ ] BUG: "Bestellung waehlen" mode calls a nonexistent endpoint -- see BUG-003

#### AC-8 (Required fields): Block export on missing required field values -- PASS
- [x] `validateRequiredFields` function checks all line items against required mappings (`erp-transformations.ts` lines 234-253)
- [x] Export route returns 400 with specific field name in error message (export `route.ts` lines 212-223)
- [x] Test function shows required field warnings in preview (test `route.ts` lines 126-129)

#### AC-9 (Version history): Auto-increment version with timestamp and comment -- PASS
- [x] Version number auto-incremented per config in PUT endpoint (lines 281-289) and rollback endpoint (lines 93-101)
- [x] Timestamp stored as `created_at` (migration line 43)
- [x] Optional comment stored with each version
- [x] Version list displayed in collapsible panel, sorted descending (`erp-config-version-history.tsx`)
- [x] Created-by email resolved server-side and displayed (GET endpoint lines 72-108)
- [x] Unique index prevents duplicate version numbers (migration line 52-53)

#### AC-10 (Rollback): Restore any previous version as new active -- PASS
- [x] Rollback endpoint creates new version entry as copy of old snapshot (rollback `route.ts` lines 92-116)
- [x] Active config updated with snapshot values (lines 68-82)
- [x] History preserved -- original version not modified
- [x] Confirmation dialog before rollback (`erp-config-version-history.tsx` lines 95-99)
- [x] "Aktuell" badge on latest version (line 67-69), rollback button hidden for current version (line 90)

#### AC-11 (Copy): Copy config from tenant A to tenant B -- PASS
- [x] Copy dialog shows tenants with existing configs, excluding current (`erp-config-copy-dialog.tsx` lines 52-55)
- [x] Copy creates new version in target tenant (copy-from `route.ts` lines 126-166)
- [x] Source tenant version history NOT transferred (only current snapshot copied)
- [x] Comment auto-generated: `Kopiert von Mandant "[name]"` (line 164)
- [x] Existing target config preserved in version history
- [x] Source/target same tenant check returns 400 error (line 35-39)
- [x] Confirmation dialog before copy (`erp-config-copy-dialog.tsx` lines 70-72)

#### AC-12: Changes immediately effective without deployment -- PASS
- [x] Export route reads config at export time with `maybeSingle()` query (export `route.ts` line 175-179)
- [x] No caching layer -- fresh database read on every export

#### AC-13: Admin-only access -- PASS
- [x] All 6 API routes use `requirePlatformAdmin()` guard as first check
- [x] UI pages check `isPlatformAdmin` and show "Zugriff verweigert" for non-admins
- [x] Navigation link has `adminOnly: true` flag (`top-navigation.tsx` line 32)
- [x] RLS policies on `erp_config_versions` restrict to `platform_admin` role (migration lines 62-83)

---

### Edge Cases Status

#### EC-1: Schema Evolution (renamed canonical field) -- PASS (with caveats, see BUG-007)
- [x] Test function shows "Unbekanntes Quellfeld" warning for fields not in known list
- [x] Export continues (field returns empty string via `getLineItemValue` default case)
- [x] `default(value)` transformation can provide fallback

#### EC-2: No mapping configured + fallback = block -- PARTIAL FAIL
- [x] Export returns HTTP 409 with message "Kein ERP-Mapping konfiguriert fuer diesen Mandanten." when config row exists with block mode
- [ ] BUG: When NO config row exists at all, export defaults to `fallback_csv` behavior instead of `block` -- see BUG-001

#### EC-3: No mapping configured + fallback = fallback_csv -- PASS
- [x] Export uses DEFAULT_COLUMN_MAPPINGS with standard fields (export `route.ts` lines 28-37)

#### EC-4: Transformation error (e.g., round on non-numeric) -- PASS
- [x] `applyTransformation` returns original value for non-numeric inputs (no crash)
- [x] Test function surfaces these as visible results

#### EC-5: XML syntax error in template -- PASS
- [x] `validateHandlebarsTemplate` catches parse errors on save
- [x] Error returned to admin with error details

#### EC-6: Copy on tenant with existing mapping -- PASS
- [x] Existing config updated (not duplicated due to unique index)
- [x] Previous config preserved in version history

#### EC-7: Concurrent editing (last-write-wins) -- PASS
- [x] No optimistic locking -- last save wins as designed
- [x] Each save creates its own version

#### EC-8: Array path (items[].product_code) for CSV -- FAIL
- [ ] BUG: `getLineItemValue` does not support prefixed paths -- only bare field names work -- see BUG-002

---

### Additional Edge Cases Found

#### EC-9: Backward compatibility with OPH-6 seed data -- FAIL
- [ ] BUG: Old seed data column_mappings lack `required` and `transformations` fields, causing TypeError crash -- see BUG-004

#### EC-10: useMemo used as useEffect -- FAIL (code quality)
- [ ] BUG: `ErpConfigEditor` uses `useMemo` for side effects (setState calls) -- see BUG-005

#### EC-11: date_format transformation with documented pattern -- FAIL
- [ ] BUG: The UI placeholder and spec both suggest `DD.MM.YYYY` but date-fns v4 requires Unicode tokens (`dd.MM.yyyy`). Using the suggested pattern throws an error, silently returning the raw ISO date -- see BUG-008

---

### Security Audit Results

- [x] **Authentication:** All API routes verify user session via `requirePlatformAdmin()` which calls `supabase.auth.getUser()`. Unauthenticated requests receive 401.
- [x] **Authorization:** `requirePlatformAdmin()` checks `role === 'platform_admin'` in `app_metadata`. Non-admin users receive 403. Inactive user check included.
- [x] **RLS (second line of defense):** `erp_config_versions` has SELECT/INSERT policies for platform_admin only. `erp_configs` table has platform_admin policies for all operations. No UPDATE/DELETE policies on versions (append-only).
- [x] **Input validation:** All inputs validated server-side with Zod schemas. Column mappings limited to 100, transformations to 10 per column, XML template to 50K chars, JSON test input to 100K chars.
- [x] **UUID validation:** All route params (tenantId, versionId, sourceTenantId) validated against UUID regex before any database queries.
- [x] **Rate limiting:** All 6 endpoints use `checkAdminRateLimit` (60 req/min per user, in-memory).
- [x] **XSS prevention:** No raw HTML injection vectors found. Handlebars templates are compiled and rendered server-side only, never sent to the client as raw HTML. XML output uses `escapeXml()` helper.
- [x] **SQL injection:** Supabase parameterized queries used throughout. No string concatenation in queries.
- [x] **IDOR (Insecure Direct Object Reference):** Rollback validates version belongs to the correct config/tenant (rollback `route.ts` line 55: `.eq("erp_config_id", configId)`). Copy validates both source and target tenants exist. Same-tenant copy blocked.
- [x] **Data exposure:** Version snapshots contain config data only (format, mappings, settings), no sensitive user data. Created-by email resolved server-side, not leaked from raw DB.
- [x] **Denial of Service:** Zod limits enforce maximum payload sizes. Version history limited to 100 versions per config in the GET endpoint.
- [ ] BUG: Handlebars `registerHelper` called globally on every XML generation request -- see BUG-006
- [x] **No secrets in code:** All Supabase credentials via environment variables. No hardcoded API keys.
- [x] **Inactive user/tenant checks:** Export route checks both `user_status` and `tenant_status` before proceeding.
- [x] **Security headers:** Export route sets `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`.
- [x] **Handlebars template injection:** Templates are compiled with `{ strict: false }` which is appropriate -- it prevents errors on missing fields but does not expose server internals. Handlebars does not execute arbitrary JS by default.

---

### Cross-Browser Testing (Code Review)

- [x] **Chrome:** No browser-specific APIs used. Standard React/shadcn components throughout.
- [x] **Firefox:** `datalist` element used for CSV source field suggestions is supported in all modern browsers (Firefox 4+). Standard `window.confirm()` for rollback/copy dialogs.
- [x] **Safari:** All shadcn/ui components use standard CSS. `window.confirm()` is universally supported. No WebKit-specific issues identified.

### Responsive Testing (Code Review)

- [x] **Mobile (375px):** List table hides non-essential columns (`hidden sm:table-cell`, `hidden md:table-cell`, `hidden lg:table-cell`). Column builder grid uses `grid-cols-1` on small screens. Action bar stacks vertically with `flex-col`.
- [x] **Tablet (768px):** Technical settings use `sm:grid-cols-2` layout. Most table columns visible. Column builder grid uses `sm:grid-cols-3`.
- [x] **Desktop (1440px):** Technical settings use `lg:grid-cols-3` layout. All table columns visible.
- [x] **Dialog responsiveness:** Test dialog uses `max-w-3xl` with `max-h-[90vh]` and `ScrollArea` for overflow. Copy dialog uses standard Dialog width.

---

### Bugs Found

#### BUG-001: Export fallback_mode defaults to fallback_csv when no config row exists
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Have a tenant with NO erp_configs row at all
  2. Try to export an approved order for that tenant
  3. Expected: Export should be blocked (AC-3 says default is `block`)
  4. Actual: Export succeeds with generic fallback CSV because `erpConfig?.fallback_mode ?? "fallback_csv"` defaults to `fallback_csv` when no config row exists
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/export/route.ts` line 182
- **Note:** This may be intentional for backward compatibility with pre-OPH-9 tenants. If so, it should be documented. The current behavior means the "block" mode can only work for tenants that have a config row with `fallback_mode=block`.
- **Priority:** Fix in next sprint (clarify design intent)

#### BUG-002: Source field path mismatch between UI suggestions and transformation engine
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Go to `/admin/erp-configs/[tenantId]`
  2. Add a CSV column
  3. Select a suggested source field like `items[].article_number` or `order.order_number`
  4. Save the config and test it
  5. Expected: The column should resolve to the correct value from the canonical JSON
  6. Actual: `getLineItemValue()` in `export-utils.ts` only handles bare field names (`article_number`, `position`, etc.) via a switch statement (lines 15-36). Any path-prefixed field name falls through to the default case and returns `""` (empty string).
- **Files:**
  - `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/export-utils.ts` lines 15-36
  - `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/admin/erp-csv-column-builder.tsx` lines 20-53
- **Impact:** CSV exports configured through the new admin UI with path-based source fields will produce empty columns. Only bare field names (from the OPH-6 era) work. This breaks the core CSV configuration workflow. Either the UI suggestions need to use bare field names, or `getLineItemValue` needs to support path-based names.
- **Priority:** Fix before deployment

#### BUG-003: Missing /api/admin/erp-configs/[tenantId]/orders endpoint
- **Severity:** High
- **Steps to Reproduce:**
  1. Go to `/admin/erp-configs/[tenantId]`
  2. Click "Testen" to open the test dialog
  3. Switch to the "Bestellung waehlen" tab
  4. Expected: Approved orders for this tenant are loaded
  5. Actual: The hook calls `GET /api/admin/erp-configs/${tenantId}/orders` which does not exist (no route file found at `src/app/api/admin/erp-configs/[tenantId]/orders/`). The fetch silently fails and shows "Keine genehmigten Bestellungen" even when orders exist.
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/hooks/use-erp-configs.ts` line 259
- **Priority:** Fix before deployment

#### BUG-004: Backward compatibility -- old column_mappings crash transformation engine
- **Severity:** Critical (Regression)
- **Steps to Reproduce:**
  1. Have a tenant with OPH-6 seed data column_mappings (e.g., `[{"source_field": "position", "target_column_name": "Pos"}]` -- missing `required` and `transformations` fields)
  2. Export an order for that tenant
  3. Expected: Export works with default transformations
  4. Actual: `getTransformedValue()` in `erp-transformations.ts` line 111 accesses `mapping.transformations.length`. For old data where `transformations` is `undefined`, this throws a TypeError crash.
- **Files:**
  - `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/erp-transformations.ts` line 111
  - `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/export/route.ts` lines 201-202
- **Fix hint:** Either parse column_mappings through Zod with `.default([])` before use, or add null-safe check: `(mapping.transformations?.length ?? 0) > 0`
- **Priority:** Fix before deployment (regression affecting all existing exports)

#### BUG-005: useMemo used for side effects (React antipattern)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Open `/admin/erp-configs/[tenantId]`
  2. The component uses `useMemo` with `setState` calls inside it (lines 174-189 of erp-config-editor.tsx)
  3. Expected: Side effects should use `useEffect`
  4. Actual: `useMemo` is used for synchronization logic. While functionally working today, React documentation warns that useMemo may be called more or fewer times than expected. Side effects inside useMemo are not guaranteed to run at the correct time. An eslint-disable comment on line 188 suppresses the exhaustive-deps warning.
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/admin/erp-config-editor.tsx` lines 174-189
- **Priority:** Nice to have

#### BUG-006: Handlebars global helper registration on every request
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Send multiple concurrent XML export test requests
  2. Expected: Each request uses isolated Handlebars context
  3. Actual: `Handlebars.registerHelper("escapeXml", ...)` is called on the global `Handlebars` instance on every invocation of `generateXmlContent` (line 172 of erp-transformations.ts). While functionally benign since the same helper is re-registered each time, this shared global state could cause race conditions if the helper implementation ever varies between requests.
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/erp-transformations.ts` lines 172-174
- **Fix hint:** Use `Handlebars.create()` to get an isolated environment per request, or register the helper once at module load time (top-level of the file).
- **Priority:** Fix in next sprint

#### BUG-007: Test endpoint known field list too restrictive
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Open test dialog for a tenant's ERP config
  2. Configure columns with source fields like `order.order_number` or `items[].position`
  3. Run the test
  4. Expected: No warning for fields that exist in the canonical schema
  5. Actual: Warnings shown for every source field not in the hardcoded `knownFields` list (test `route.ts` lines 132-138), which only includes 8 bare line-item field names: `position`, `article_number`, `description`, `quantity`, `unit`, `unit_price`, `total_price`, `currency`. All order-level fields and all path-prefixed item fields generate false "Unbekanntes Quellfeld" warnings.
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/erp-configs/[tenantId]/test/route.ts` lines 132-138
- **Priority:** Fix before deployment (confusing UX that undermines trust in the test feature)

#### BUG-008: date_format placeholder suggests pattern incompatible with date-fns v4
- **Severity:** High
- **Steps to Reproduce:**
  1. Open `/admin/erp-configs/[tenantId]` and add a CSV column
  2. Add a `date_format` transformation
  3. Use the suggested pattern `DD.MM.YYYY` (shown as the placeholder text)
  4. Save and test with a date value like `2026-03-01`
  5. Expected: Date formatted as `01.03.2026`
  6. Actual: `date-fns` v4 throws an error: "Use `dd` instead of `DD`". The error is caught silently in the `try/catch` block (`erp-transformations.ts` line 57), and the raw ISO date string is returned untransformed. The admin sees no error message -- the date just appears as `2026-03-01` instead of `01.03.2026`.
- **Verified:** Confirmed by running `date-fns format()` with `DD.MM.YYYY` -- it throws. Correct pattern is `dd.MM.yyyy`.
- **Files:**
  - `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/admin/erp-transformation-editor.tsx` line 30 (placeholder says `DD.MM.YYYY`)
  - `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/erp-transformations.ts` lines 51-59 (silently swallows the error)
  - `/Users/michaelmollath/projects/ai-coding-starter-kit/features/OPH-9-admin-erp-mapping.md` line 44 (spec says `DD.MM.YYYY`)
  - `/Users/michaelmollath/projects/ai-coding-starter-kit/features/OPH-9-admin-erp-mapping.md` line 169 (tech design says `DD.MM.YYYY`)
- **Impact:** Every admin who follows the suggested pattern will get silent transformation failures. Dates will appear in raw ISO format in exports instead of the configured format.
- **Fix hint:** Change the placeholder to `dd.MM.yyyy` and add a UI hint explaining that date-fns Unicode tokens are required (lowercase `dd`/`yyyy`, uppercase `MM`).
- **Priority:** Fix before deployment

---

### Regression Testing

#### OPH-6 (ERP Export) Regression
- [ ] BUG: Existing exports will crash for tenants with old-format column_mappings missing `transformations` field -- see BUG-004
- [x] Export route updated to use OPH-9 transformation engine
- [x] Export route respects new config columns (xml_template, line_ending, decimal_separator, fallback_mode)
- [x] Default column mappings provided for backward compatibility (export `route.ts` lines 28-37)
- [x] Export preview route also updated with transformation engine (`preview/route.ts`)

#### OPH-8 (Admin Tenant Management)
- [x] Tenant list page still accessible
- [x] No shared components modified by OPH-9

#### OPH-1 (Multi-Tenant Auth)
- [x] Auth flow unaffected
- [x] Admin auth check uses same `requirePlatformAdmin()` pattern consistently

#### OPH-14 (Dealer Data Transformations)
- [x] Dealer mappings unaffected -- separate transformation pipeline
- [x] No shared code paths modified

#### OPH-15 (Dealer Column Mapping)
- [x] Column mapping profiles unaffected -- separate database table and API
- [x] No conflicts with ERP config column mappings

---

### Summary
- **Acceptance Criteria:** 9/13 fully passed, 3 partially failed (AC-3, AC-4, AC-6, AC-7), 0 fully failed
- **Bugs Found:** 8 total (2 critical, 2 high, 3 medium, 1 low)
- **Security:** Pass (no exploitable vulnerabilities found, minor code hygiene issue with Handlebars globals)
- **Regression:** 1 critical regression on OPH-6 exports (BUG-004)
- **Production Ready:** NO

### Bug Priority Summary

| Priority | Count | Bug IDs |
|----------|-------|---------|
| Fix before deployment | 5 | BUG-002, BUG-003, BUG-004, BUG-007, BUG-008 |
| Fix in next sprint | 2 | BUG-001, BUG-006 |
| Nice to have | 1 | BUG-005 |

### Recommendation
**Do NOT deploy.** Five bugs must be fixed before deployment:
1. **BUG-004** (Critical Regression): Old column_mappings without `transformations` field crash exports -- this breaks existing OPH-6 functionality for all tenants with pre-OPH-9 configs.
2. **BUG-002** (Critical): Source field path mismatch makes the CSV column builder unusable for any field that uses the UI-suggested path syntax.
3. **BUG-003** (High): Missing orders endpoint breaks the "test with existing order" feature entirely.
4. **BUG-008** (High): date_format placeholder suggests `DD.MM.YYYY` which silently fails with date-fns v4, producing untransformed dates in exports.
5. **BUG-007** (Medium): False warnings for valid source fields confuse admins during testing and undermine confidence in the configuration.

After fixes, run `/qa` again to verify.

## Deployment
_To be added by /deploy_
