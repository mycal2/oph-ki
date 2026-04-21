# OPH-93: Clarification Order Status

## Status: In Review
**Created:** 2026-04-21
**Last Updated:** 2026-04-21

## Dependencies
- OPH-5: Bestellprüfung & manuelle Korrektur (review page where status transitions happen)
- OPH-90: Geprüft Order Status (same pattern — new status alongside `checked`)

---

## Problem Statement

Sometimes an extracted order cannot be immediately reviewed or approved because a question needs to be resolved first — e.g. an unclear article number, a missing customer number, or an ambiguous quantity that requires confirmation with the dealer or internally. Currently there is no way to flag such orders as "blocked pending clarification". They look identical to unreviewed orders in the list, which causes confusion about what still needs attention vs. what is actively on hold.

The new **Klärung** state fills this gap: a user marks an order as requiring clarification, optionally notes what needs to be resolved, and the order is visually distinct in the list. Once clarification is obtained, the order is reset to a workable state.

---

## User Stories

- As a **tenant user**, I want to mark an order as "Klärung" when I discover something unclear, so that others know this order is blocked pending clarification.
- As a **tenant user**, I want to add a clarification note (e.g. "Artikel 330-104 unbekannt — Rückfrage an Henry Schein gestellt") when setting the status, so that the reason is visible to my colleagues.
- As a **tenant admin**, I want to see "Klärung" orders with a distinct visual style in the order list, so that I can immediately tell which orders are on hold.
- As a **tenant admin**, I want to filter the order list to show only "Klärung" orders, so that I can work through all pending clarifications at once.
- As a **tenant user**, I want to resolve a "Klärung" order by resetting it to "Extrahiert" (or directly to "Geprüft"), so that it re-enters the normal review workflow after the clarification is resolved.
- As a **tenant user**, I want to see the clarification note on the order detail page, so that I know what was unclear without asking my colleague.

---

## Acceptance Criteria

### Status & Badge
- [ ] AC-1: A new `clarification` value is added to the `orders.status` enum in the database.
- [ ] AC-2: The order list displays `clarification` orders with the label **"Klärung"** and a distinct visual style (amber/yellow badge).
- [ ] AC-3: The status filter dropdown on the orders page includes a **"Klärung"** option.
- [ ] AC-4: The order detail page shows the "Klärung" status badge and the clarification note (if set).

### Setting Klärung
- [ ] AC-5: On the order review page, a **"Klärung markieren"** button is shown when the order is in `extracted`, `review`, or `checked` state.
- [ ] AC-6: Clicking "Klärung markieren" opens a small dialog/popover with an optional free-text note field (max 500 characters) and a "Bestätigen" button.
- [ ] AC-7: Confirming (with or without a note) transitions the order to `clarification` status without triggering ERP export or any downstream processing.
- [ ] AC-8: The clarification note is saved alongside the status change and displayed on the order detail page under a label "Klärungsnotiz".
- [ ] AC-9: The "Klärung markieren" button is also shown on orders already in `clarification` state, allowing the user to update the note (idempotent — keeps status as `clarification`).

### Resolving Klärung
- [ ] AC-10: On a `clarification` order, a **"Klärung abgeschlossen"** button is shown that transitions the order back to `extracted` (re-enters normal workflow).
- [ ] AC-11: On a `clarification` order, the existing **"Als Geprüft markieren"** and **"Freigeben"** buttons are also available, so users can skip back-to-extracted and proceed directly if the clarification is simple.
- [ ] AC-12: Resolving a clarification clears the clarification note (or the user can update it to a resolution note — implementation detail).

### What is NOT affected
- [ ] AC-13: The ERP export pipeline does **not** start when an order is set to `clarification` — only `approved` triggers export.
- [ ] AC-14: `clarification` orders remain fully editable on the review page (all fields, line items, dealer assignment).
- [ ] AC-15: Existing orders in any other state are unaffected — no automatic migration.
- [ ] AC-16: The "Freigeben" button (approve) is NOT available directly from `clarification` state without first going through Geprüft or another explicit resolution step — to prevent accidental approval of unresolved orders. (Exception: power users who understand the workflow can still use "Als Geprüft markieren" → then "Freigeben".)

> Note on AC-16: "Als Geprüft markieren" IS available from `clarification` (AC-11), which means a user can do: clarification → checked → approved. But they cannot skip straight to `approved` from `clarification`.

### Audit Trail
- [ ] AC-17: The order status history records the transition to `clarification` with timestamp, user, and the note text.
- [ ] AC-18: The transition from `clarification` back to `extracted` or `checked` is also recorded in the audit trail.

---

## Edge Cases

- **Order in `approved` or `exported` state**: "Klärung markieren" button is hidden — cannot mark an already-exported order as needing clarification.
- **Order in `error` state**: Button is hidden. Error must be resolved first.
- **No note provided**: Setting Klärung without a note is valid — the note field is optional.
- **Note too long**: The note input enforces a 500-character limit client-side; the API validates server-side too.
- **Platform admin cross-tenant view**: `clarification` orders appear with "Klärung" amber badge in the cross-tenant order view (OPH-18), same visual treatment as tenant view.
- **Email notifications**: No new email notification is triggered when an order moves to `clarification`. (Future feature: optional notification to colleagues could be added later.)
- **Concurrent edits**: Same behavior as all other status transitions — last save wins, no special locking.
- **Order moves back to extracted**: Auto-save while editing does NOT re-set `clarification` to `review` — the existing auto-save logic only applies to `extracted → review` transition, not `clarification`.

---

## Workflow Summary

```
extracted  ─────────────────────────────────────────►  checked  ──►  approved  ──►  exported
    │                                                      ▲
    │  [Klärung markieren]                                 │ [Als Geprüft markieren]
    ▼                                                      │
clarification  ◄────────────────────────────────────────  │
    │                                                      │
    │  [Klärung abgeschlossen]  → back to extracted        │
    │  [Als Geprüft markieren]  → skip to checked ─────────┘
    │
    (ERP export never triggered from clarification)
```

---

## Technical Requirements

- **Database:** New `clarification` enum value on `orders.status` — requires a Supabase migration (same pattern as OPH-90 migration `047_oph90_add_checked_status.sql`).
- **Clarification note storage:** Stored in a new nullable `clarification_note` text column on the `orders` table (max 500 chars), OR as a JSON field — to be decided in architecture. A dedicated column is cleaner.
- **API:** New `POST /api/orders/[orderId]/clarify` endpoint (sets `clarification` + saves note); `POST /api/orders/[orderId]/resolve-clarification` endpoint (resets to `extracted`).
- **UI:** Status badge color for `clarification` should be amber/yellow — visually distinct from grey (Extrahiert), blue (Geprüft), and green (Freigegeben).
- **Auto-save guard:** The existing auto-save logic that transitions `extracted → review` must NOT fire when the current status is `clarification` — the order should remain in `clarification` while being edited.

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview

This feature follows the exact same pattern as OPH-90 (Geprüft). The main differences: a new `clarification` status enum value, one new database column (`clarification_note`), and a small note-entry dialog in the UI. The auto-save guard is already safe — the `extracted → review` auto-transition only fires when `status === "extracted"`, so `clarification` orders are unaffected with zero code changes to that logic.

---

### Component Structure

```
Orders List Page (existing)
+-- OrdersFilterBar (existing — minor change)
|   +-- Status Tabs: add "Klärung" tab between "In Prüfung" and "Geprüft"
+-- OrdersList (existing — minor change)
    +-- Status Badge column: add amber "Klärung" badge for `clarification` orders

Order Detail Page (existing)
+-- OrderDetailHeader (existing — minor change)
    +-- Status Badge: add `clarification` → amber "Klärung" badge
    +-- Clarification Note display (shown when status is `clarification` and note exists)

Order Review Page (existing — 3 changes)
+-- ReviewPageHeader (existing — modified)
|   +-- [NEW] "Klärung markieren" Button
|   |   - Shown when status is: extracted, review, checked, clarification
|   |   - Opens ClarificationDialog
|   +-- [NEW] "Klärung abgeschlossen" Button
|   |   - Shown ONLY when status is: clarification
|   |   - Resets order to extracted
|   +-- "Als Geprüft markieren" Button (existing — add `clarification` to valid statuses)
|   +-- "Freigeben" Button (existing — HIDE when status is `clarification`)
|   +-- Clarification Note Banner (shown when status is `clarification` and note exists)
|
+-- ClarificationDialog (NEW — small shadcn Dialog)
    +-- Textarea (optional, max 500 chars)
    +-- Character counter
    +-- "Bestätigen" button
    +-- "Abbrechen" button
```

---

### Data Model

One new database column on the existing `orders` table:

```
orders table (updated):
  status            — add "clarification" to the enum (CHECK constraint)
  clarification_note — NEW nullable text column, max 500 characters
                      Stores the free-text reason (e.g. "Artikelnummer 330-104 unklar — Rückfrage an Henry Schein")
                      Cleared when clarification is resolved (set to NULL)
```

The existing `order_edits` audit trail records clarification transitions:

```
When setting clarification:
  field_path: "status"
  old_value: "extracted" (or "review" or "checked")
  new_value: "clarification"

  field_path: "clarification_note"
  old_value: null
  new_value: "Artikelnummer 330-104 unklar..."

When resolving:
  field_path: "status"
  old_value: "clarification"
  new_value: "extracted"
```

No new tables. No changes to RLS policies.

---

### New & Changed API Endpoints

| Endpoint | Change | Purpose |
|---|---|---|
| `POST /api/orders/[orderId]/clarify` | **New** | Sets order to `clarification` + saves optional note. Valid from: `extracted`, `review`, `checked`, `clarification` |
| `POST /api/orders/[orderId]/resolve-clarification` | **New** | Resets order from `clarification` back to `extracted`. Clears `clarification_note` |
| `POST /api/orders/[orderId]/check` | **Update** | Add `clarification` to valid source statuses (so user can skip straight to checked) |
| `POST /api/orders/[orderId]/approve` | **No change** | Already does NOT include `clarification` in valid source statuses — safe by default |
| `PATCH /api/orders/[orderId]/review` (auto-save) | **No change** | The `extracted → review` auto-transition only fires when `status === "extracted"`, so `clarification` orders stay in `clarification` when edited |

The `/clarify` endpoint is a thin parallel to the existing `/check` route — same auth checks, same optimistic locking, same audit log write — plus accepting an optional `note` string.

The `/resolve-clarification` endpoint is even simpler — status update from `clarification` → `extracted` + clear `clarification_note`.

---

### Valid Status Transitions (updated)

```
Button                    From statuses                       To status
───────────────────────   ─────────────────────────────────   ──────────────
Klärung markieren         extracted, review, checked, clar.   clarification
Klärung abgeschlossen     clarification                       extracted
Als Geprüft markieren     extracted, review, checked, clar.   checked
Freigeben                 extracted, review, checked           approved
```

Key: `clarification` orders can go to `checked` (skipping back to extracted) but CANNOT go directly to `approved`. This prevents accidental export of unresolved orders.

---

### Tech Decisions

| Decision | Why |
|----------|-----|
| Dedicated `clarification_note` column (not JSON) | Simple, queryable, type-safe. Only one field to store. A JSON blob would be over-engineering. |
| Separate `/clarify` and `/resolve-clarification` endpoints | Clear audit trail. Each action has distinct semantics — mixing them into one generic endpoint would be confusing. |
| Amber/yellow badge | The status color palette: grey (Extrahiert), blue (Geprüft), green (Freigegeben), red (Fehler). Amber is the only warm color not yet used — visually signals "attention needed" without implying error. |
| Note is optional | Not every clarification needs a written reason. A user might just verbally ask a colleague. Forcing a note would slow down the workflow. |
| Resolve goes to `extracted` (not `review`) | `review` is set automatically by auto-save. Going back to `extracted` means the order re-enters the clean workflow — if the user edits it, auto-save transitions to `review` naturally. |
| No email notification for clarification | This is an internal workflow state. Adding notifications can be a future enhancement if needed. |
| Freigeben hidden from clarification | Safety guard per AC-16. The user must go through `checked` first, giving them a deliberate "I've verified this is resolved" step. |

---

### Touch Points (files to change)

| File | Type of change |
|---|---|
| Supabase migration | Add `clarification` to status enum + `clarification_note` column |
| `src/lib/types.ts` | Add `clarification` to `OrderStatus` type |
| `src/lib/validations.ts` | Add Zod schema for clarify request (note field) |
| `src/app/api/orders/[orderId]/clarify/route.ts` | **New file** — sets status + saves note |
| `src/app/api/orders/[orderId]/resolve-clarification/route.ts` | **New file** — resets to extracted + clears note |
| `src/app/api/orders/[orderId]/check/route.ts` | Add `clarification` to valid source statuses |
| `src/components/orders/review/review-page-header.tsx` | Add Klärung + resolve buttons, hide Freigeben for clarification, show note banner |
| `src/components/orders/review/clarification-dialog.tsx` | **New file** — dialog with textarea for note entry |
| `src/components/orders/review/review-page-content.tsx` | Add handlers for clarify + resolve actions |
| `src/components/orders/orders-list.tsx` | Add `clarification` to STATUS_LABELS/VARIANTS/CLASSNAMES |
| `src/components/orders/orders-filter-bar.tsx` | Add "Klärung" tab |
| `src/components/orders/order-detail-header.tsx` | Add `clarification` to STATUS_LABELS/VARIANTS/CLASSNAMES + show note |
| `src/app/api/orders/[orderId]/route.ts` | Include `clarification_note` in order detail response |

### No new dependencies needed.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
