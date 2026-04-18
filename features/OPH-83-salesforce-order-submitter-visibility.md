# OPH-83: Show Sales Rep Identity on Salesforce App Orders

## Status: Planned
**Created:** 2026-04-18
**Last Updated:** 2026-04-18

## Dependencies
- OPH-80 (SF-9): Order Submission — stores `uploaded_by` and `source = "salesforce_app"` on the orders table
- OPH-73 (SF-2): Sales Rep Role — `user_profiles` contains `first_name`, `last_name` for sales reps

## User Stories
- As a tenant user reviewing orders, I want to see who submitted a Salesforce App order so that I know which sales rep sent it in.
- As a tenant user looking at the orders list, I want to see at a glance if an order came from the Salesforce App so that I can distinguish field orders from email orders.
- As a platform admin, I want to see the submitting sales rep on Salesforce App orders in the cross-tenant order view so that I have full visibility.
- As a tenant user, I want to see a "Salesforce App" source indicator on the order so that I understand how the order arrived.

## Acceptance Criteria
- [ ] On the order detail page, when `source = "salesforce_app"`, a "Salesforce App" source badge is shown in the order header metadata row (alongside date and uploader name).
- [ ] On the order detail page, the sales rep's name (`uploaded_by_name`) is shown when `source = "salesforce_app"` — this already works via the existing `uploaded_by` join, but must be confirmed to be present.
- [ ] The `source` field is included in the order detail API response (`GET /api/orders/[orderId]`).
- [ ] On the orders list page, Salesforce App orders display a "Salesforce App" source indicator (badge or icon) alongside or instead of the filename column, so they are visually distinct from email-ingested orders.
- [ ] The orders list API (`GET /api/orders`) includes the `source` field in its response items.
- [ ] The feature works for both tenant users and platform admins.
- [ ] No change to the orders table schema is needed (the `source` column already exists).

## Edge Cases
- An order with `source = "salesforce_app"` but a deleted user profile: show the badge but display "—" or "Unbekannt" for the name.
- Orders with `source = "email"` or `source = null`: no badge shown, unchanged behavior.
- The orders list may contain a mix of email and salesforce_app orders: both display correctly side by side.
- Admin cross-tenant order view: if it queries orders with `source = "salesforce_app"`, the source field and rep name should be visible there too.

---

## Tech Design (Solution Architect)

### Overview
OPH-83 is a display-only feature — no new database columns, no new tables, no new API endpoints. The `source` field already exists on the `orders` table; it just isn't being returned by the APIs or rendered in the UI yet. The work is: expose `source` through the two existing API routes, add it to the shared TypeScript type, and render a "Salesforce App" badge in two existing components.

---

### A) What Changes Where

```
src/lib/types.ts
+-- OrderListItem type: add source field

src/app/api/orders/route.ts  (orders list API)
+-- Add "source" to the Supabase column selection

src/app/api/orders/[orderId]/route.ts  (order detail API)
+-- Add "source" to the Supabase column selection

src/components/orders/orders-list.tsx
+-- "Datei" column: show "Salesforce App" badge below filename
    when source = "salesforce_app"

src/components/orders/order-detail-header.tsx
+-- Metadata row: show "Salesforce App" badge (with Smartphone icon)
    when source = "salesforce_app"
    (sits alongside the existing date and uploader name)
```

---

### B) Data Flow

```
orders table (source column already exists)
    ↓ selected in API query
GET /api/orders          → OrderListItem.source
GET /api/orders/[id]     → order.source
    ↓ passed as prop
orders-list.tsx          → badge in Datei column
order-detail-header.tsx  → badge in metadata row
```

---

### C) Visual Design

**Orders list — "Datei" column (when source = "salesforce_app"):**
```
[ 📎 filename.pdf ]
  [Salesforce App]   ← small secondary badge below filename
```

**Order detail header — metadata row:**
```
[ 📅 18.04.2026 ]  [ 👤 Max Mustermann ]  [ 📱 Salesforce App ]
```
The badge uses the existing `Badge` component (variant `secondary`) and a `Smartphone` icon from lucide-react. No new UI components required.

---

### D) Tech Decisions

- **Why no new API endpoint?** The source field is a simple column on the existing order record. Adding it to the existing select query costs one extra field in the response — no architectural change needed.
- **Why show the badge in the "Datei" column rather than a new column?** Adding a new "Source" column would require layout changes and increase visual noise for the 99% of orders that are email-sourced. A small badge under the filename is unobtrusive and doesn't change the column count.
- **Why not show the badge for email orders?** Email is the default/expected source. Only Salesforce App orders are "special" and need a visual callout. Showing a badge on every order would dilute the signal.
- **Why keep `uploaded_by_name` as-is?** The sales rep's name already flows through the existing `uploaded_by` → `user_profiles` join. No separate "submitted_by" field is needed.

---

### E) No New Dependencies
No new npm packages required. Uses existing: `Badge` (shadcn/ui), `Smartphone` (lucide-react, already installed).

## QA Test Results

**Tested by:** QA Engineer (code review + static analysis + build verification)
**Date:** 2026-04-18
**Build status:** PASS (production build succeeds, TypeScript compiles with zero errors)

### Acceptance Criteria Results

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| AC-1 | Order detail page shows "Salesforce App" badge when `source = "salesforce_app"` | PASS | `order-detail-header.tsx` lines 160-165: renders `<Badge variant="secondary">` with Smartphone icon in metadata row alongside date and uploader name. Condition `order.source === "salesforce_app"` is correct. |
| AC-2 | Sales rep name (`uploaded_by_name`) shown on detail page for Salesforce App orders | PASS | `order-detail-header.tsx` lines 154-158: `uploaded_by_name` is rendered when present, sourced from the existing `uploader:user_profiles!orders_uploaded_by_fkey` join in the API. Confirmed the join exists in the detail API (`[orderId]/route.ts` line 102). |
| AC-3 | `source` field included in order detail API response (`GET /api/orders/[orderId]`) | PASS | `[orderId]/route.ts` line 98: `source` is in the Supabase select list. Line 187: mapped to the response as `source: (order.source as string \| null) ?? null`. The `OrderForReview` type inherits `source` from `OrderWithDealer` (types.ts line 220). |
| AC-4 | Orders list shows "Salesforce App" badge for SF orders in the Datei column | PASS | `orders-list.tsx` lines 504-509: renders `<Badge variant="secondary">` with Smartphone icon below the filename link when `order.source === "salesforce_app"`. Badge has `mt-1`, `text-[10px]`, `w-fit` classes for proper sizing. |
| AC-5 | Orders list API (`GET /api/orders`) includes `source` field | PASS | `orders/route.ts` line 132: `source` is in the Supabase select list. Line 263: mapped to the response `source: (order.source as string \| null) ?? null`. The `OrderListItem` type includes `source: string \| null` (types.ts line 244). |
| AC-6 | Feature works for both tenant users and platform admins | PASS | The `OrdersList` component is used on the shared `/orders` page. Platform admins see the same table with the same badge rendering logic. The detail page uses the same `OrderDetailHeader` for all roles. The API routes are role-agnostic for the `source` field (always returned regardless of role). |
| AC-7 | No change to orders table schema needed | PASS | Confirmed: no migration files for OPH-83. The `source` column already exists (used by `POST /api/sf/orders` at line 378 and `POST /api/inbound/email` at line 308). |

### Edge Cases

| Edge Case | Result | Notes |
|-----------|--------|-------|
| Deleted user profile (source="salesforce_app", no user) | PASS (with note) | The uploader name is hidden when `uploaded_by_name` is null (detail: line 154 uses `&&`; list: line 525 shows "-"). The badge still renders independently. **Note:** The spec says "Unbekannt" should display but the code shows "-" (dash) in the list and nothing in the detail. See BUG-1 below. |
| Orders with source="email" or source=null | PASS | The condition `order.source === "salesforce_app"` means no badge renders for any other source value. No behavioral change for existing orders. |
| Mixed email and SF orders in list | PASS | Each row independently checks its own `source` field. Both display correctly side by side. |
| Admin cross-tenant view | PASS | Same `OrdersList` component is used. The tenant filter, dealer filter, and source badge all render together without conflicts. |

### Security Audit (Red Team)

| Check | Result | Notes |
|-------|--------|-------|
| Source field injection via upload API | SAFE | The standard upload API (`POST /api/orders/upload`) does NOT set a `source` field -- verified by searching the upload route. The `source` column defaults to null in the DB. |
| Source field injection via SF API | SAFE | `POST /api/sf/orders` hardcodes `source: "salesforce_app"` (line 378). The value is not user-controllable; it is set server-side. The endpoint also requires `sales_rep` role (line 195). |
| Source field tampering via PATCH | SAFE | No PATCH endpoint exists that allows modifying the `source` field. The `source` is write-once at order creation. |
| Data exposure | SAFE | The `source` field is a non-sensitive enum-like string. No PII exposure risk. It is correctly exposed to all authenticated users who can already see the order. |
| XSS via source field | SAFE | The source value is compared with `===` to a hardcoded string. It is never rendered as raw HTML. React's JSX escaping prevents any XSS even if a malicious value existed in the DB. |

### Build & Type Safety

| Check | Result |
|-------|--------|
| TypeScript compilation (`tsc --noEmit`) | PASS -- zero errors |
| Production build (`npm run build`) | PASS -- completes successfully |
| Type definitions | PASS -- `source: string \| null` added to both `OrderListItem` and `OrderWithDealer` in types.ts |

### Cross-Browser & Responsive (Code Review Assessment)

The feature uses standard shadcn/ui `<Badge>` component and `lucide-react` `<Smartphone>` icon. No custom CSS, no browser-specific APIs.

| Check | Assessment |
|-------|------------|
| Chrome | Expected PASS -- standard React/Tailwind rendering |
| Firefox | Expected PASS -- no browser-specific APIs used |
| Safari | Expected PASS -- flexbox layout, standard Badge component |
| 375px (mobile) | Expected PASS -- badge uses `w-fit` and `text-[10px]`, sits inside flex-wrap container |
| 768px (tablet) | Expected PASS -- standard responsive table layout unchanged |
| 1440px (desktop) | Expected PASS -- standard table layout unchanged |

**Note:** Full manual browser testing should be done in a live environment with real Salesforce App orders to validate visual rendering.

### Bugs Found

#### BUG-1: Deleted user shows "-" instead of "Unbekannt" (Low)

**Severity:** Low
**Priority:** P3
**Steps to reproduce:**
1. Create a Salesforce App order via `POST /api/sf/orders`
2. Delete the sales rep's user profile from the database
3. View the order in the orders list
4. Observe the "Hochgeladen von" column shows "-" instead of "Unbekannt"
5. View the order detail page -- the uploader name is simply hidden

**Expected:** Per the spec edge case, "Unbekannt" should be displayed when the user profile is deleted.
**Actual:** Orders list shows "-" (dash). Order detail shows nothing (the name section is conditionally hidden).
**Location:** `orders-list.tsx` line 525 (`order.uploaded_by_name ?? "-"`), `order-detail-header.tsx` lines 154-158 (conditional rendering with `&&`).
**Fix suggestion:** Change the fallback to "Unbekannt" in both components when `source === "salesforce_app"` and `uploaded_by_name` is null.

### Regression Check

| Related Feature | Status | Notes |
|----------------|--------|-------|
| OPH-5 (Order Review) | No regression | `OrderDetailHeader` receives the same `order` object; only a new conditional badge was added |
| OPH-11 (Order History) | No regression | `OrdersList` renders the same table structure; only a new conditional badge row was added under the filename |
| OPH-18 (Cross-Tenant View) | No regression | Same component, tenant filter unchanged |
| OPH-80 (SF Order Submission) | No regression | The `POST /api/sf/orders` endpoint is unchanged; `source` was already being set |
| OPH-68 (Dealer Filter) | No regression | Dealer filter logic is separate from source badge rendering |

### Summary

- **Acceptance criteria:** 7/7 PASS
- **Edge cases:** 4/4 PASS (1 with minor note -- BUG-1)
- **Security audit:** 5/5 SAFE
- **Bugs found:** 1 Low severity
- **Regression:** No regressions detected

### Production-Ready Decision: YES

No Critical or High severity bugs. The single Low-severity bug (BUG-1) is a cosmetic fallback text difference for a rare edge case (deleted user profile) and does not block deployment.

## Deployment
_To be added by /deploy_
