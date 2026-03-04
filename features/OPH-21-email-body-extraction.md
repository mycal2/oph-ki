# OPH-21: E-Mail-Text als Extraktionsquelle

## Status: Planned
**Created:** 2026-03-04
**Last Updated:** 2026-03-04

## Dependencies
- Requires: OPH-2 (Bestellungs-Upload) — order file storage model
- Requires: OPH-3 (Händler-Erkennung) — dealer matching logic
- Requires: OPH-4 (KI-Datenextraktion) — Claude extraction pipeline
- Requires: OPH-10 (E-Mail-Weiterleitungs-Ingestion) — Postmark ingest route

## Problem Statement

Orders sometimes arrive as:
1. **Text-only emails** — no attachments, the entire order is written in the email body
2. **Mixed emails** — a PDF/Excel attachment is the main document, but the sender adds extra info in the email body (e.g. "please also add 3x Article #456, urgent delivery")

Currently:
- Text-only emails via Postmark already work (body is saved as `email_body.txt`)
- **Mixed emails are broken**: when Postmark delivers an email with attachments, the email body text is discarded — supplemental info in the body is lost
- The original email body is never surfaced in the order detail UI (only the extracted result is shown)
- Dealer matching from body text is not implemented as a fallback

---

## User Stories

- As a tenant employee, when a dealer sends a plain-text email order with no attachments, the system correctly extracts all order line items from the email body text, so I don't have to enter them manually.
- As a tenant employee, when an email arrives with a PDF attachment AND additional info in the body text (e.g. "add 2x article 1234"), the system includes both sources in the extraction, so nothing is missed.
- As a tenant employee reviewing an order, I want to see the original email body text in the order detail, so I can verify what was written and compare it against the extracted data.
- As a tenant employee, when an email order cannot match a dealer by email address alone, the system scans the body text for known dealer names, so the order is still attributed to the right dealer automatically.

---

## Acceptance Criteria

### Scenario A: Text-Only Email (No Attachments)
- [ ] When a Postmark email arrives with no supported attachments and a non-empty text body, the body is saved as `email_body.txt` in `order_files` *(already implemented — verify and document)*
- [ ] Extraction runs successfully using only the `email_body.txt` content as Claude's input
- [ ] The extracted order contains line items, quantities, and units found in the body text

### Scenario B: Mixed Email (Attachment + Body Text)
- [ ] When a Postmark email arrives with one or more supported attachments AND a non-empty text body (>50 characters after trimming), the email body text is ALSO saved as `email_body.txt` in `order_files` alongside the attachments
- [ ] During extraction, Claude receives BOTH the attachment content AND the email body text as separate content blocks
- [ ] Information from the body text supplements (or, if conflicting, Claude resolves) data from the attachment

### Scenario C: Dealer Recognition from Body Text
- [ ] When no dealer is matched by sender email address, the system scans the email body text for names of known dealers (case-insensitive substring match against all dealer names in DB)
- [ ] The first matching dealer name found in the body is used, with recognition method `body_text_match`
- [ ] If no dealer is found in body text either, the order proceeds with `recognition_method: unrecognized` as before

### Scenario D: Email Body Visible in Order Detail
- [ ] The order detail page shows a collapsible "Original E-Mail" section when email body text exists for the order
- [ ] The section is collapsed by default and can be expanded with one click
- [ ] The body text is displayed read-only in a monospace/pre-formatted style, preserving line breaks
- [ ] HTML-formatted email bodies are stripped of HTML tags before display (plain text only)
- [ ] The section is NOT shown for orders that have no email body (e.g. manually uploaded PDFs without accompanying email text)

---

## Edge Cases

- **Forwarding artifacts**: Email body contains only forwarding headers ("Von:", "FW:", "-----Original Message-----") with no actual order content → Claude should ignore noise and return empty line items
- **Very long body text** (>20,000 chars): Truncate to first 20,000 characters before saving/sending to Claude; log a warning in `ingestion_notes`
- **HTML-only email body**: Strip HTML tags to extract plain text; if stripped text is <50 characters, treat as empty (skip saving)
- **Conflicting quantities**: Attachment says 10 units, body says "change to 5 units" → Claude should apply the most recent instruction (body text typically supplements/overrides)
- **Multi-language body**: Body text is in a different language than the attachment → Claude handles this naturally; language detected from the body overrides attachment language if body is longer
- **Empty or whitespace-only body**: Do not save an empty `email_body.txt`; treat as no body present
- **Dealer name in body is ambiguous** (e.g. "schein" could match multiple dealers): Use the most specific (longest) match; if still ambiguous, fall back to `unrecognized`
- **email_body.txt already exists** for an order (re-ingestion edge case): Overwrite the existing file

---

## Technical Requirements

- **Storage**: `email_body.txt` stored in Supabase Storage at `{tenant_id}/{order_id}/email_body.txt`, with a corresponding `order_files` record
- **File type handling**: The extraction route must handle `.txt` file extension and pass its content as a plain text block to Claude (verify this path already works)
- **Body text label**: When sent to Claude, the email body block should be labelled distinctly (e.g. `## Email Body Text (supplemental info from sender)`) so Claude can weight it appropriately
- **Dealer body match**: The matching is done in the Postmark ingest route after failed email-domain matching — no changes needed to the extraction route
- **Order detail API**: The API must return whether `email_body.txt` exists in `order_files` so the frontend can conditionally render the collapsible section
- **Fetching body content**: A lightweight endpoint or the existing files endpoint is used to fetch the email body text on demand (not pre-loaded with every order)

---

## Tech Design (Solution Architect)

### What Already Exists (No Changes Needed)
- The extraction pipeline automatically downloads all files in `order_files` and sends them to Claude — so if `email_body.txt` is present, it is included in extraction without touching the extraction route's core logic
- Text-only email path (save body as `email_body.txt` when no attachments) is already working
- A `Collapsible` UI component is already installed (shadcn/ui)

### Component Structure

One new UI component, inserted into the existing order detail layout:

```
Order Detail Page (existing)
+-- OrderDetailHeader (existing)
+-- OrderDetailContent (existing)
    +-- ExtractionResultPreview (existing)
    +-- EmailBodyPanel (NEW) ← shown only when email_body.txt exists
    |   +-- Collapsible [collapsed by default]
    |       +-- Trigger: "Original E-Mail ▼"
    |       +-- Content: read-only, monospace, scrollable text
    +-- OrderFileList (existing)
```

### Data Flow

```
Postmark receives email
        │
        ├── Has attachments?
        │   YES → Save attachments to order_files
        │          + ALSO save body as email_body.txt (NEW — currently skipped)
        │   NO  → Save body as email_body.txt (already works)
        │
        ├── Dealer matched by email address?
        │   YES → Done
        │   NO  → Scan body text for known dealer names (NEW fallback)
        │
        └── Extraction triggered
            │
            ├── Extraction route downloads ALL order_files (no change)
            ├── email_body.txt included automatically as labelled text block
            └── Claude receives: attachment(s) + email body → extracts combined order

Order Detail Page
        │
        ├── Order API returns order_files list (no change)
        ├── Frontend checks: does email_body.txt exist in the file list?
        │   YES → Show collapsed "Original E-Mail" panel
        │   NO  → Panel hidden
        │
        └── User expands panel → new endpoint fetches body text on demand
```

### Files Changed / Created

| File | Type | What Changes |
|------|------|--------------|
| `src/app/api/inbound/email/route.ts` | Modify | Remove "only when no attachments" condition → always save body text when non-empty; add dealer body-text fallback matching |
| `src/app/api/orders/[orderId]/extract/route.ts` | Modify | Add a distinct label for the `email_body.txt` content block so Claude treats it as supplemental sender text |
| `src/app/api/orders/[orderId]/email-body/route.ts` | New | On-demand endpoint: downloads `email_body.txt` from Storage and returns the plain text |
| `src/components/orders/email-body-panel.tsx` | New | Collapsible "Original E-Mail" UI panel with lazy loading |
| `src/components/orders/order-detail-content.tsx` | Modify | Add `EmailBodyPanel` into the layout, conditionally rendered when `email_body.txt` exists |

### Tech Decisions

- **Always save body, even with attachments** — the extraction route already processes all files in `order_files`, so saving `email_body.txt` alongside attachments automatically makes Claude see both, with zero changes to extraction logic
- **Lazy-load body text in UI** — email bodies can be long; loading on-demand keeps the order detail API fast
- **Collapsible (not Tab)** — fits the existing vertical card layout without restructuring the page; component is already installed
- **Dealer body matching in ingest route (not extraction route)** — keeps all dealer-matching logic in one place
- **No new npm packages needed**

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
