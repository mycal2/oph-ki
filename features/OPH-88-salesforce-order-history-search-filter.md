# OPH-88: Salesforce App — Order History Search & Date Filter

## Status: In Progress
**Created:** 2026-04-18
**Last Updated:** 2026-04-18
**PRD:** [Salesforce App PRD](../docs/AD-PRD.md)

## Dependencies
- OPH-81 (SF-10): Order History — the order list component and `/api/sf/orders` endpoint this feature enhances

## User Stories
- As a sales rep with many orders, I want to search by dealer name or customer number so that I can quickly find a specific order without scrolling through hundreds of results.
- As a sales rep, I want to filter orders by date so that I can narrow down orders from a specific time period.
- As a sales rep, I want to clear my search and filters with one tap so that I can return to the full order list.
- As a sales rep, I want pagination to still work when I search or filter so that I can load more matching results if there are many.

## Acceptance Criteria
- [ ] A search input is displayed above the order list on the order history page (`/sf/[slug]/orders`).
- [ ] Typing in the search input filters orders by dealer name or customer number (partial match, case-insensitive). The search is sent to the server — not filtered client-side — so all pages are searched, not just the loaded ones.
- [ ] Search is debounced: the API is called only after the user stops typing for 400ms (to avoid excessive requests).
- [ ] A date filter is displayed next to (or below) the search input. The filter offers quick preset options: **Alle** (default), **Dieser Monat**, **Letzte 3 Monate**, **Dieses Jahr**.
- [ ] When a search term or date filter is applied, the order list resets to page 1 (previous results cleared).
- [ ] When a search term is active, the total count shown reflects the filtered result count, not the total order count.
- [ ] The "Mehr laden" button continues to work when search or date filter is active, loading more matching results.
- [ ] A "Zurücksetzen" (reset) control clears both search and date filter and reloads the full list.
- [ ] If the search/filter combination returns no results, the empty state reads: **"Keine Bestellungen gefunden."** with the reset control visible.
- [ ] The search input and date filter are NOT shown on the embedded order history on the profile page — they appear only on the dedicated `/orders` page.

## Edge Cases
- Search term is whitespace only: treat as empty (no filter applied).
- Search returns 0 results: show "Keine Bestellungen gefunden." with a reset button; do NOT show the "Noch keine Bestellungen" CTA to start a new order.
- Network error while searching: show existing inline error state with a retry button.
- User changes filter while a previous request is still in flight: cancel/ignore the stale response (use an abort controller or ignore stale results).
- Date preset "Dieser Monat" on the first day of the month: should include today.
- Very fast typing: debounce ensures only one request fires per pause.
- Search + date filter combined: both filters are applied simultaneously (AND logic).

---

## Tech Design (Solution Architect)

### Overview
Two focused changes: (1) the `GET /api/sf/orders` endpoint gains two new optional query parameters (`search` and `datePreset`), and (2) the `SalesforceOrderHistory` component gains a search bar and date preset selector that trigger a fresh fetch when changed.

The profile page embedding is unchanged — the component will accept a new `showSearch` prop (default `false`) so the profile page gets no controls.

No new routes, no database table changes.

### Component Changes

```
SalesforceOrderHistory (MODIFY)
  ├── props: slug, showSearch (new, default false)
  ├── Search bar (shown only when showSearch=true)
  │   +-- Input with search icon
  │   +-- 400ms debounce before firing API call
  │   +-- "Zurücksetzen" link (shown when search or filter is active)
  ├── Date filter (shown only when showSearch=true)
  │   +-- Button group / segmented control: Alle | Dieser Monat | Letzte 3 Monate | Dieses Jahr
  ├── Order list (unchanged)
  └── "Mehr laden" button (works with filters active)

sf/[slug]/orders/page.tsx (MODIFY)
  └── Pass showSearch={true} to SalesforceOrderHistory

sf/[slug]/profile/page.tsx (no change)
  └── Continues to render SalesforceOrderHistory without showSearch (defaults to false)
```

### API Changes

`GET /api/sf/orders` gains two new optional query params:

| Param | Type | Example | Behaviour |
|---|---|---|---|
| `search` | string | `?search=meisinger` | Filters by dealer name or customer number (ILIKE `%value%` on JSONB fields) |
| `datePreset` | string | `?datePreset=thisMonth` | `thisMonth`, `last3Months`, `thisYear`; absent = no filter |

Both params are optional and backward-compatible. Existing calls without these params return all orders as before.

### Files

| File | Change |
|---|---|
| `src/app/api/sf/orders/route.ts` | Add `search` and `datePreset` param handling to the GET handler |
| `src/components/salesforce/salesforce-order-history.tsx` | Add `showSearch` prop, search input, date preset selector, reset control; refetch on change |
| `src/app/sf/[slug]/orders/page.tsx` | Pass `showSearch={true}` to the component |

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
