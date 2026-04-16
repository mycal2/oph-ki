# Hint Structure Reference

This document defines the exact structure and patterns for generating `extraction_hints` text that gets pasted into a dealer's profile. The extraction engine (Claude) reads this text verbatim under the heading "## Dealer-Specific Extraction Hints" and treats it as authoritative instructions.

## Template

```
WICHTIG - Regeln für diesen Händler (MÜSSEN befolgt werden):

1. [KATEGORIE] - [Kurzbeschreibung der Regel]:
   [Detaillierte Erklärung]
   [Konkretes Beispiel aus dem Dokument, falls vorhanden]

2. [KATEGORIE] - [Kurzbeschreibung der Regel]:
   [Detaillierte Erklärung]
   [Konkretes Beispiel aus dem Dokument, falls vorhanden]
```

## Categories and When to Use Them

### ZEILEN FILTERN
Use when certain rows in the document are NOT real product lines and must be excluded from `line_items`.

Pattern:
```
X. ZEILEN FILTERN - Folgende Zeilen sind KEINE Produkte und MÜSSEN aus line_items AUSGESCHLOSSEN werden:
   - Zeile mit Art.Nr "[exact_value]" ([explanation what this row is])
   - Zeilen die mit "[pattern]" beginnen ([explanation])
   Nur echte Produktzeilen in line_items aufnehmen.
```

Typical cases: order headers/footers printed as rows, subtotal rows, promo/discount lines, separator rows, instruction text formatted as table rows.

### ARTIKELNUMMERN-ZUORDNUNG
Use when the mapping between article numbers and canonical fields is non-standard.

Pattern:
```
X. ARTIKELNUMMERN-ZUORDNUNG:
   - Die Spalte "[column_name]" enthält die HÄNDLER-Artikelnummer → "dealer_article_number"
   - Die HERSTELLER-Artikelnummer [location_description] → "article_number"

   Beispiel aus dem Dokument:
   [exact text from document]
   → dealer_article_number: "[value]"
   → article_number: "[value]"
   → description: "[value]"
   → quantity: [value]
```

### SPALTEN-MAPPING
Use when column headers don't match standard labels or columns are in unexpected positions.

Pattern:
```
X. SPALTEN-MAPPING:
   - Spalte "[header_text]" = [canonical_field] (z.B. article_number, quantity, description)
   - Spalte "[header_text]" = [canonical_field]
```

### MEHRZEILIGE POSITIONEN
Use when a single order line spans multiple rows in the document.

Pattern:
```
X. MEHRZEILIGE POSITIONEN:
   - Jede Bestellposition besteht aus [N] Zeilen:
     Zeile 1: [description of content]
     Zeile 2: [description of content]
   - Alle Zeilen gehören zur GLEICHEN Position.

   Beispiel:
   [exact multi-line text from document]
   → [field mapping]
```

### KUNDENNUMMER
Use when the customer number (Kundennummer) is in an unusual location or has a non-standard format.

Pattern:
```
X. KUNDENNUMMER:
   - Die Kundennummer steht [location] und hat das Format "[pattern]"
   - Beispiel: "[exact_value]"
```

### MENGEN-BEHANDLUNG
Use when quantities need special parsing (e.g., always multiply by packaging unit, handle "VPE" notation).

Pattern:
```
X. MENGEN-BEHANDLUNG:
   - [Description of special quantity logic]
   - Beispiel: "[example from document]" → quantity: [resulting_value]
```

### BESTELLDATEN
Use when order number, date, or reference information is in an unusual location.

Pattern:
```
X. BESTELLDATEN:
   - Die Bestellnummer steht [location] (z.B. "[example]")
   - Das Bestelldatum steht [location] im Format [format]
```

### BESONDERHEITEN
Catch-all for any other dealer-specific behavior that doesn't fit the above categories.

Pattern:
```
X. BESONDERHEITEN:
   - [Description of special behavior]
```

## Writing Principles

1. **Use the canonical field names in quotes** — always reference `"article_number"`, `"dealer_article_number"`, `"quantity"`, etc. so the extraction engine knows exactly which JSON field you mean.

2. **Include real examples** — the extraction engine performs dramatically better when it can see the exact text pattern it will encounter. Always include at least one concrete example per rule when a document is available.

3. **Be explicit about exclusions** — when filtering rows, list every specific pattern to exclude. Don't say "skip non-product rows" — say exactly which Art.Nr values or text patterns to skip.

4. **Use arrows (→) for field mappings** — this visual notation clearly shows "this value goes into that field."

5. **German language** — write hints in German because the platform, its users, and most order documents operate in a German-language context. Technical field names (the JSON field names) stay in English.

6. **Stay under 5,000 characters** — the field has a hard limit. Focus on what's truly different. Don't restate default extraction behavior.

7. **Number all rules** — makes it easy for the extraction engine to reference and follow them systematically.

8. **One concept per rule** — don't combine row filtering and article number mapping into a single rule. Keep them separate for clarity.

## Anti-Patterns (What NOT to Do)

- Don't write vague hints like "Be careful with this dealer's format" — this gives the extraction engine nothing actionable.
- Don't include XML-style tags (`<system>`, `<instruction>`, etc.) — they get stripped by the sanitizer.
- Don't repeat default extraction rules (e.g., "extract quantities as numbers") — waste of the 5,000 char budget.
- Don't use conditional logic ("if column A exists, then...") — be definitive about what the format looks like.
- Don't reference row numbers ("skip row 1") — the extraction engine doesn't have stable row indices. Reference content patterns instead.
