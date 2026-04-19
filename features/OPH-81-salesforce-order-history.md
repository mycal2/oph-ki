# OPH-81: Salesforce App — Order History & Reorder (SF-10)

## Status: In Progress
**Created:** 2026-04-17
**Last Updated:** 2026-04-17
**PRD:** [Salesforce App PRD](../docs/salesforce-prd.md)

## Dependencies
- OPH-80 (SF-9): Order Submission — orders must exist to be listed
- OPH-75 (SF-4): Magic Link Authentication — user must be logged in

## User Stories
- As a sales rep, I want to see a list of my past orders so that I can track what I've submitted.
- As a sales rep, I want to see the status of each order (submitted, in review, exported) so that I know where it stands.
- As a sales rep, I want to copy a past order into a new basket so that I can quickly reorder for the same dealer.
- As a sales rep, I want to view the details of a past order so that I can check what was ordered.

## Acceptance Criteria
- [ ] A "Bestellungen" (Orders) navigation item is available in the Salesforce App (header or bottom nav).
- [ ] The order list shows only orders submitted by the current sales rep (`submitted_by = user.id`), sorted by date (newest first).
- [ ] Each order in the list shows: date, dealer name/customer number, number of line items, status badge, and total articles count.
- [ ] Status badges: "Eingereicht" (submitted/pending_review), "In Prüfung" (in review), "Exportiert" (exported), "Abgelehnt" (rejected if applicable).
- [ ] Tapping an order shows the full order details: all line items, dealer info, delivery address, notes.
- [ ] A "Nachbestellen" (Reorder) button on the detail page copies all line items into a new basket (quantities preserved).
- [ ] Reorder pre-fills the basket but does NOT pre-fill dealer info (the sales rep may be ordering for a different dealer this time).
- [ ] The order list is paginated (20 per page) with "Mehr laden" (Load more) or infinite scroll.

## Edge Cases
- Sales rep has no past orders: show "Noch keine Bestellungen" with a link to start a new order.
- Reorder with articles that no longer exist in the catalog: skip those articles, show a message "X Artikel nicht mehr verfügbar".
- Order was rejected or deleted in OPH: still visible in the sales rep's history with appropriate status.
- Sales rep has hundreds of orders: pagination must work efficiently.

---

## Tech Design (Solution Architect)

### Overview
OPH-81 adds a browsable order history and one-tap reorder to the Salesforce App. Orders are already stored in the `orders` table (from OPH-80) — no new database tables needed. Two new API endpoints expose the list and detail for the current sales rep. The reorder feature validates articles against the live catalog before adding them to the basket.

---

### A) Component Structure

```
SalesforceHeader (MODIFY)
+-- Add "Bestellungen" link (clock icon) next to basket icon

sf/[slug]/orders/page.tsx (NEW — server component, auth guard)
+-- SalesforceOrderHistory (NEW client component)
    +-- "Meine Bestellungen" heading
    +-- Order card list (sorted newest first)
    |   +-- OrderCard: date, dealer name, item count, status badge
    |   +-- Empty state: "Noch keine Bestellungen" + CTA to start new order
    +-- "Mehr laden" button (20 per page, loads next page on click)
    +-- Loading skeletons while fetching

sf/[slug]/orders/[orderId]/page.tsx (NEW — server component, auth guard)
+-- SalesforceOrderDetail (NEW client component)
    +-- Back button (← Bestellungen)
    +-- Order header: date, dealer name, status badge
    +-- Dealer info card (name, customer number if applicable)
    +-- Line items list (article number, name, quantity)
    +-- Delivery address card (only if set)
    +-- Notes card (only if set)
    +-- Sticky footer: [Nachbestellen] button
        +-- Validates each article still exists in catalog
        +-- Unavailable articles shown as warning before proceeding
        +-- Copies available articles to basket, navigates to /basket
```

---

### B) Data (what's stored and where)

Orders already exist in the database from OPH-80. The `extracted_data` JSONB column contains everything needed:
- Dealer name and customer number (from `order.sender` or `order.dealer`)
- All line items: article number, description, quantity
- Delivery address and notes

The order history reads this existing data — no new tables or columns needed.

**Status label mapping** (from existing `OrderStatus` values):

| Database value | Label shown in app |
|---|---|
| `extracted` | Eingereicht |
| `review` | In Prüfung |
| `approved` / `exported` | Exportiert |
| `error` | Fehler |

---

### C) APIs Needed

| Endpoint | Purpose |
|---|---|
| `GET /api/sf/orders` | List orders for current sales rep. Filters: `source = salesforce_app` + `uploaded_by = user.id`. Returns 20 per page. Response includes: id, date, dealer name, item count, status. |
| `GET /api/sf/orders/[orderId]` | Single order detail for the current sales rep. Returns full `extracted_data` (line items, dealer, address, notes). Verifies the order belongs to the requesting user (no cross-user access). |

`GET /api/sf/orders` is added to the existing `route.ts` alongside the existing `POST`. The detail endpoint is a new file.

The reorder flow uses the existing `GET /api/articles?search=...` endpoint to verify each article still exists before adding to the basket.

---

### D) Files Changed

| File | Change |
|---|---|
| `src/app/api/sf/orders/route.ts` | MODIFY: Add `GET` handler for order list |
| `src/app/api/sf/orders/[orderId]/route.ts` | NEW: Order detail endpoint |
| `src/app/sf/[slug]/orders/page.tsx` | NEW: Order history route |
| `src/app/sf/[slug]/orders/[orderId]/page.tsx` | NEW: Order detail route |
| `src/components/salesforce/salesforce-order-history.tsx` | NEW: Order list with pagination |
| `src/components/salesforce/salesforce-order-detail.tsx` | NEW: Order detail + reorder |
| `src/components/salesforce/salesforce-header.tsx` | MODIFY: Add "Bestellungen" icon link |

No new npm packages. All UI uses existing shadcn/ui components.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
