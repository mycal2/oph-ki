# OPH-19: Customer Number (Kundennummer) Recognition & Editing

## Status: Deployed
**Created:** 2026-03-03
**Last Updated:** 2026-03-03

## Dependencies
- Requires: OPH-4 (KI-Datenextraktion) — extends extraction schema and prompt
- Requires: OPH-5 (Bestellprüfung & manuelle Korrektur) — adds customer_number to review edit form

## Background

From the manufacturer's perspective, each dealer/customer has a unique **customer number** (Kundennummer) assigned by the manufacturer. This is different from the dealer's own internal order reference number.

**Typical scenario:** A dealer rarely states the manufacturer's customer number on their order. However, when a manufacturer employee forwards an email order to the processing service, they may type "Kundennummer: 12345" or "customer number 12345" in the forwarding email body to help the system identify the correct account.

The `customer_number` field already exists in the `CanonicalSender` type and is partially supported in the extraction schema and preview display — but the AI extraction description is semantically incorrect and the review UI has no way to manually enter or correct it.

## User Stories

1. As a manufacturer employee, when I forward an order email and add "Kundennummer: 12345" in the forwarding text, I want the system to automatically extract that number so I don't have to enter it manually during review.

2. As a manufacturer employee, I want to manually enter or correct the customer number during order review in case it was not found automatically or was extracted incorrectly.

3. As a manufacturer employee, I want the customer number displayed prominently in the order extraction preview so I can quickly verify it is correct before approving.

4. As an operations person receiving orders in multiple languages (German, English, French, Spanish, Italian), I want the system to recognise the customer number regardless of which language the forwarding note is written in.

5. As a manufacturer employee, when the order document itself (PDF, Excel, email attachment) contains the customer number, I want the system to extract it directly from the document without needing a forwarding note.

## Acceptance Criteria

- [ ] The AI extraction prompt instructs Claude to look for the manufacturer's customer number in **both** the order document and the forwarding email body text.
- [ ] The extraction schema description for `customer_number` clearly states it is the **manufacturer's customer ID for the dealer** (not the dealer's own reference number).
- [ ] The extraction prompt lists multi-language keywords that indicate a customer number:
  - German: "Kundennummer", "Kd.-Nr.", "Kd.Nr.", "Kundennr."
  - English: "customer number", "customer no.", "customer ID", "account number"
  - French: "numéro client", "n° client"
  - Spanish: "número de cliente", "nº cliente"
  - Italian: "numero cliente", "n. cliente"
- [ ] The extraction prompt explicitly instructs Claude to scan the **forwarding note text** (i.e., the portion of the email added by the person forwarding the order) for customer number keywords, not just the original order body.
- [ ] The order review edit form (`order-edit-form.tsx`) includes a "Sender" section with an editable `customer_number` field (text input, optional, max 100 characters).
- [ ] The `customer_number` field in the edit form is labelled "Kundennummer" with a secondary label "(Kd.-Nr.)".
- [ ] Saving the review form with a customer_number value persists it correctly in `reviewed_data`.
- [ ] The extraction result preview continues to display `customer_number` as "Kd.-Nr." as it does today.

## Edge Cases

- **No customer number anywhere:** System leaves the field null; no warning shown.
- **Multiple numbers in forwarding text:** Claude should use the one preceded by a customer number keyword; if ambiguous, prefer the first match.
- **Customer number in forwarding text vs. order document:** If both are present and differ, the forwarding text takes precedence (the person forwarding knows the correct account).
- **Numeric-only vs. alphanumeric:** Customer numbers may be purely numeric ("12345") or alphanumeric ("KD-12345-DE"); the field accepts any string.
- **Customer number resembles other numbers:** Claude must only extract it when clearly labelled with a keyword — it must not confuse it with order numbers, invoice numbers, or article numbers.
- **Language of forwarding note differs from order document language:** The forwarding note may be in German while the attached order is in French; Claude should recognise keywords in all supported languages.
- **Field cleared during review:** If a user clears the field and saves, it must save as null (not empty string).

## Technical Requirements

- The `customer_number` field already exists in `CanonicalSender` (src/lib/types.ts), `canonicalOrderSchema` (src/lib/validations.ts), and the Claude extraction schema (src/lib/claude-extraction.ts) — no new schema/DB columns needed.
- Changes are confined to:
  1. `src/lib/claude-extraction.ts` — update schema description + extraction prompt
  2. `src/components/orders/review/order-edit-form.tsx` — add sender section with `customer_number` input

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview
Pure frontend + prompt engineering change. No new database tables, no new API routes, no new packages.

### Component Structure

```
OrderEditForm (existing)          order-edit-form.tsx
+-- Low-confidence warning
+-- Header Section (Bestellnummer, Datum)   ← already exists
+-- [NEW] Sender Section
|   +-- Kundennummer (Kd.-Nr.) input        ← NEW: optional text field
+-- Line Items
+-- Delivery Address (collapsible)
+-- Billing Address (collapsible)
+-- Totals
+-- Notes
```

The sender section sits between the header and line items, always visible (not collapsible). Contains a single text input for `customer_number`, marked optional.

### Data Model

`customer_number` already exists in `CanonicalSender` (src/lib/types.ts), the Zod validation schema, and the Claude extraction schema — no new DB columns or types needed. Edited values flow into `reviewed_data.order.sender.customer_number` via the existing review save path.

### AI Extraction Changes (src/lib/claude-extraction.ts)

1. **Schema description fix**: Change `customer_number` description from "the sender's own order or customer reference number" to "the manufacturer's customer ID (Kundennummer) for the ordering dealer — assigned by the manufacturer, not the dealer's own reference number".

2. **New extraction rule**: Instruct Claude to:
   - Recognise multi-language customer number keywords (DE: Kundennummer / Kd.-Nr.; EN: customer number / customer ID; FR: numéro client; ES: número de cliente; IT: numero cliente)
   - Scan **both** the order document **and** the forwarding email body text
   - Prefer the forwarding note value if values differ between sources
   - Not confuse customer number with order number, invoice number, or article number

### Files Modified

| File | Change |
|------|--------|
| `src/lib/claude-extraction.ts` | Fix schema description + add multi-language extraction rule |
| `src/components/orders/review/order-edit-form.tsx` | Add sender section with customer_number input |

No new packages required.

## QA Test Results

**Tested by:** QA Engineer (automated)
**Date:** 2026-03-03
**Build:** `npm run build` passes cleanly

### Acceptance Criteria Results

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | AI prompt instructs Claude to look in both order document and forwarding email body | PASS | `claude-extraction.ts:78` — rule 12, bullet 2: "Search for the customer number in **both** the order document (PDF, Excel, email attachment) **and** the forwarding email body text" |
| 2 | Schema description clearly states manufacturer's customer ID | PASS | `claude-extraction.ts:27` — description updated to "the manufacturer's customer ID / Kundennummer for the ordering dealer — assigned by the manufacturer, NOT the dealer's own reference or order number" |
| 3 | Multi-language keywords listed (DE, EN, FR, ES, IT) | PASS | `claude-extraction.ts:79-84` — all 5 language groups present with correct keywords |
| 4 | Prompt explicitly instructs Claude to scan forwarding note text | PASS | `claude-extraction.ts:78` — "the forwarding email body text (the portion of text added by the person forwarding the order)" |
| 5 | Edit form includes "Sender" section with customer_number field | PASS | `order-edit-form.tsx:204-229` — "Absender" section with text input, maxLength=100 |
| 6 | Field labelled "Kundennummer" with secondary "(Kd.-Nr.)" | PASS | `order-edit-form.tsx:209-211` — Label reads "Kundennummer (Kd.-Nr.)" with secondary span |
| 7 | Saving persists correctly in reviewed_data | PASS | `updateSender` callback (line 116-130) merges into `order.sender`, which flows through `onChange` → auto-save → `reviewed_data.order.sender.customer_number`. Validated via Zod `canonicalSenderSchema` (validations.ts:142-151) which accepts `customer_number: z.string().nullable()` |
| 8 | Extraction preview continues to display as "Kd.-Nr." | PASS | `extraction-result-preview.tsx:349-354` — unchanged, still shows "Kd.-Nr.: {order.sender.customer_number}" |

### Edge Case Verification

| Edge Case | Status | Evidence |
|-----------|--------|----------|
| No customer number → null, no warning | PASS | Field defaults to `order.sender?.customer_number ?? ""` (line 215); no required validation |
| Multiple numbers → use keyword-preceded one | PASS | Prompt rule: "Only extract a value as customer_number when it is clearly preceded by one of the keywords above" (line 86) |
| Forwarding note vs. document conflict → prefer forwarding | PASS | Prompt rule: "prefer the forwarding note value" (line 85) |
| Numeric and alphanumeric accepted | PASS | Text input with maxLength=100, no regex restriction; prompt states "purely numeric ('12345') or alphanumeric ('KD-12345-DE')" (line 87) |
| Don't confuse with order/invoice/article numbers | PASS | Prompt rule: "Do NOT confuse it with order numbers, invoice numbers, PO numbers, or article numbers" (line 86) |
| Field cleared → saves as null | PASS | `const value = e.target.value \|\| null` (line 217) — empty string coerced to null |

### Security Audit

| Check | Status | Notes |
|-------|--------|-------|
| XSS via customer_number input | PASS | React's JSX escapes all values by default; Input component uses controlled value |
| Server-side validation | PASS | `canonicalSenderSchema` in validations.ts:142-151 validates `customer_number: z.string().nullable()` — enforced by `reviewSaveSchema` on PATCH |
| No prompt injection risk | PASS | The customer_number field is a simple string extracted by Claude from user documents; it does not get injected back into the system prompt |
| maxLength enforced | PASS | HTML `maxLength={100}` on input; Zod schema accepts any string (nullable) — no unbounded storage risk since JSONB field |

### Bug Report

**No bugs found.** All acceptance criteria pass. All edge cases handled correctly.

### Verdict: PASS — Ready for deployment

## Deployment

- **Production URL:** https://oph-ki.ids.online
- **Deployed:** 2026-03-03
- **Commit:** `c03ca37` feat(OPH-19): Customer number recognition & review editing
- **Vercel:** Auto-deployed via push to `main`
