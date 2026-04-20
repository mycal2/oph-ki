# OPH-90: Geprüft Order Status (Verified State)

## Status: Deployed
**Created:** 2026-04-18
**Last Updated:** 2026-04-20

## Dependencies
- OPH-5: Bestellprüfung & manuelle Korrektur (review page where status transitions happen)
- OPH-6: ERP-Export & Download (export must only trigger on `approved`, not `checked`)

## Problem Statement

Currently there are two user-facing workflow states between extraction and export: **Extrahiert** and **Freigegeben**. There is no intermediate state to indicate that someone has already checked and corrected an order but has not yet released it for ERP export. This means there is no way to distinguish "has been reviewed and is ready to approve" from "has not yet been touched".

The new **Geprüft** state fills this gap: a reviewer marks an order as checked (confirmed correct), but the post-processing pipeline does not start. A second person (or the same person later) can then release it with **Freigeben**.

## User Stories

- As a **tenant user**, I want to mark an order as "Geprüft" after reviewing and correcting it, so that others know it has been checked without triggering ERP export yet.
- As a **tenant admin**, I want to see which orders are in "Geprüft" state in the order list, so that I can quickly identify orders waiting for final approval.
- As a **tenant user**, I want to open a "Geprüft" order and make further corrections if needed, so that errors discovered late can still be fixed before export.
- As a **tenant user**, I want to release a "Geprüft" order with "Freigeben" to trigger ERP export, so that the approval step is separate from the review step.
- As a **tenant admin**, I want to filter the order list by "Geprüft" status, so that I can see all orders awaiting final release.

## Acceptance Criteria

- [ ] A new `checked` value is added to the `order_status` enum in the database.
- [ ] The order review page shows a **"Als Geprüft markieren"** button when the order is in `extracted` or `review` state.
- [ ] Clicking "Als Geprüft markieren" transitions the order to `checked` status without triggering ERP export or any downstream processing.
- [ ] The order list displays `checked` orders with the label **"Geprüft"** and a distinct visual style (e.g. blue badge).
- [ ] The status filter dropdown on the orders page includes a **"Geprüft"** option.
- [ ] A `checked` order is still fully editable on the review page (all fields, line items, dealer assignment).
- [ ] The **"Freigeben"** button remains available on `checked` orders and transitions them to `approved` (triggering export as before).
- [ ] The **"Als Geprüft markieren"** button is also shown on `checked` orders so a reviewer can re-confirm after further corrections (no-op state change; keeps status as `checked`).
- [ ] The ERP export pipeline does **not** start when an order is set to `checked` — only `approved` triggers export.
- [ ] The order status history / audit trail records the transition to `checked` with timestamp and user.
- [ ] Existing orders in `extracted` or `review` status are unaffected — no automatic migration to `checked`.

## Edge Cases

- **Order already in `checked` state**: Clicking "Als Geprüft markieren" again is a no-op (or re-saves the timestamp); no error is shown.
- **Order in `approved` or `exported` state**: "Als Geprüft markieren" button is hidden — cannot go backwards.
- **Order in `error` state**: Button is hidden. Error must be resolved first before transitioning.
- **Concurrent edits**: If two users have the same order open, the last save wins. No special locking required (same behavior as today).
- **Platform admin view**: `checked` orders appear with "Geprüft" label in the cross-tenant order view, same as tenant view.
- **Search/filter**: Searching or filtering by status="checked" returns only Geprüft orders; existing status filters continue to work.
- **Email notifications**: No new email notification is triggered when an order moves to `checked` (this is an internal workflow state). The existing "Freigegeben" notification continues to fire only on `approved`.

## Workflow Summary

```
extracted  →  [Als Geprüft markieren]  →  checked  →  [Freigeben]  →  approved  →  exported
    ↑                                         |
    |                                  still editable,
    |                                  can correct &
    └────────── no backwards transition ──────┘
```

## Technical Requirements

- **Database:** New `checked` enum value on `orders.status` — requires a Supabase migration.
- **API:** `PATCH /api/orders/[id]/status` must accept `checked` as a valid target status (alongside `approved`).
- **RLS:** No new policies needed — status update follows the same tenant isolation as `approved`.
- **UI:** Status badge color for `checked` should be visually distinct from `extracted` (grey) and `approved` (green). Suggested: blue.
- **No export trigger:** The export/post-processing job only runs on `approved` — this must be checked and documented in the export logic.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

```
Orders List Page (existing)
+-- OrdersFilterBar (existing — minor change)
|   +-- Status Tabs: add "Geprüft" tab between "In Prüfung" and "Freigegeben"
+-- OrdersList (existing — minor change)
    +-- Status Badge column: add blue "Geprüft" badge for `checked` orders

Order Detail Page (existing)
+-- OrderDetailHeader (existing — two changes)
|   +-- Status Badge: add `checked` → blue "Geprüft" badge
|   +-- [NEW] "Als Geprüft markieren" Button
|       - Shown when status is: extracted, review, or checked
|       - Hidden when status is: approved, exported, error, uploaded, processing
+-- OrderDetailContent (existing — no changes)
    +-- ExportButton (unchanged — only enabled for approved/exported)
    +-- "Freigeben" Button (unchanged — now also works from `checked` status)
```

### Data Model

No new database columns needed. The `checked` state uses the existing `status` field:

```
Order status field (updated enum):
  uploaded → processing → extracted → checked (NEW) → approved → exported

Existing audit trail (order_edits table) automatically records:
  - field_path: "status"
  - old_value: "extracted" (or "review" or "checked")
  - new_value: "checked"
  - user_id + timestamp
```

The `reviewed_at` and `reviewed_by` columns on the orders table are NOT written when marking as `checked` — those remain reserved for the final "Freigeben" (`approved`) action, preserving their existing meaning.

### New & Changed API Endpoints

| Endpoint | Change | Purpose |
|---|---|---|
| `POST /api/orders/[orderId]/check` | **New** | Sets order to `checked`; valid from `extracted`, `review`, `checked` |
| `POST /api/orders/[orderId]/approve` | **Update** | Add `checked` to the list of valid source statuses |

The new `/check` endpoint is a thin parallel to the existing `/approve` route — same auth checks, same optimistic locking, same audit log write — but with no line-item validation required.

### Tech Decisions

- **New endpoint vs. reusing approve**: A separate `/check` endpoint keeps the two actions clearly distinct. The approve route does line-item validation; the check route does not.
- **No new DB columns**: The existing `status` enum and `order_edits` audit trail cover all requirements.
- **Blue badge color**: `checked` gets a distinct blue color (currently unused), distinguishable from grey (Extrahiert) and green (Freigegeben).
- **`review` status kept**: The existing `review` state is preserved unchanged. `checked` is a deliberate user action, not an automatic transition.

### Touch Points (files to change)

| File | Type of change |
|---|---|
| Supabase migration | Add `checked` to `order_status` enum |
| `src/lib/types.ts` | Add `checked` to `OrderStatus` type |
| `src/app/api/orders/[orderId]/check/route.ts` | **New file** |
| `src/app/api/orders/[orderId]/approve/route.ts` | Add `checked` to valid source statuses |
| `src/components/orders/order-detail-header.tsx` | Add badge label/color + new button |
| `src/components/orders/orders-list.tsx` | Add `checked` to STATUS_LABELS |
| `src/components/orders/orders-filter-bar.tsx` | Add "Geprüft" tab |

### No new dependencies needed.

## QA Test Results

**Tested:** 2026-04-20 | **Build:** PASS | **Bugs found:** 0

### Acceptance Criteria

| # | Criterion | Result |
|---|-----------|--------|
| 1 | `checked` value added to order_status | PASS — migration 047, schema-bootstrap updated |
| 2 | "Als Geprüft markieren" button on extracted/review orders | PASS — review-page-header.tsx, CHECKABLE_STATUSES |
| 3 | Clicking sets status to `checked` without triggering export | PASS — check/route.ts sets `checked`, no export trigger |
| 4 | Order list shows "Geprüft" with blue badge | PASS — orders-list.tsx, blue styling applied |
| 5 | Status filter includes "Geprüft" option | PASS — orders-filter-bar.tsx |
| 6 | `checked` order is fully editable on review page | PASS — auto-save only transitions extracted→review, not checked→review |
| 7 | "Freigeben" button available on `checked` orders | PASS — approve route accepts `checked` as valid source |
| 8 | "Als Geprüft markieren" shown on `checked` orders (idempotent) | PASS — `checked` in CHECKABLE_STATUSES |
| 9 | ERP export does NOT trigger on `checked` | PASS — EXPORTABLE_STATUSES only includes approved/exported |
| 10 | Audit trail records transition to `checked` | PASS — order_edits insert in check/route.ts |
| 11 | Existing extracted/review orders unaffected | PASS — no automatic migration |

### Security
- Auth required: PASS
- Tenant isolation (RLS): PASS
- Optimistic locking: PASS
- Invalid status transitions rejected: PASS

## Deployment

- **Production:** https://oph.ids.online
- **Deployed:** 2026-04-20
- **Commit:** f94381c
- **Tag:** v1.90.0-OPH-90
