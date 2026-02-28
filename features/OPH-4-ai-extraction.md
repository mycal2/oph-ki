# OPH-4: KI-Datenextraktion mit Händler-Kontext (Claude API)

## Status: In Progress
**Created:** 2026-02-27
**Last Updated:** 2026-02-28

## Dependencies
- Requires: OPH-3 (Händler-Erkennung) — Händler-Kontext verbessert Extraktionsqualität
- Requires: OPH-2 (Bestellungs-Upload) — Dateien müssen in Storage vorliegen

## Konzept: Canonical JSON Format
Das System überführt jede Bestellung in ein einheitliches, internes JSON-Format ("Canonical Order"). Dieses Format ist der gemeinsame Nenner aller Bestellungen, unabhängig von Händler und Eingangsformat. Erst in OPH-6 wird dieses JSON in das ERP-spezifische Format transformiert.

```json
{
  "order": {
    "order_number": "string | null",
    "order_date": "ISO 8601 date | null",
    "dealer": { "id": "uuid", "name": "string" },
    "delivery_address": {
      "company": "string | null",
      "street": "string | null",
      "city": "string | null",
      "postal_code": "string | null",
      "country": "string | null"
    },
    "billing_address": { "..." },
    "line_items": [
      {
        "position": "integer",
        "article_number": "string | null",
        "description": "string",
        "quantity": "number",
        "unit": "string | null",
        "unit_price": "number | null",
        "total_price": "number | null",
        "currency": "string | null"
      }
    ],
    "total_amount": "number | null",
    "currency": "string | null",
    "notes": "string | null"
  },
  "extraction_metadata": {
    "confidence_score": "number (0-1)",
    "model": "string",
    "extracted_at": "ISO 8601 datetime",
    "source_files": ["filename1", "filename2"],
    "dealer_hints_applied": "boolean"
  }
}
```

## User Stories
- Als System möchte ich nach dem Upload und der Händler-Erkennung automatisch die Bestelldaten aus den Dokumenten extrahieren, damit der Benutzer strukturierte Daten zur Prüfung erhält.
- Als System möchte ich Händler-spezifische Extraktions-Hints an Claude übergeben, damit die Extraktion bei bekannten Händlern präziser ist.
- Als System möchte ich für jedes extrahierte Feld einen Konfidenz-Hinweis speichern, damit die Review-UI (OPH-5) dem Benutzer zeigen kann, welche Felder unsicher sind.
- Als Entwickler möchte ich das Canonical-JSON-Schema versioniert haben, damit zukünftige Schema-Erweiterungen rückwärtskompatibel sind.

## Acceptance Criteria
- [ ] Nach Händler-Erkennung startet automatisch die KI-Extraktion (asynchron, kein Warten für den Benutzer)
- [ ] Claude API (claude-opus-4-6 oder claude-sonnet-4-6) wird mit dem Dateiinhalt und Händler-Hints im Prompt aufgerufen
- [ ] PDF- und Bildinhalt wird per Claude's Multimodal-Fähigkeit verarbeitet (kein separates OCR)
- [ ] Excel/CSV-Inhalt wird als Text in den Claude-Prompt eingebettet
- [ ] .eml-Dateien werden in Betreff, Absender, Text-Body und Anhänge zerlegt; alle relevanten Teile werden extrahiert
- [ ] Extraktionsergebnis wird im Canonical JSON Format gespeichert
- [ ] Felder, die nicht erkannt werden, erhalten `null` (kein Abbruch)
- [ ] Gesamtdauer der Extraktion < 30 Sekunden für typische Bestellung (1–50 Positionen)
- [ ] Benutzer sieht in der UI den Extraktionsstatus (In Verarbeitung / Abgeschlossen / Fehler)
- [ ] API-Fehler von Claude (Rate Limit, Timeout) führen zu automatischem Retry (max. 3 Versuche)
- [ ] Kosten der Claude-API-Aufrufe werden pro Mandant protokolliert (für spätere Abrechnung)

## Edge Cases
- Was passiert, wenn ein PDF passwortgeschützt ist? → Fehlermeldung "Datei ist passwortgeschützt und kann nicht verarbeitet werden"; Benutzer muss unverschlüsseltes PDF hochladen
- Was passiert, wenn ein Dokument keine Bestelldaten enthält (z.B. ein falsch angehängtes Dokument)? → Claude gibt `null` oder leere Arrays zurück; Benutzer wird informiert ("Keine Bestelldaten gefunden")
- Was passiert, wenn die Bestellung mehr als 200 Positionen hat? → Chunked Processing (Dokument in Abschnitte aufteilen), Ergebnisse zusammenführen
- Was passiert, wenn Claude ein nicht-deutsches/nicht-englisches Dokument erhält? → Claude extrahiert trotzdem, da multilingual; Sprache wird in Metadaten notiert
- Was passiert bei Claude API Outage? → Extraktion bleibt im Status "Ausstehend"; Retry-Mechanismus; Benutzer informieren

## Technical Requirements
- Model: `claude-opus-4-6` für hohe Genauigkeit (konfigurierbar, Fallback auf `claude-sonnet-4-6`)
- Prompt-Strategie: System-Prompt mit JSON-Schema-Definition + Händler-spezifische Hints + Dokument-Inhalt
- Extraktion läuft als Next.js API Route (oder Supabase Edge Function)
- Ergebnis wird in `orders`-Tabelle als JSONB gespeichert
- Schema-Version im Ergebnis-JSON für Migrationskompatibilität

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

```
/orders/[orderId] page (existing)
+-- OrderDetailHeader (existing — extended)
|   +-- ExtractionStatusBadge  ← NEW
|       Shows: "In Verarbeitung" (spinner) / "Extrahiert" / "Fehler"
|
+-- OrderDetailContent (existing — polls for status)
|   useOrderPolling hook  ← NEW
|   Checks every 3s while status = "processing"; stops on "extracted" or "failed"
|
+-- ExtractionResultPreview  ← NEW (shown once extraction is done)
    Summary card: order number, date, dealer, line item count, confidence score
    "Zur Pruefung" button → links to OPH-5 review page (when built)
```

### Data Model

New columns on the existing `orders` table (no new tables):

```
orders table gets 4 new columns:
- extraction_status     → "pending" | "processing" | "extracted" | "failed"
- extracted_data        → full Canonical JSON result (flexible JSONB blob)
- extraction_attempts   → how many times the system has tried (0–3)
- extraction_error      → last error message if status = "failed"
```

The Canonical JSON stored in `extracted_data` contains:
- Order number, date
- Delivery + billing address
- Line items (article number, description, quantity, unit, price)
- Total amount + currency + notes
- Extraction metadata: confidence score, model used, dealer hints applied flag

### API Routes

| Route | Purpose |
|-------|---------|
| `POST /api/orders/[orderId]/extract` | Triggers extraction. Called fire-and-forget from confirm step. Also callable manually to retry a failed extraction. |

Existing `GET /api/orders/[orderId]` extended to include `extraction_status` and `extracted_data`.

### Server Utilities

**`src/lib/claude-extraction.ts`** — AI extraction engine:
- Downloads file from Supabase Storage
- Routes to the right handler based on file type
- Builds prompt: system instructions + Canonical JSON schema + dealer hints + file content
- Calls Claude API with retry (max 3 on rate limit / timeout)
- Parses Claude's JSON response into Canonical format
- Returns result with confidence score

**`src/lib/eml-parser.ts`** — .eml file support:
- Extracts: subject, sender, plain-text body, HTML body
- Identifies and lists attachments (name + type)
- Produces clean text representation for Claude

### File Type Handling

| File Type | How Claude Sees It |
|-----------|-------------------|
| `.pdf` | Sent as binary document — Claude reads natively (multimodal, no OCR) |
| `.eml` | Parsed first: subject + body text extracted, embedded as text in prompt |
| `.xlsx` / `.xls` | Converted to plain-text table, embedded in prompt |
| `.csv` | Read as text, embedded directly in prompt |

### Async Trigger Flow

```
User uploads file
→ Confirm step: file metadata saved, dealer recognized
→ Order status set to "processing"
→ Fire-and-forget POST to /api/orders/[orderId]/extract
→ Confirm response returned to user immediately

Background:
→ Extract API downloads file, parses it, calls Claude
→ On success: order updated with extracted_data, status → "extracted"
→ On failure (3 retries): status → "failed", error message saved

UI:
→ OrderDetailHeader shows spinner + "In Verarbeitung"
→ useOrderPolling checks every 3s
→ Status changes: spinner replaced with result preview or error message
```

### Tech Decisions

- **No background queue** — fire-and-forget HTTP call sufficient for MVP; avoids Redis/BullMQ complexity
- **Vercel function timeout** — extraction API route uses max function duration (300s on Pro); typical extraction < 30s
- **Claude model** — `claude-opus-4-6` for accuracy; `claude-sonnet-4-6` configurable as fallback
- **Polling over Realtime** — simple 3s polling; no Supabase Realtime setup needed
- **No chunking** — deferred; most dental orders < 50 positions, within Claude's context window

### New Environment Variable

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Authenticates calls to the Claude API |

### New Packages

| Package | Purpose |
|---------|---------|
| `@anthropic-ai/sdk` | Official Claude API client |
| `mailparser` | Parse .eml files (headers, body, attachments) |
| `xlsx` | Convert Excel files (.xlsx/.xls) to structured text |

### Database Migration

One new migration (`004_oph4_ai_extraction.sql`):
- Adds 4 columns to `orders` table
- Adds index on `extraction_status`

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
