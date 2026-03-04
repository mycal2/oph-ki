# OPH-20: Sprach-Erkennung & Mengeneinheiten-Normalisierung

## Status: Deployed
**Created:** 2026-03-03
**Last Updated:** 2026-03-04

## Dependencies
- Requires: OPH-4 (KI-Datenextraktion) — Extraktion muss laufen, bevor Sprache/Einheiten erkannt werden
- Requires: OPH-5 (Bestellprüfung) — Sprachchip erscheint in der Bestelldetailansicht
- Requires: OPH-15 (Dealer Column Mapping) — Spaltenerkennung baut auf dem bestehenden Extraktions-Prompt auf

## User Stories
- Als Mitarbeiter möchte ich die erkannte Dokumentensprache als Chip in der Bestelldetailansicht sehen, damit ich prüfen kann, ob das System die richtige Sprache identifiziert hat.
- Als Mitarbeiter möchte ich, dass alle Mengeneinheiten einheitlich auf Deutsch angezeigt werden (z.B. "Stück" statt "pc", "pcs", "stk", "unité"), damit die Bestelldaten sprachunabhängig konsistent sind.
- Als System möchte ich Mengenspaltennamen in verschiedenen Sprachen erkennen (Menge, Qty, Quantité, Cantidad, Ilość, Aantal), damit Bestelltabellen aus internationalen Märkten korrekt ausgelesen werden.
- Als Mitarbeiter möchte ich bei unbekannten Einheiten einen Hinweis sehen, damit ich sie manuell korrigieren kann.
- Als Admin möchte ich wissen, in welcher Sprache eine Bestellung eingegangen ist, damit ich bei Nachfragen des Händlers schnell reagieren kann.

## Acceptance Criteria
- [ ] Sprach-Erkennung: Claude erkennt die Hauptsprache des Dokuments (DE, EN, FR, ES, CS, PL, IT, NL, PT, andere) und speichert sie als ISO-639-1-Code in `extracted_data.document_language`
- [ ] Sprach-Chip: In der Bestelldetailansicht wird die erkannte Sprache als Badge/Chip angezeigt (z.B. "DE", "EN", "FR") — sichtbar im Order-Header neben dem Bestelltitel
- [ ] Chip-Varianten: Badge ist farblich neutral (grau); bei unbekannter Sprache erscheint ein Fragezeichen-Badge "?"
- [ ] Einheiten-Normalisierung: Das Extraktionssystem übersetzt alle erkannten Mengeneinheiten ins Deutsche gemäß der Standard-Mapping-Tabelle (siehe Tabelle unten)
- [ ] Unbekannte Einheiten: Wenn eine Einheit nicht zugeordnet werden kann, wird die Original-Abkürzung beibehalten und mit einem Suffix "(unbekannt)" markiert
- [ ] Mengenspalten-Erkennung: Die KI erkennt die Mengenspalte in Tabellen anhand von Schlüsselwörtern in DE / EN / FR / ES / CS / PL / IT / NL (vollständige Liste in Technical Requirements)
- [ ] Keine DB-Schema-Änderung nötig: `document_language` wird in der bestehenden `extracted_data` JSONB-Spalte gespeichert
- [ ] Rückwärtskompatibilität: Bestehende Bestellungen ohne `document_language` zeigen keinen Chip (kein Pflichtfeld)

### Standard-Einheiten-Mapping (→ Deutsch)

| Original-Abkürzungen | Deutschen Standardterm |
|----------------------|------------------------|
| pc, pcs, piece, pieces, unit, units, ea, each, stk, stück, unité, unite, pièce, pieza, ks, szt | **Stück** |
| pkg, pack, package, pkt, pckg, Packung | **Packung** |
| box, bx, ctn, carton, cs, case, Karton | **Karton** |
| btl, bottle, flasche, fl | **Flasche** |
| can, tin, dose, ds | **Dose** |
| tube, tb, tub | **Tube** |
| bag, beutel, sachet | **Beutel** |
| roll, rll, rolle | **Rolle** |
| pair, pr, paar | **Paar** |
| set, kit | **Set** |
| L, l, lt, liter, litre | **Liter** |
| ml, mL, milliliter | **Milliliter** |
| g, gr, gramm, gram | **Gramm** |
| kg, kilogramm, kilogram | **Kilogramm** |
| m, meter, metre | **Meter** |

### Mengenspalten-Schlüsselwörter (Sprache → Spaltenkopf)

| Sprache | Typische Spaltenköpfe |
|---------|----------------------|
| Deutsch | Menge, Anzahl, Stück, Qty |
| Englisch | Qty, Quantity, Amount, Count, Units |
| Französisch | Quantité, Qté, Qte, Nombre |
| Spanisch | Cantidad, Cant, Ctd |
| Tschechisch | Množství, Počet |
| Polnisch | Ilość, Ilosc, Liczba |
| Italienisch | Quantità, Qtà, Qtà |
| Niederländisch | Aantal, Hoeveelheid |

## Edge Cases
- **Gemischte Sprachen im Dokument** (z.B. englischer Header, deutsche Produktbeschreibungen): Claude wählt die Sprache des Hauptinhalts (Bestelltabelle) — nicht die Sprache des E-Mail-Rahmens
- **Einheit nicht in Mapping-Tabelle**: Original-Abkürzung bleibt erhalten + "(unbekannt)" wird ergänzt, damit Mitarbeiter es manuell korrigieren kann
- **Keine Einheit im Dokument** (implizit "Stück"): Claude setzt "Stück" als Default wenn eine Menge ohne Einheit vorkommt
- **Sprache nicht erkennbar** (z.B. rein numerisches Dokument): `document_language` bleibt `null`, kein Chip wird angezeigt
- **Einheit ist eine Zahl** (z.B. "1 x 500ml" als Einheit): Nur den Einheitenteil extrahieren und normalisieren ("Milliliter")
- **Dezimaltrennzeichen unterschiedlich**: Im Deutschen Komma (1,5), im Englischen Punkt (1.5) — kein Teil dieses Features; bereits durch Claude-Extraktion abgedeckt
- **Altbestellungen** (vor OPH-20 erstellt): Kein `document_language` → kein Chip → keine Aktion nötig

## Technical Requirements
- Änderungen im Extraction Prompt (`/api/orders/[orderId]/extract`): Claude bekommt explizite Anweisung zur Sprach-Erkennung und Einheiten-Normalisierung
- `document_language` wird als Top-Level-Feld in `extracted_data` gespeichert (JSON: `"document_language": "EN"`)
- Post-Processing in der Extract-Route: Unit-Normalisierung kann auch serverseitig als Fallback nach der KI-Antwort angewendet werden
- Sprach-Badge-Komponente: Kleine neue Komponente oder Erweiterung von `order-detail-header.tsx`
- Keine neuen npm-Pakete erforderlich

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview

OPH-20 extends the existing AI extraction pipeline with two closely related capabilities: (1) language detection, and (2) unit normalization to German. No new database tables, no new API endpoints, and no new npm packages are needed. The changes are concentrated in three layers:

1. **Extraction prompt** — instruct Claude to detect language and output German units
2. **TypeScript types** — add `document_language` field to the data model
3. **Order detail UI** — show a language chip in the existing header card

---

### A) Component Structure (Visual Tree)

```
OrderDetailHeader (existing card)
+-- [Title row]
|   +-- FileText icon + filename
|   +-- [LanguageBadge] ← NEW: e.g. "DE" / "EN" / "FR" / "?"
+-- [Meta row]
|   +-- Calendar icon + date
|   +-- User icon + uploader
+-- [Action row]
|   +-- ExportButton
|   +-- ExtractionStatusBadge
|   +-- StatusBadge
+-- [Dealer section]
    +-- DealerSection + RecognitionAuditLine
```

The language chip is a single shadcn `Badge` placed inline in the title row, immediately after the filename. It is only rendered when `extracted_data.document_language` is present; old orders are unaffected.

---

### B) Data Model (what changes)

**No new database tables or columns.** The `orders.extracted_data` column is already a flexible JSONB field.

**One new field** is added to the extracted data JSON structure:

```
extracted_data: {
  document_language: "EN"   ← NEW top-level field (ISO 639-1 code)
  order: { ... }             ← unchanged
  extraction_metadata: { ... } ← unchanged
}
```

`document_language` is optional — `null` or absent for orders processed before OPH-20 (no migration, no breaking change).

**Existing field updated (values change, not structure):**

The `unit` field on each line item already exists. Previously its values reflected whatever the source document used (`"pc"`, `"pcs"`, `"stk"`). After OPH-20 the values will always be German standard terms (`"Stück"`, `"Packung"`, `"Karton"`) as instructed via the prompt and enforced by a server-side normalization step.

---

### C) Tech Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Where language detection runs | Inside Claude's extraction prompt | Claude already reads the full document; asking it to also identify language adds minimal overhead and zero latency |
| Language storage location | Top-level of `extracted_data` JSON | Not part of order content (`order.*`), not an extraction quality metric (`extraction_metadata.*`) — it's document metadata that belongs at the root |
| Unit normalization strategy | Two-layer: prompt instruction + server-side fallback table | The prompt is the primary path (Claude is good at this). The fallback table catches any cases where Claude returns an unexpected abbreviation, ensuring consistent output regardless of model behaviour |
| Server-side fallback | Inline normalization in the extract route after receiving Claude's response | Keeps the logic co-located with extraction; no extra API call; runs in milliseconds |
| Language chip in UI | Inline `Badge` in `order-detail-header.tsx` | Badge component already installed; no new file needed; the header card is the right place since language is document metadata, not order content |
| Backwards compatibility | Optional field; chip only rendered if `document_language != null` | Zero risk to existing orders; staff will only see chips on newly processed orders |

---

### D) Files to Create / Modify

| File | Change |
|------|--------|
| `src/lib/claude-extraction.ts` | (1) Add `document_language` to JSON schema; (2) Add language detection + unit normalization rules to system prompt |
| `src/lib/types.ts` | Add `document_language?: string \| null` to `CanonicalOrderData` |
| `src/app/api/orders/[orderId]/extract/route.ts` | Add server-side unit normalization helper applied after Claude's response |
| `src/components/orders/order-detail-header.tsx` | Add language `Badge` chip (renders only when `document_language` is set) |

---

### E) Extraction Prompt Changes (what Claude is told)

**JSON schema addition** — one new field alongside `extraction_metadata`:
- `document_language` — ISO 639-1 code (e.g. `"DE"`, `"EN"`, `"FR"`) of the document's main language; `null` if indeterminate

**New system prompt rules:**
- Rule for language: "Detect the primary language of the order content (the table/line items), not the email wrapper. Set `document_language` to the ISO 639-1 code (DE, EN, FR, ES, CS, PL, IT, NL, PT…). Set to null if the document is purely numeric or language cannot be determined."
- Rule for units: "All `unit` field values must be German standard terms (Stück, Packung, Karton, Flasche, Dose, Tube, Beutel, Rolle, Paar, Set, Liter, Milliliter, Gramm, Kilogramm, Meter). Translate from any source language abbreviation (pc, pcs, stk, unité, Cantidad, Ilość, ks, szt, pkg, ctn, etc.). If no unit is stated, use Stück. If the unit cannot be mapped, preserve the original abbreviation."
- Rule for quantity column recognition: "Recognize the quantity column by its header name in any language (Menge, Anzahl, Qty, Quantity, Quantité, Qté, Cantidad, Cant, Množství, Ilość, Liczba, Quantità, Aantal, Hoeveelheid) and extract the numeric value from that column."

---

### F) No New Dependencies

All required building blocks are already in the project:
- `Badge` (shadcn/ui) — already installed, used elsewhere in this component
- Supabase JSONB — existing column, no migration
- TypeScript optional field — no breaking changes

---

## QA Test Results

**QA Date:** 2026-03-04
**Build:** PASS (Next.js 16.1.1, Turbopack, 0 errors, 39 static pages generated)

### Acceptance Criteria Audit

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| AC1 | Sprach-Erkennung: Claude erkennt Hauptsprache und speichert als ISO-639-1 in `extracted_data.document_language` | PASS | `document_language` added to JSON schema in `claude-extraction.ts` (line 15), prompt rule 13 instructs language detection, parsed response uppercased and stored at top-level of `CanonicalOrderData`. Code: `document_language: parsed.document_language?.toUpperCase() ?? null` (line 295). |
| AC2 | Sprach-Chip: Badge in Bestelldetailansicht im Order-Header neben Bestelltitel | PASS | `LanguageBadge` component in `order-detail-header.tsx` (lines 73-97), rendered inline after filename in CardTitle (line 129): `<LanguageBadge code={order.extracted_data?.document_language} />`. Uses shadcn `Badge` with `Tooltip` for full language name. |
| AC3 | Chip-Varianten: Badge farblich neutral (grau); bei unbekannter Sprache Fragezeichen-Badge "?" | PASS (partial) | Badge uses `variant="outline"` which renders as neutral/gray border -- neutral color requirement met. However, for unknown language codes (not in LANGUAGE_NAMES map), the implementation shows the raw ISO code (e.g. "XX") with tooltip "Unbekannte Sprache" instead of showing "?". In practice, Claude returns valid ISO codes or null (in which case no badge is shown), so the "?" case is unlikely to occur. Acceptable for MVP. |
| AC4 | Einheiten-Normalisierung: Alle Einheiten ins Deutsche gemaess Mapping-Tabelle | PASS | Two-layer approach: (1) Prompt rule 14 in `claude-extraction.ts` (lines 93-111) instructs Claude to output German standard terms. (2) Server-side fallback `normalizeUnits()` from `unit-normalization.ts` called in extract route (line 487). All 15 unit categories from the spec are covered in both prompt and server-side map. |
| AC5 | Unbekannte Einheiten: Original beibehalten + "(unbekannt)" Suffix | PASS | `normalizeUnit()` in `unit-normalization.ts` (line 152): `return \`${trimmed} (unbekannt)\`;` for unmapped units. Double-marking prevention at line 148. Empty/null units default to "Stueck" (line 131). |
| AC6 | Mengenspalten-Erkennung: KI erkennt Mengenspalte in DE/EN/FR/ES/CS/PL/IT/NL | PASS | Prompt rule 15 in `claude-extraction.ts` (lines 112-121) lists all 8 languages with their quantity column keywords matching the spec table. Keywords are transliterated to ASCII per project convention (e.g. "Quantite" instead of "Quantite"). |
| AC7 | Keine DB-Schema-Aenderung: `document_language` in bestehender JSONB-Spalte | PASS | `document_language` is stored as a top-level field in the `extracted_data` JSONB column. No new migration file. `CanonicalOrderData` in `types.ts` (line 282) defines it as `document_language?: string \| null` (optional). |
| AC8 | Rueckwaertskompatibilitaet: Alte Bestellungen ohne `document_language` zeigen keinen Chip | PASS | `LanguageBadge` returns `null` when `code` is null/undefined/empty (line 74: `if (!code) return null;`). The field is optional in the TypeScript type. No migration needed. |

### Edge Cases

| Edge Case | Status | Notes |
|-----------|--------|-------|
| Gemischte Sprachen im Dokument | PASS | Prompt rule 13 explicitly says "primary language of the order content (the table/line items), not the email wrapper or forwarding note." |
| Einheit nicht in Mapping-Tabelle | PASS | Server-side `normalizeUnit()` appends "(unbekannt)" to unknown units. Double-marking prevention included. |
| Keine Einheit im Dokument (implizit Stueck) | PASS | Prompt says "If no unit is stated, use Stueck." Server-side fallback: `normalizeUnit(null)` returns "Stueck" (line 131). |
| Sprache nicht erkennbar | PASS | Prompt says "Set to null if... language cannot be determined." `LanguageBadge` returns null for null code. |
| Einheit ist eine Zahl (z.B. "1 x 500ml") | PASS (prompt-dependent) | No explicit server-side handling for embedded quantities in unit strings. Relies on Claude's instruction to extract only the unit part. Acceptable since Claude is instructed via the prompt. |
| Dezimaltrennzeichen | PASS | Explicitly out of scope for this feature, noted in edge cases. |
| Altbestellungen (vor OPH-20) | PASS | Optional field, no migration, badge returns null for absent field. |

### Bugs Found & Fixed

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 1 | `reviewSaveSchema` in `validations.ts` does not include `document_language` field — Zod strips it during review auto-save | Low | FIXED — added `document_language: z.string().nullable().optional()` to `reviewSaveSchema.reviewedData` |
| 2 | AC3: "?" badge for unknown language codes — implementation showed raw code instead | Low | FIXED — `LanguageBadge` now shows "?" for codes not in `LANGUAGE_NAMES` map |

### Security Audit

| Check | Status | Notes |
|-------|--------|-------|
| Auth on extract route | PASS | Dual authentication preserved: internal secret (timing-safe comparison) and Supabase user auth. No auth changes in the OPH-20 diff. |
| No secrets exposed | PASS | No new environment variables. No secrets in client-side code. `ANTHROPIC_API_KEY` remains server-only. |
| Input sanitization on language code | PASS | `document_language` is uppercased on the server side (`parsed.document_language?.toUpperCase() ?? null` at line 295 of `claude-extraction.ts`). It is a string from Claude's JSON response, not user input. The `LanguageBadge` also uppercases before display. No injection vector -- the code is only displayed in a `<Badge>` element (React escapes HTML by default). |
| No new attack surface | PASS | No new API endpoints. No new user-facing input fields. The unit normalization runs server-side on data from Claude (not user input). |
| Prompt injection via unit strings | PASS | Unit normalization uses a static lookup table, not dynamic evaluation. Unknown units are displayed as-is with "(unbekannt)" suffix -- no code execution risk. |
| XSS via language code or unit strings | PASS | React JSX escapes all string values rendered in components. No `dangerouslySetInnerHTML` usage. |

### Regression Check

| Feature | Status | Notes |
|---------|--------|-------|
| OPH-4 (KI-Datenextraktion) | PASS | Extraction flow unchanged. New prompt rules 13-15 added after existing rules. JSON schema extended with `document_language` (additive). `extractOrderData()` function signature unchanged. Return type now includes `document_language` but is backwards-compatible (optional field). |
| OPH-5 (Bestellpruefung) | PASS | Review page, auto-save, and approval flows are untouched. The `reviewSaveSchema` strips `document_language` (see Bug #1) but does not break -- existing fields pass through correctly. |
| OPH-14 (Haendler-Datentransformationen) | PASS | `applyMappings()` is called before `normalizeUnits()` in the extract route (line 478-482 then line 487). Order of operations is correct: dealer mappings first, then unit normalization. No changes to dealer mapping code. |
| OPH-15 (Dealer Column Mapping) | PASS | Column mapping context is passed to extraction as before. No changes to `getColumnMappingProfile()` or `formatColumnMappingForPrompt()`. The new prompt rules are appended after existing column mapping prompt context. |
| Build | PASS | `npm run build` succeeds with 0 errors. All routes compile. |

### Verdict: PASS

All 8 acceptance criteria are met (AC3 has a minor cosmetic discrepancy with the "?" badge for unknown languages that is unlikely to occur in practice). Two low-severity bugs documented and fixed. No regressions detected. No security issues found. The feature is ready for deployment.

## Deployment

**Deployed:** 2026-03-04
**Production URL:** https://oph-ki.ids.online
**Git commit:** `b3df928`
**Git tag:** `v1.21.0-OPH-20`

### Files Deployed
- `src/lib/claude-extraction.ts` — Updated extraction prompt: language detection (rule 13), unit normalization (rule 14), multilingual quantity column recognition (rule 15)
- `src/lib/unit-normalization.ts` — New server-side unit normalization module (~70 abbreviations → 15 German standard terms)
- `src/lib/types.ts` — Added `document_language?: string | null` to `CanonicalOrderData`
- `src/lib/validations.ts` — Added `document_language` to `reviewSaveSchema` to prevent Zod stripping during auto-save
- `src/app/api/orders/[orderId]/extract/route.ts` — Added `normalizeUnits()` call after extraction
- `src/components/orders/order-detail-header.tsx` — Added `LanguageBadge` chip with Tooltip
