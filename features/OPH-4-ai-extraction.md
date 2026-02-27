# OPH-4: KI-Datenextraktion mit Händler-Kontext (Claude API)

## Status: Planned
**Created:** 2026-02-27
**Last Updated:** 2026-02-27

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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
