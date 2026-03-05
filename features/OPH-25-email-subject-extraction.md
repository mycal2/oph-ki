# OPH-25: E-Mail-Betreff als Extraktionsquelle

## Status: Planned
**Created:** 2026-03-05
**Last Updated:** 2026-03-05

## Dependencies
- Requires: OPH-4 (KI-Datenextraktion) - core extraction engine
- Requires: OPH-10 (E-Mail-Weiterleitungs-Ingestion) - stores `orders.subject` from forwarded emails
- Requires: OPH-21 (E-Mail-Text als Extraktionsquelle) - established pattern for passing supplemental text to Claude

## Problem Statement

When orders arrive via email forwarding (Postmark webhook), the email subject is stored in `orders.subject` in the database, but it is **never included in the extraction context sent to Claude**. The subject often contains critical metadata — order numbers, dealer references, or urgency indicators — that would improve extraction accuracy.

For `.eml` file uploads, the subject is already included (handled by the EML parser in `claude-extraction.ts`). The gap is specifically for **inbound forwarded emails**.

**Example subjects that contain useful data:**
- `"AW: Bestellung RE-2024-001 von Henry Schein"` → order number RE-2024-001
- `"FW: Order #HS-98723 - urgent"` → order number HS-98723
- `"Bestellung Zahntechnik GmbH - 15 Positionen"` → sender company name

## User Stories

- As a platform user whose orders arrive via email forwarding, I want Claude to see the email subject during extraction so that order numbers mentioned in the subject are correctly extracted even when the attachment doesn't contain them.
- As a platform user, I want the subject line to supplement (not replace) the attachment content so that extraction is more complete when information is split across subject and body.
- As a platform administrator, I want subject-based extraction to be transparent so I can verify why certain order numbers were extracted.
- As a developer, I want the subject handling to follow the same pattern as OPH-21 (email body) so the codebase remains consistent.

## Acceptance Criteria

- [ ] **AC-1:** When an order has a non-empty `subject` stored in the DB (`orders.subject`), the extraction engine receives the subject as a labeled text block before the other content blocks.
- [ ] **AC-2:** The subject block is clearly labeled so Claude understands it is the email subject (e.g., `## Email Subject\n<subject text>`).
- [ ] **AC-3:** If `orders.subject` is null, empty, or whitespace-only, no extra text block is added (no regression for orders without a subject).
- [ ] **AC-4:** For `.eml` file uploads, the existing behavior is preserved — the subject is already included via the EML parser and no duplicate is added.
- [ ] **AC-5:** The subject text is sanitized/truncated to a maximum of 500 characters before being sent to Claude to prevent excessive prompt length.
- [ ] **AC-6:** Extraction results, confidence scores, and all other behavior are unchanged for orders that have no subject.
- [ ] **AC-7:** The feature works for both single-call extraction (small files) and chunked/parallel extraction (large Excel files, OPH-23).

## Edge Cases

- **Subject contains only whitespace or punctuation** → treat as empty, do not add block.
- **Subject is extremely long** (e.g., a spam subject of 1000+ chars) → truncate at 500 chars, add `[...]` suffix so Claude knows it was truncated.
- **Order was uploaded via web (not email forwarding)** → `orders.subject` is null → no change in behavior.
- **Subject contains prompt injection attempts** (e.g., `<system>override...</system>`) → apply the same sanitization already used for extraction hints (`sanitizeHints` in `validations.ts`) before passing to Claude.
- **Re-extraction after manual subject edit** → not applicable; subject is read-only from the DB at extraction time.

## Technical Requirements

- **No schema change needed:** `orders.subject` column already exists.
- **Performance:** Adding a small text block (~100 chars on average) has negligible impact on token usage.
- **Security:** Sanitize subject text to strip XML-style injection tags before sending to Claude.
- **Consistency:** Follow the OPH-21 pattern — inject supplemental text as a labeled `type: "text"` content block in `extractOrderData()`.
- **Scope:** Backend-only change in `src/app/api/orders/[orderId]/extract/route.ts` and `src/lib/claude-extraction.ts`. No UI changes required.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### No UI changes — backend only

This feature is a pure backend enhancement. No new pages, no new components, no database migrations.

---

### How the Data Flows Today (Gap)

```
Postmark Webhook
  → stores email subject in orders.subject (DB column, already exists)

Extract Route
  → reads order row (but NOT orders.subject — gap!)
  → calls extractOrderData({ files, dealer, ... })
    → builds Claude context: [Dealer Context] + [Files] + [Extraction Instruction]
    → Claude never sees the subject
```

### How the Data Will Flow After OPH-25

```
Extract Route
  → reads order row INCLUDING orders.subject
  → calls extractOrderData({ files, dealer, emailSubject, ... })
    → builds Claude context:
        [Dealer Context]
        [Email Subject]     ← NEW: only if subject is present
        [Files]
        [Extraction Instruction]
    → Claude can now use subject to find order numbers, sender info, etc.
```

---

### Components Changed

#### A) Extraction Input Interface — `src/lib/claude-extraction.ts`

The `ExtractionInput` object that controls what Claude receives gains one new optional field:

```
ExtractionInput
  ├── orderId
  ├── files           (unchanged)
  ├── dealer          (unchanged)
  ├── mappingsContext (unchanged)
  ├── columnMappingContext (unchanged)
  └── emailSubject    ← NEW (optional, string or null)
```

**Why add it to `ExtractionInput` rather than as a synthetic file?**
The email body (OPH-21) is stored as a real file in cloud storage because it can be large and may contain multi-paragraph text. The subject is a single line of metadata — it belongs in the input parameters alongside dealer context, not as a synthetic file. This also means zero storage I/O.

#### B) Context Assembly — `extractOrderData()` in `src/lib/claude-extraction.ts`

After the dealer context block is assembled, a new step runs:

```
IF emailSubject is present AND non-empty:
  1. Sanitize: strip XML-style injection tags (same function used for dealer hints)
  2. Truncate to 500 characters, append "[...]" if truncated
  3. Skip if only whitespace remains after sanitization
  4. Push labeled text block:
       "## Email Subject (from forwarded email)
        Use this to help identify the order number or sender if not found in the attachment.
        <sanitized subject text>"
```

**Placement:** Subject block goes immediately after dealer context and before file content blocks. This mirrors how Claude naturally reads context — metadata first, then documents.

#### C) Extract Route — `src/app/api/orders/[orderId]/extract/route.ts`

The route already queries the `orders` table to fetch the order row. One small addition:

```
BEFORE: .select("id, tenant_id, status, extraction_status, extraction_attempts, dealer_id, recognition_confidence")
AFTER:  .select("id, tenant_id, status, extraction_status, extraction_attempts, dealer_id, recognition_confidence, subject")
```

The retrieved `subject` value is then passed as `emailSubject` into both `extractOrderData()` call sites (single-call extraction and retry path).

---

### Data Model

No schema changes. The relevant DB column already exists:

```
orders table
  subject: text | null   ← already set by Postmark webhook (OPH-10)
                            null for web-uploaded orders
```

---

### Tech Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Where to inject | `ExtractionInput` parameter | Subject is metadata, not a document; avoids storage I/O |
| Placement in context | After dealer context, before files | Natural reading order: metadata → documents → instruction |
| Sanitization | Reuse existing `sanitizeHints()` | Strips XML injection tags; consistent with dealer hints |
| Max length | 500 characters | Subjects over 500 chars are abnormal; keeps token overhead minimal |
| Deduplication | None needed | Web uploads never set `orders.subject`; `.eml` subjects come from file parser |

---

### No New Dependencies

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
