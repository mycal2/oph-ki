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

- **Schema change:** Added `orders.subject` column (migration 023).
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

**Tested:** 2026-03-05
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Build Status:** PASS (production build compiles without errors)

### Acceptance Criteria Status

#### AC-1: Subject passed to extraction engine as labeled text block
- [x] Extract route reads `orders.subject` from DB (line 118 of extract/route.ts selects `subject` column)
- [x] Subject passed as `emailSubject` parameter to `extractOrderData()` (line 302)
- [x] Re-extraction path also passes `emailSubject: orderSubject` (line 468)

#### AC-2: Subject block is clearly labeled for Claude
- [x] Block format: `## Email Subject (from forwarded email)\nUse this to help identify the order number or sender if not found in the attachment.\n<subject text>` (claude-extraction.ts lines 212-214)

#### AC-3: Null/empty/whitespace-only subject produces no extra block
- [x] Guard checks `input.emailSubject && input.emailSubject.trim().length > 0` plus alphanumeric regex test (lines 202-204)
- [x] Second guard after sanitization checks `subjectText.trim().length > 0` and alphanumeric regex again (line 207)

#### AC-4: .eml uploads - no duplicate subject block
- [x] `hasEmlFile` check prevents adding the subject context block when any file ends with `.eml` (lines 200, 205)
- [x] EML parser already includes subject in its own text block (lines 246-248)

#### AC-5: Subject truncated to max 500 characters
- [x] Truncation logic: `if (subjectText.length > 500) { subjectText = subjectText.slice(0, 500) + "[...]"; }` (lines 209-211)
- [x] Zod schema enforces `.max(500)` on upload presign input (validations.ts line 85)
- [x] EML-parsed subject also truncated to 500 chars before DB persistence (extract/route.ts line 500)

#### AC-6: No behavioral change for orders without subject
- [x] All subject logic is conditional on non-null, non-empty subject
- [x] `emailSubject` is optional in `ExtractionInput` interface (line 147)
- [x] Build compiles cleanly -- no regressions introduced

#### AC-7: Works for both single-call and chunked extraction
- [x] Subject block is added to `contentBlocks` before file processing (lines 205-217)
- [x] For chunked extraction, `baseContentBlocks: [...contentBlocks]` snapshots current blocks including subject (line 292)
- [x] Each chunk receives the subject context via `baseContentBlocks` spread (line 559)

#### AC-8: .eml subject saved to orders.subject after extraction
- [x] `parsedEmailSubject` captured from EML parser (lines 243-245)
- [x] Returned in `ExtractionResult` (line 419)
- [x] Extract route saves to DB: `if (!orderSubject && result.parsedEmailSubject) { emlSubjectUpdate.subject = ... }` (lines 498-501)
- [x] Spread into the `.update()` call (line 513)

#### AC-9: Upload form has optional "Betreff" input, stored at upload time
- [x] Upload page has `<Input>` with id="upload-subject", placeholder, maxLength=500 (upload/page.tsx lines 159-167)
- [x] Label says "Betreff (optional)" (line 157)
- [x] `useFileUpload` hook manages `subject` state (use-file-upload.ts line 49)
- [x] Subject sent in presign request body (line 160 of hook)
- [x] Presign route stores subject on order INSERT (upload/route.ts lines 156-163)
- [x] Zod validation: optional string, max 500, trimmed (validations.ts lines 83-87)

#### AC-10: Postmark inbound emails -- no change needed
- [x] Confirmed: no changes to Postmark webhook route. `orders.subject` already set by inbound email flow.

#### AC-11: Order detail header shows subject as read-only metadata
- [x] Subject displayed with Mail icon, `line-clamp-2` for overflow (order-detail-header.tsx lines 165-170)
- [x] Conditional render: `{order.subject && (...)}`

#### AC-12: No subject = no empty field in UI
- [x] Guard `{order.subject && (...)}` ensures nothing renders when subject is null/empty (line 165)

### Edge Cases Status

#### EC-1: Subject contains only whitespace or punctuation
- [x] Regex check `/[a-zA-Z0-9\u00C0-\u024F]/` rejects subjects with only whitespace or punctuation (line 204)

#### EC-2: Subject extremely long (1000+ chars)
- [x] Zod schema limits upload input to 500 chars (validations.ts line 85)
- [x] Extraction engine truncates to 500 chars with `[...]` suffix (claude-extraction.ts lines 209-211)
- [x] EML subject persistence also truncated: `.slice(0, 500)` (extract/route.ts line 500)

#### EC-3: Order uploaded via web without subject
- [x] Subject is optional in Zod schema; not sent when empty (use-file-upload.ts line 160 conditional spread)
- [x] No subject block added when `emailSubject` is null/empty

#### EC-4: Subject contains prompt injection attempts
- [x] `sanitizeHints()` strips `<system>`, `<instructions>`, `<human>`, `<assistant>`, `<tool_use>`, `<tool_result>`, `<thinking>`, and `<|...|>` tags (validations.ts lines 284-293)
- [x] Applied before truncation (claude-extraction.ts line 206)
- [x] Post-sanitization check ensures substantive content remains (line 207)

#### EC-5: Re-extraction of .eml file
- [x] On re-extraction, subject is already stored in DB from first extraction
- [x] `orderSubject` is read from DB (extract/route.ts line 292), but for .eml files, the `hasEmlFile` guard prevents double-injection

#### EC-6: Upload form subject with special characters
- [x] Zod `.trim()` handles leading/trailing whitespace
- [x] No HTML/script injection risk: stored as text, rendered by React (auto-escaped)

### Security Audit Results

#### Authentication & Authorization
- [x] Upload presign route (`/api/orders/upload`) verifies Supabase auth before processing
- [x] Extract route has dual auth (internal secret + user auth)
- [x] Order detail GET route verifies tenant scoping
- [x] Subject field cannot be set by unauthenticated users

#### Input Validation & Injection
- [x] Subject validated by Zod schema server-side (max 500 chars, trimmed)
- [x] Prompt injection mitigated via `sanitizeHints()` before sending to Claude
- [x] XSS prevention: React auto-escapes when rendering `{order.subject}` in JSX
- [x] SQL injection: Supabase parameterized queries used for all DB operations

#### Data Exposure
- [x] Subject not exposed in any public API (all routes require authentication)
- [x] No `NEXT_PUBLIC_` env vars added by this feature
- [x] Subject not included in trial preview public endpoint (verified: OrderPreviewData type does not include subject)

#### Rate Limiting
- [x] Upload route has IP-based rate limiting (50 requests per 15 minutes)
- [x] Extract route has per-order extraction attempt limit (max 5)

#### Prompt Injection Deep Dive (Red Team)
- [x] Tested sanitization regex covers common Claude prompt injection vectors
- [ ] **FINDING (Low):** `sanitizeHints()` does not strip `<|im_start|>` / `<|im_end|>` style tokens (OpenAI format), though these are unlikely to affect Claude. The existing `<\|[^|]*\|>` regex should catch `<|...|>` patterns -- verified, this IS covered.
- [x] All prompt injection vectors adequately covered for Claude-specific attacks

### Cross-Browser Compatibility (Code Review)

#### Upload Page Subject Input
- [x] Uses standard shadcn/ui `<Input>` component with `maxLength={500}` -- standard HTML attribute supported across all browsers
- [x] `<Label>` with `htmlFor` correctly associated

#### Order Detail Header Subject Display
- [x] Uses standard CSS `line-clamp-2` via Tailwind -- supported in Chrome, Firefox, Safari (modern versions)
- [x] `flex items-start` layout is cross-browser compatible

### Responsive Design (Code Review)

#### Upload Page (375px / 768px / 1440px)
- [x] Subject input is full-width within card content area (inherits responsive layout)
- [x] No fixed widths that could break on mobile

#### Order Detail Header (375px / 768px / 1440px)
- [x] Subject line uses `flex items-start` with `shrink-0` on icon -- text wraps naturally
- [x] `line-clamp-2` prevents long subjects from breaking layout on narrow viewports

### Regression Check

#### OPH-4 (AI Extraction)
- [x] `ExtractionInput` interface is backward-compatible (new field is optional)
- [x] `ExtractionResult` interface is backward-compatible (new field is optional)
- [x] No changes to system prompt or JSON schema

#### OPH-21 (Email Body Extraction)
- [x] Email body text block still added separately (lines 318-329 of claude-extraction.ts)
- [x] Subject block placement (after dealer context, before files) does not conflict

#### OPH-23 (Chunked Extraction)
- [x] Chunked path receives subject via `baseContentBlocks` snapshot
- [x] `parsedEmailSubject: null` returned for Excel chunked path (correct -- no EML in chunked)

#### OPH-2 (Upload Flow)
- [x] `clearFiles()` also resets subject state (use-file-upload.ts line 292)
- [x] Existing upload flow unchanged when subject is not provided
- [x] Build passes -- no TypeScript errors in modified files

### Bugs Found

No bugs found. The implementation is clean and comprehensive.

### Summary
- **Acceptance Criteria:** 12/12 passed
- **Edge Cases:** 6/6 passed
- **Bugs Found:** 0 total (0 critical, 0 high, 0 medium, 0 low)
- **Security:** Pass -- prompt injection mitigated, auth enforced, input validated
- **Build:** Pass -- production build compiles without errors
- **Production Ready:** YES
- **Recommendation:** Deploy -- feature is complete and well-implemented

## Deployment
_To be added by /deploy_

## Deployment

**Deployed:** 2026-03-05
**Commit:** 947ff71
**Branch:** main
