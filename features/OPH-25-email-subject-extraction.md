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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
