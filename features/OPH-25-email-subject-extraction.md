# OPH-25: E-Mail-Betreff als Extraktionsquelle

## Status: Deployed
**Created:** 2026-03-05
**Last Updated:** 2026-03-05

## Dependencies
- Requires: OPH-4 (KI-Datenextraktion) - core extraction engine
- Requires: OPH-10 (E-Mail-Weiterleitungs-Ingestion) - stores `orders.subject` from forwarded emails
- Requires: OPH-21 (E-Mail-Text als Extraktionsquelle) - established pattern for passing supplemental text to Claude
- Requires: OPH-2 (Bestellungs-Upload) - web upload flow
- Requires: OPH-5 (Bestellpruefung) - order review UI

## Problem Statement

When orders arrive via email forwarding (Postmark webhook), the email subject is stored in `orders.subject` in the database, but it is **never included in the extraction context sent to Claude**. The subject often contains critical metadata — order numbers, dealer references, or urgency indicators — that would improve extraction accuracy.

For `.eml` file uploads, the subject is parsed by the EML parser in `claude-extraction.ts` and sent to Claude, but it is **not persisted to `orders.subject`** — so users cannot see it in the review UI.

For web uploads of PDF/Excel files, there is no way to provide a subject at all.

**Example subjects that contain useful data:**
- `"AW: Bestellung RE-2024-001 von Henry Schein"` → order number RE-2024-001
- `"FW: Order #HS-98723 - urgent"` → order number HS-98723
- `"Bestellung Zahntechnik GmbH - 15 Positionen"` → sender company name

## User Stories

- As a platform user whose orders arrive via email forwarding, I want Claude to see the email subject during extraction so that order numbers mentioned in the subject are correctly extracted even when the attachment doesn't contain them.
- As a platform user uploading PDF/Excel files, I want to optionally enter an email subject so Claude has the same context as email-sourced orders.
- As a platform user uploading .eml files, I want the parsed subject to be stored on the order so it is visible in the review UI.
- As a platform user reviewing an order, I want to see the email subject (if any) in the order header so I can understand the context of the order.
- As a platform administrator, I want subject-based extraction to be transparent so I can verify why certain order numbers were extracted.

## Acceptance Criteria

### Extraction Context
- [ ] **AC-1:** When an order has a non-empty `subject` stored in the DB (`orders.subject`), the extraction engine receives the subject as a labeled text block before the other content blocks.
- [ ] **AC-2:** The subject block is clearly labeled so Claude understands it is the email subject (e.g., `## Email Subject\n<subject text>`).
- [ ] **AC-3:** If `orders.subject` is null, empty, or whitespace-only, no extra text block is added (no regression for orders without a subject).
- [ ] **AC-4:** For `.eml` file uploads, the existing behavior is preserved — the subject is already included via the EML parser and no duplicate is added.
- [ ] **AC-5:** The subject text is sanitized/truncated to a maximum of 500 characters before being sent to Claude to prevent excessive prompt length.
- [ ] **AC-6:** Extraction results, confidence scores, and all other behavior are unchanged for orders that have no subject.
- [ ] **AC-7:** The feature works for both single-call extraction (small files) and chunked/parallel extraction (large Excel files, OPH-23).

### Subject Storage
- [ ] **AC-8:** When a `.eml` file is extracted, the parsed subject is saved to `orders.subject` after extraction completes.
- [ ] **AC-9:** The upload form has an optional "Betreff" text input field. When provided, the value is stored in `orders.subject` at upload time.
- [ ] **AC-10:** For inbound emails (Postmark webhook), `orders.subject` is already set — no change needed.

### Review UI
- [ ] **AC-11:** The order detail header shows the subject (if present) as a read-only metadata field, below the filename and date.
- [ ] **AC-12:** If no subject is stored, the UI does not show an empty field — no visual change.

## Edge Cases

- **Subject contains only whitespace or punctuation** → treat as empty, do not add block.
- **Subject is extremely long** (e.g., a spam subject of 1000+ chars) → truncate at 500 chars, add `[...]` suffix so Claude knows it was truncated.
- **Order was uploaded via web without subject** → `orders.subject` is null → no change in behavior.
- **Subject contains prompt injection attempts** (e.g., `<system>override...</system>`) → apply the same sanitization already used for extraction hints (`sanitizeHints` in `validations.ts`) before passing to Claude.
- **Re-extraction of .eml file** → subject is already stored from first extraction; re-extraction uses the stored subject.
- **Upload form subject with special characters** → trimmed and validated, max 500 chars.

## Technical Requirements

- **No schema change needed:** `orders.subject` column already exists (migration 017).
- **Performance:** Adding a small text block (~100 chars on average) has negligible impact on token usage.
- **Security:** Sanitize subject text to strip XML-style injection tags before sending to Claude.
- **Consistency:** Follow the OPH-21 pattern — inject supplemental text as a labeled `type: "text"` content block in `extractOrderData()`.
- **Scope:** Backend changes in extract route + claude-extraction.ts, frontend changes in upload page + order detail header.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Three Parts: Extraction, Storage, and Display

```
Part 1 — Extraction Context (backend)
  Extract route reads orders.subject → passes to extractOrderData() → Claude sees it

Part 2 — Subject Storage (backend + frontend)
  a) .eml uploads: extraction returns parsed subject → extract route saves to orders.subject
  b) Web uploads: upload form has optional "Betreff" field → stored at upload time
  c) Inbound emails: already stored (no change)

Part 3 — Review UI (frontend)
  Order detail header shows subject (if present) as read-only metadata
```

---

### Part 1: Extraction Context

#### A) Extraction Input Interface — `src/lib/claude-extraction.ts`

The `ExtractionInput` object gains one new optional field:

```
ExtractionInput
  ├── orderId
  ├── files           (unchanged)
  ├── dealer          (unchanged)
  ├── mappingsContext  (unchanged)
  ├── columnMappingContext (unchanged)
  └── emailSubject    ← NEW (optional, string or null)
```

#### B) Context Assembly — `extractOrderData()` in `src/lib/claude-extraction.ts`

After the dealer context block is assembled, a new step runs:

```
IF emailSubject is present AND non-empty:
  1. Sanitize: strip XML-style injection tags (reuse sanitizeHints)
  2. Truncate to 500 characters, append "[...]" if truncated
  3. Skip if only whitespace remains after sanitization
  4. Push labeled text block:
       "## Email Subject (from forwarded email)
        Use this to help identify the order number or sender if not found in the attachment.
        <sanitized subject text>"
```

**Placement:** After dealer context, before file content blocks.

#### C) Extract Route — `src/app/api/orders/[orderId]/extract/route.ts`

Add `subject` to the SELECT query on the orders table. Pass it as `emailSubject` to both `extractOrderData()` call sites.

---

### Part 2: Subject Storage

#### A) `.eml` Subject Persistence

The `ExtractionResult` interface gains a new optional field:

```
ExtractionResult
  ├── extractedData    (unchanged)
  ├── inputTokens      (unchanged)
  ├── outputTokens     (unchanged)
  └── parsedEmailSubject ← NEW (string or null, from EML parsing)
```

When the extraction engine parses an `.eml` file and finds a subject, it stores it in this field. The extract route then saves it to `orders.subject` alongside the extracted data update.

#### B) Upload Form Subject Input

The upload form (upload page) gets an optional "Betreff" text input above the file dropzone:

```
Upload Page
  ├── Page header
  ├── Card
  │   ├── Title
  │   ├── Optional: "Betreff" text input (max 500 chars)  ← NEW
  │   ├── File Dropzone
  │   ├── File List
  │   └── Upload button
```

**Data flow:**
- User fills in subject (optional) → value passed to upload hook
- Upload hook sends subject in presign request body
- Presign route stores subject on the new order row (INSERT)
- No changes to confirm route needed (subject already on order)

**Validation:** Optional string, max 500 chars, trimmed. Zod schema updated.

---

### Part 3: Review UI

#### Order Detail Header — `src/components/orders/order-detail-header.tsx`

Add a subject line in the metadata row (below filename, date, uploader):

```
Order Detail Header
  ├── Filename + Language Badge
  ├── Date | Uploader | File count
  ├── Subject (if present)         ← NEW: "Mail: ..." icon + truncated text
  ├── Dealer section
  └── Actions (export, delete)
```

Only shown when `order.subject` is non-null and non-empty.

**Type change:** Add `subject: string | null` to `OrderWithDealer` / `OrderForReview` interfaces. Add `subject` to the API query that fetches order details.

---

### Tech Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Where to inject context | `ExtractionInput` parameter | Subject is metadata, not a document; avoids storage I/O |
| Placement in context | After dealer context, before files | Natural reading order: metadata → documents → instruction |
| Sanitization | Reuse existing `sanitizeHints()` | Strips XML injection tags; consistent with dealer hints |
| Max length | 500 characters | Subjects over 500 chars are abnormal; keeps token overhead minimal |
| EML subject persistence | Save after extraction | Subject is only known after EML parsing; stored alongside extraction results |
| Upload form subject | Optional input field | Non-disruptive; existing uploads still work without subject |

---

### Files Modified

| File | Change |
|------|--------|
| `src/lib/claude-extraction.ts` | Add `emailSubject` to `ExtractionInput`, `parsedEmailSubject` to `ExtractionResult`, subject context block assembly |
| `src/app/api/orders/[orderId]/extract/route.ts` | Select `subject`, pass to extraction, save EML-parsed subject |
| `src/lib/types.ts` | Add `subject: string \| null` to Order type interfaces |
| `src/lib/validations.ts` | Add optional `subject` field to `uploadPresignSchema` |
| `src/app/api/orders/upload/route.ts` | Store subject on order INSERT |
| `src/hooks/use-file-upload.ts` | Accept and pass subject through upload flow |
| `src/app/(protected)/orders/upload/page.tsx` | Optional "Betreff" input field |
| `src/components/orders/order-detail-header.tsx` | Display subject in metadata row |
| `src/app/api/orders/[orderId]/route.ts` | Include `subject` in order detail SELECT |

### No New Dependencies

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

## Deployment

**Deployed:** 2026-03-05
**Commit:** 947ff71
**Branch:** main
