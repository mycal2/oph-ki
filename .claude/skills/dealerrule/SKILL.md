---
name: dealerrule
description: Generate structured extraction hints for dealer profiles and create dealer documentation. Use this skill whenever the user wants to create, update, or improve dealer extraction hints (the text that goes into the extraction_hints field on a dealer profile), or when the user wants to document a dealer's order format specifics. Trigger when the user mentions dealer hints, dealer rules, extraction rules for a dealer, dealer-specific extraction, or wants to analyze a dealer's order documents to understand their format. Also trigger when the user says things like "this dealer has a special format", "orders from X look different", or "I need to set up hints for dealer Y".
argument-hint: [dealer-name and description of the problem, optionally attach an example order file]
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion
model: sonnet
---

# Dealer Rule Generator

## Role
You are an expert at analyzing dental product order documents and creating precise, structured extraction hints that guide Claude's AI extraction engine. You understand the canonical JSON schema used by the Order Intelligence Platform and know how to write hints that the extraction engine reliably follows.

## Before Starting
1. Read `features/INDEX.md` to understand current project state
2. Read the dealer hint template: `.claude/skills/dealerrule/references/hint-structure.md`
3. Read the documentation template: `hints/TEMPLATE.md`

## Context: How Hints Work

The `extraction_hints` field on a dealer profile is injected directly into Claude's extraction prompt under the heading "## Dealer-Specific Extraction Hints". Rule #16 in the extraction system prompt tells Claude:

> Dealer hints override default extraction behavior. For example, if hints say to skip certain lines, those lines MUST NOT appear in line_items.

This means hints are **authoritative** — they override the default extraction rules. That's powerful but also means poorly written hints can break extraction. The goal is to write hints that are clear, unambiguous, and use concrete examples from real order documents.

### The Canonical JSON Schema Fields (for reference in hints)

When writing hints, these are the fields the extraction engine maps to:

- `article_number` — the manufacturer's article number (Herstellerartikelnummer / Lief.Art.Nr.)
- `dealer_article_number` — the dealer's own article number (if separate from manufacturer's)
- `description` — product description text
- `quantity` — order quantity (number)
- `unit` — unit of measure (German standard: Stueck, Packung, Karton, etc.)
- `unit_price` — price per unit
- `total_price` — line total
- `order_number` — the order/PO number
- `customer_number` — the manufacturer's customer ID for the ordering dealer (Kundennummer)
- `order_date` — order date
- `sender.*` — sender/ordering company information
- `delivery_address.*` — delivery address fields
- `notes` — additional notes

### Max Length
The `extraction_hints` field has a **5,000 character limit** and is sanitized (XML-style tags are stripped). Keep hints concise but complete.

---

## Workflow

### Step 1: Gather Information

You need three things from the user:

1. **Dealer name** — which dealer is this for?
2. **Problem description** — free-form text explaining what's special about this dealer's orders
3. **Example order file** — a PDF, Excel, CSV, or EML file showing a real order from this dealer

**If the user did NOT attach an example order file, you MUST ask for one before proceeding.** Example documents are essential for generating accurate hints — without seeing the actual format, you'd be guessing at column names, row patterns, and article number formats. Say something like:

> "To generate a reliable extraction hint, I need to see a real order from this dealer. Could you attach an example order file (PDF, Excel, CSV, or EML)? This lets me identify the exact column headers, row patterns, and article number formats — so the hint will work on the first try instead of needing corrections later."

Only proceed without a document if the user explicitly says they don't have one available. In that case, make the hint more conservative (fewer concrete examples, more pattern-based rules) and flag in the documentation that the hint was generated without a sample document and should be verified with the first real order.

### Step 2: Analyze the Example Document (if provided)

If the user attached an example order file, analyze it thoroughly:

**For PDF files:**
- Read the file and examine the visual structure
- Identify column headers, row patterns, header/footer rows
- Look for article number patterns (manufacturer vs. dealer)
- Note any non-product rows (order headers, footers, promo lines, subtotals)
- Find where customer numbers, order numbers, dates appear

**For Excel/CSV files:**
- Read the file using appropriate tools
- Examine column headers and data patterns
- Identify which columns map to which canonical fields
- Look for rows that should be excluded (headers, totals, notes)

**For EML files:**
- Parse the email structure
- Examine both the email body and any attachments
- Note if order data is in the email body, attachments, or both

Cross-reference your findings with the user's problem description. Confirm your understanding before generating the hint.

### Step 3: Generate the Extraction Hint

Build the hint text following this structure (read `references/hint-structure.md` for the detailed template):

```
WICHTIG - Regeln für diesen Händler (MÜSSEN befolgt werden):

1. [CATEGORY]: [Rule description]
   [Concrete example from the document if available]

2. [CATEGORY]: [Rule description]
   [Concrete example from the document if available]

...
```

**Principles for good hints:**

- **Be specific, not vague.** "Skip rows with Art.Nr 95.001" is better than "Skip header rows."
- **Use real examples** from the analyzed document. Show the exact text/pattern Claude will encounter.
- **Use the canonical field names** (article_number, dealer_article_number, etc.) so there's no ambiguity about which JSON field to populate.
- **Number the rules** for clarity and easy reference.
- **Use German** for the hint text (the extraction engine and users work in German context).
- **Include both the rule and the WHY** — e.g., "Zeile mit Art.Nr '95.001' ist der Bestellkopf, KEIN Produkt."
- **Keep it under 5,000 characters.** Focus on what's truly different about this dealer. Don't repeat what the extraction engine already does well by default.
- **Use category prefixes** to group related rules: ZEILEN FILTERN, ARTIKELNUMMERN-ZUORDNUNG, SPALTEN-MAPPING, KUNDENNUMMER, BESONDERHEITEN, etc.

### Step 4: Present the Hint for Review

Show the generated hint text to the user and ask for confirmation:

> "Here's the extraction hint I've generated for [Dealer Name]. Please review it — I'll explain each rule:"
>
> [Show the hint text]
> [Brief explanation of each rule in plain language]
>
> "Should I adjust anything before we finalize?"

### Step 5: Create the Dealer Documentation

After the user approves the hint, create a documentation file in `hints/[dealer-name-slug].md` using the template from `hints/TEMPLATE.md`.

The documentation file serves as a permanent reference for the team — it captures not just the hint text but also the reasoning, examples, and context that went into creating it.

### Step 6: Summary & Next Steps

After creating both deliverables, present:

1. **The hint text** — ready to copy-paste into the dealer's `extraction_hints` field in the admin UI
2. **The documentation file** — path to the created file in `hints/`
3. **Suggest next steps:**
   - "Copy the hint text into the dealer profile at Admin → Händler-Verwaltung → [Dealer Name] → Profil → Extraktions-Hints"
   - "Test the extraction with a real order from this dealer to verify the hints work correctly"
   - If column mappings would also help: "Consider also setting up column mappings (OPH-15) for this dealer for additional precision"
   - If data transformations are needed: "Consider adding article number mappings (OPH-14) for deterministic post-extraction corrections"

---

## Rule Categories Reference

Use these category labels when structuring hints:

| Category | German Label | Use When |
|----------|-------------|----------|
| Row filtering | ZEILEN FILTERN | Certain rows must be excluded (headers, footers, promos, subtotals) |
| Article number mapping | ARTIKELNUMMERN-ZUORDNUNG | Manufacturer vs. dealer article numbers need special handling |
| Column mapping | SPALTEN-MAPPING | Columns don't follow standard labeling |
| Customer number | KUNDENNUMMER | Customer number is in an unusual location or format |
| Quantity handling | MENGEN-BEHANDLUNG | Quantities need special parsing (e.g., packaged units, multipliers) |
| Multi-line items | MEHRZEILIGE POSITIONEN | Product info spans multiple rows (like VREF: patterns) |
| Special fields | BESONDERHEITEN | Any other dealer-specific behavior |
| Order metadata | BESTELLDATEN | Order number, date, or reference in unusual locations |

---

## Example: Complete Hint Generation

**User input:** "The manufacturer article number is behind VREF: in every order line. The first column article is the dealer article number. Row with 95.001 is the header, 95.002 is the footer, and 'T' is a promo line."

**Generated hint:**

```
WICHTIG - Regeln für diesen Händler (MÜSSEN befolgt werden):

1. ZEILEN FILTERN - Folgende Zeilen sind KEINE Produkte und MÜSSEN aus line_items AUSGESCHLOSSEN werden:
   - Zeile mit Art.Nr "95.001" (Bestellkopf: "Veuillez Nous Livrer La Commande Suivante")
   - Zeile mit Art.Nr "T" (Promo-Hinweis)
   - Zeile mit Art.Nr "95.002" (Bestellfuß: "Merci De Nous Livrer Au Plus Vite")
   Nur echte Produktzeilen (z.B. 142.xxx) in line_items aufnehmen.

2. ARTIKELNUMMERN-ZUORDNUNG:
   - Die Spalte "Article" / "Art.Nr" enthält die HÄNDLER-Artikelnummer → "dealer_article_number"
   - Die HERSTELLER-Artikelnummer steht in der nächsten Zeile nach "VREF:" → "article_number"

   Beispiel aus dem Dokument:
   142.1EM4122765  Vita Enamic Universal, 2M2-Ht, Em-14, 5 Pcs.  2
   VREF:EN1EM4122765
   → dealer_article_number: "142.1EM4122765"
   → article_number: "EN1EM4122765"
   → description: "Vita Enamic Universal, 2M2-Ht, Em-14, 5 Pcs."
   → quantity: 2

3. MEHRZEILIGE POSITIONEN:
   - Jede Bestellposition besteht aus ZWEI Zeilen:
     Zeile 1: [Händler-Art.Nr]  [Beschreibung]  [Menge]
     Zeile 2: VREF:[Hersteller-Art.Nr]
   - Beide Zeilen gehören zur GLEICHEN Position.
```
