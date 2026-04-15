# OPH-66: Reset Dealer Recognition on an Order

## Status: In Progress
**Created:** 2026-04-15
**Last Updated:** 2026-04-15

## Dependencies
- Requires: OPH-3 (Händler-Erkennung & Händler-Profile) — provides the recognition pipeline being reset
- Requires: OPH-4 (KI-Datenextraktion) — re-extract after reset uses this pipeline
- Relates to: OPH-5 (Bestellprüfung & manuelle Korrektur) — complements the existing "Korrigieren" override

## Problem Context

When a dealer is assigned to an order incorrectly — either by the AI using buggy logic (e.g. pre-stopword-fix matches) or by a reviewer who clicked "KI-Vorschlag bestätigen" on a wrong suggestion — there is today **no way in the UI to clear that assignment**. The only path is direct SQL:

```sql
UPDATE orders SET dealer_id = NULL, recognition_method = 'none', recognition_confidence = 0,
  dealer_overridden_by = NULL, dealer_overridden_at = NULL, override_reason = NULL
WHERE id = '...';
```

Why this matters: the re-extract path at [src/app/api/orders/[orderId]/extract/route.ts:352](src/app/api/orders/%5BorderId%5D/extract/route.ts#L352) has a guard `if (metadataConfidence < 80)` that skips AI dealer matching when any existing assignment (including manual at 100%) is in place. So re-extracting an order with a wrong manual/bugged dealer assignment will **not** re-evaluate the dealer — the bad assignment sticks.

Real example from this session (order 4cd1ddbd): was wrongly matched to "Plandent" by an AI bug, reviewer clicked "Bestätigen", and after the stopwords fix was deployed the wrong dealer remained because re-extract skipped AI matching. Required hand-written SQL to fix.

## User Stories

- As a **Plattform-Admin**, I want to reset the dealer on an order from the UI, so that I can clear a wrong assignment and let the current (fixed) recognition pipeline try again without needing database access.
- As a **Plattform-Admin**, I want the reset to be distinct from "Korrigieren", so that I don't need to know the correct dealer in advance — I just want to clear the state and let the AI try again.
- As a **Plattform-Admin**, I want the reset action to be traceable (who did it, when), so that we have accountability in case a reset was done in error.
- As a **Plattform-Admin**, I want to confirm the reset in a dialog before it runs, so that I don't clear a production assignment by accident.
- As a **Mandant-Mitarbeiter**, I want NOT to see this action in my UI, so that I don't accidentally trigger a platform-level operation.

## Acceptance Criteria

### UI Behavior

- [ ] The order detail header shows a new **"Händler zurücksetzen"** action in the dealer section, visible only to users with role `platform_admin`.
- [ ] Clicking the action opens a confirmation dialog: "Händler-Zuweisung wirklich zurücksetzen? Die Bestellung hat danach keinen Händler mehr. Sie können die Bestellung anschließend neu extrahieren, um die KI-Erkennung erneut laufen zu lassen."
- [ ] The dialog has two buttons: "Abbrechen" (closes) and "Zurücksetzen" (destructive styling, executes the reset).
- [ ] On successful reset, the dealer section updates in place: dealer name disappears, confidence drops to 0, method shows "none", and the "Korrigieren"/"Bestätigen" buttons return to their unresolved state.
- [ ] A toast shows "Händler-Zuweisung zurückgesetzt. Bestellung neu extrahieren, um erneut zu erkennen." with a shortcut button "Neu extrahieren" that triggers the existing extract endpoint.
- [ ] Non-platform-admin users (tenant admins, tenant users) do not see the reset action at all.

### API Behavior

- [ ] A new endpoint `DELETE /api/orders/[orderId]/dealer` clears the dealer on the order.
- [ ] The endpoint requires authentication and the caller's `role` in app_metadata must be `platform_admin`. Non-admin callers receive `403 Forbidden`.
- [ ] The endpoint sets the following fields on the `orders` row:
  - `dealer_id` → `NULL`
  - `recognition_method` → `'none'`
  - `recognition_confidence` → `0`
  - `dealer_overridden_by` → `NULL`
  - `dealer_overridden_at` → `NULL`
  - `override_reason` → `NULL`
  - `dealer_reset_by` → current user id *(new column)*
  - `dealer_reset_at` → current timestamp *(new column)*
- [ ] The endpoint returns the updated order's `updated_at` (for client-side optimistic locking alignment) plus the reset metadata.
- [ ] Optimistic locking via `updated_at` in the request body (same pattern as the PATCH endpoint): mismatched `updated_at` returns `409 Conflict`.
- [ ] Requests with invalid UUID → `400`. Non-existent order → `404`. Orders outside the caller's visible scope → `404`.

### Audit Trail

- [ ] New columns on the `orders` table: `dealer_reset_by UUID REFERENCES user_profiles(id)` and `dealer_reset_at TIMESTAMPTZ`, both nullable.
- [ ] The recognition-audit line in the order detail header ([RecognitionAuditLine](src/components/orders/dealer/recognition-audit-line.tsx)) is extended to show "Zurückgesetzt von [Name] am [Datum]" when `dealer_reset_at` is set AND `dealer_id` is NULL.
- [ ] When a new dealer assignment happens (via PATCH or a re-extract AI match), the reset columns are cleared (set back to NULL) — they represent the *current* reset state, not history.
- [ ] Reset events are logged to the server console with structured fields (`orderId`, `actorId`, `previousDealerId`) for traceability via existing log infrastructure.

### Re-extract Interaction

- [ ] After a reset, clicking "Neu extrahieren" on the order triggers the existing `POST /api/orders/[orderId]/extract` route. No changes to that route.
- [ ] Because `recognition_confidence = 0` after a reset, the AI matching guard (`metadataConfidence < 80`) passes and AI dealer recognition runs on the next extract — this is the primary use case being unblocked.
- [ ] The automatic re-extract is **NOT** part of this feature — it's a separate user action. The toast offers a shortcut but does not run it implicitly.

### Out of Scope (explicitly NOT in this feature)

- Automatic re-extraction after reset (user-triggered only).
- Bulk reset (resetting dealer on many orders at once).
- Permission for tenant admins or tenant users (platform-admin-only for this iteration).
- Separate append-only audit log table — the on-row `dealer_reset_by/at` columns are considered sufficient.

## Edge Cases

- **Order status is `exported`:** reset is blocked. The dealer was part of the exported data; clearing it post-export would create inconsistency. Return `409 Conflict` with message "Bestellung wurde bereits exportiert. Händler-Zuweisung kann nicht zurückgesetzt werden."
- **Order status is `processing`:** reset is blocked. Extraction might be mid-flight. Return `409 Conflict` with message "Bestellung wird gerade verarbeitet. Bitte warten Sie, bis die Verarbeitung abgeschlossen ist."
- **Order already has no dealer** (`dealer_id IS NULL`): reset is a no-op. Return `200 OK` with the current state; the UI still refreshes. No error.
- **Concurrent edits:** optimistic locking via `updated_at` mirrors the PATCH endpoint's behavior. Mismatch → `409`.
- **Reset fields shown in audit even after new assignment:** resolved by the "clear on new assignment" rule — the PATCH `/dealer` handler and the extract route both null out `dealer_reset_by/at` when assigning a new dealer.
- **User who did the reset is later deleted:** `dealer_reset_by` becomes a dangling reference. UI falls back to "Zurückgesetzt am [Datum]" (omitting the name) — existing pattern used for `dealer_overridden_by_name`.
- **Reset action raced with a parallel AI re-extract that just set a new dealer:** optimistic locking catches this (updated_at mismatch → 409), no silent overwrite.

## Technical Requirements

- **Permission check:** both server-side (API route) and client-side (UI visibility). Server is the authority; client is for UX.
- **Database migration:** two new nullable columns on the `orders` table. No backfill needed — existing rows stay NULL.
- **Atomic update:** the reset and audit columns are set in a single UPDATE statement to avoid intermediate states.
- **No new npm packages.**
- **No changes to RLS policies:** the API route uses the admin client (like the existing PATCH `/dealer` route) and enforces authorization in application code.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview

Small, self-contained change across three layers — a new API endpoint, two new DB columns, and one new UI component slotted into an existing area. No new pages, no new routing, no new npm packages.

### Component Structure

```
OrderDetailHeader (existing — unchanged)
+-- DealerSection (existing — extended)
|   +-- DealerBadge (existing — unchanged)
|   +-- "KI-Vorschlag" badge (existing — unchanged)
|   +-- "Bestätigen" button (existing — unchanged)
|   +-- "Korrigieren" button (existing — unchanged)
|   +-- "Zurücksetzen" button (NEW — platform_admin only)
|   |     Icon: RotateCcw (or similar "undo" icon from lucide-react)
|   |     Destructive ghost style, only rendered when role = platform_admin
|   +-- DealerOverrideDialog (existing — unchanged)
|   +-- DealerResetDialog (NEW — simple confirm/cancel, no dealer picker)
|         Title: "Händler-Zuweisung zurücksetzen?"
|         Body:  "Die Bestellung hat danach keinen Händler mehr.
|                 Sie können sie anschließend neu extrahieren."
|         Buttons: "Abbrechen" | "Zurücksetzen" (destructive variant)
|
+-- RecognitionAuditLine (existing — extended)
      NEW case: when dealer_id is NULL and dealer_reset_at is set
      → shows "Zurückgesetzt von [Name] am [Datum]"
```

### Data Model

**orders table** — two new nullable columns (DB migration):

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `dealer_reset_by` | UUID (FK → user_profiles) | NULL | Who triggered the reset |
| `dealer_reset_at` | Timestamp with timezone | NULL | When it was reset |

These columns are **cleared** (set back to NULL) whenever a new dealer is assigned (via manual override or AI re-extract), so they represent the *current* reset state only, not history.

No changes to existing `dealer_id`, `recognition_method`, `recognition_confidence`, or `dealer_overridden_*` columns — those are what the reset clears.

### New Pieces (backend)

**`DELETE /api/orders/[orderId]/dealer`** — added to the existing route file alongside the current PATCH handler.

What it does:
1. Authenticate → verify `role = platform_admin` (403 otherwise)
2. Validate orderId format
3. Fetch order — check it exists and is not `exported` or `processing` (409 if so)
4. Optimistic locking: if `updatedAt` supplied in body, verify it matches DB (409 if mismatch)
5. Single UPDATE: clears all dealer fields, writes `dealer_reset_by` + `dealer_reset_at`
6. Returns the new `updated_at` + reset metadata (for client-side refresh)

**`dealerResetSchema`** — new minimal Zod schema in `src/lib/validations.ts` (just the optional `updatedAt` field for optimistic locking).

**`DealerResetResponse` type** — new type in `src/lib/types.ts` (orderId, resetBy, resetAt, updatedAt).

**`RecognitionMethod`** type — no change needed; `'none'` already exists.

### New Pieces (frontend)

**`useDealerReset` hook** — new file in `src/hooks/`, mirroring the existing `use-dealer-override.ts`. Calls `DELETE /api/orders/[orderId]/dealer`, manages loading/error state.

**`DealerResetDialog`** — new file in `src/components/orders/dealer/`. A simple AlertDialog (shadcn/ui) with a confirm/cancel — no combobox or form fields needed. Much simpler than the existing `DealerOverrideDialog`.

**`DealerSection`** — one new button + the DealerResetDialog wired in. Rendered only when user role is `platform_admin`. On successful reset, calls back to parent (same `onDealerChanged` pattern but with nulled-out dealer fields).

**`RecognitionAuditLine`** — two new optional props (`resetByName`, `resetAt`). Shows a third audit segment when dealer is unset via reset.

### Component Structure (full existing + new)

```
src/components/orders/dealer/
  dealer-badge.tsx           (existing — unchanged)
  dealer-override-dialog.tsx (existing — unchanged)
  dealer-section.tsx         (existing — extended: new button + DealerResetDialog)
  dealer-reset-dialog.tsx    (NEW)
  recognition-audit-line.tsx (existing — extended: reset display)
  index.ts                   (existing — export new dialog)

src/hooks/
  use-dealer-override.ts     (existing — unchanged)
  use-dealer-reset.ts        (NEW)

src/app/api/orders/[orderId]/dealer/route.ts  (existing — add DELETE handler)
src/lib/types.ts             (existing — add DealerResetResponse)
src/lib/validations.ts       (existing — add dealerResetSchema)
supabase/migrations/[new].sql
```

### Key Tech Decisions

| Decision | Reason |
|----------|--------|
| New DELETE handler in the existing route file | Keeps dealer actions co-located; Next.js App Router supports multiple HTTP methods per file |
| `DealerResetDialog` as AlertDialog, not the full `DealerOverrideDialog` pattern | No dealer picker needed — it's just a destructive confirmation. AlertDialog is the right shadcn primitive for this. |
| Role checked server-side AND client-side | Server is the authority (403 returned on unauthorized call). Client check is UX-only to hide the button from non-admins. |
| Reset fields on `orders`, not a separate audit table | Sufficient for this use case per requirements; a future full audit log feature can sweep all order-change events at once. |
| No automatic re-extract | Keeps reset and extraction as two explicit, observable actions. User sees the cleared state first and decides whether to re-extract. |

### No new npm packages required.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
