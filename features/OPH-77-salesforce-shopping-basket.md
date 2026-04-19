# OPH-77: Salesforce App — Shopping Basket (SF-6)

## Status: In Progress
**Created:** 2026-04-17
**Last Updated:** 2026-04-17
**PRD:** [Salesforce App PRD](../docs/salesforce-prd.md)

## Dependencies
- OPH-76 (SF-5): Article Search & Browse — articles are added to basket from search results

## User Stories
- As a sales rep, I want to see a basket icon with item count badge so that I always know how many items are in my order.
- As a sales rep, I want to view my basket contents so that I can review what I've added before checkout.
- As a sales rep, I want to adjust the quantity of each item so that I can order the right amounts.
- As a sales rep, I want to remove items from the basket so that I can correct mistakes.
- As a sales rep, I want my basket to persist during my session so that I don't lose items if I navigate away and come back.

## Acceptance Criteria
- [ ] A basket icon with item count badge is always visible in the Salesforce App header.
- [ ] Tapping the basket icon opens the basket view showing all added articles.
- [ ] Each basket item shows: article number, article name, quantity input, and a remove button.
- [ ] Quantity can be adjusted via +/- buttons or direct number input (minimum 1).
- [ ] Removing an item updates the count badge immediately.
- [ ] The basket is stored in the browser session (sessionStorage or React state) — no server-side persistence needed for MVP.
- [ ] A "Zur Kasse" (Checkout) button is visible in the basket view, disabled when basket is empty.
- [ ] A "Warenkorb leeren" (Clear basket) button allows removing all items at once (with confirmation).
- [ ] The total number of line items is shown (e.g. "3 Artikel").

## Edge Cases
- Sales rep closes the browser tab and reopens: basket is cleared (session-based). This is acceptable for MVP.
- Sales rep adds the same article twice from search: increment quantity on existing basket item rather than creating a duplicate.
- Sales rep sets quantity to 0: treat as remove (with confirmation or just remove).
- Very large basket (50+ items): basket view must scroll, checkout button stays visible (sticky footer).
- Basket is empty: show "Ihr Warenkorb ist leer" with a link back to search.

---

## Tech Design (Solution Architect)

### Overview
The `useBasket` hook from OPH-76 already has all operations. The challenge is sharing state across the app (search adds items, header shows count, basket page shows list). The solution is converting the local hook into a React Context so all three read from the same state.

---

### A) Basket Context Architecture

```
sf/[slug]/layout.tsx      (server component — stays server-side for tenant resolution)
  └── BasketProvider       (NEW client wrapper — holds shared basket state)
       ├── SalesforceHeader  (MODIFY — reads itemCount, shows badge + link to /basket)
       └── {children}        (search page + basket page both read from same context)
```

---

### B) Component Structure

```
SalesforceHeader (MODIFY)
+-- IDS.online logo (left)
+-- [basket icon + count badge]  ← NEW, navigates to /basket
+-- Tenant logo + logout (right)

sf/[slug]/basket/page.tsx (NEW)
+-- BasketView (NEW client component)
    +-- "3 Artikel" total count
    +-- Scrollable basket item list
    |   +-- BasketItemRow: article number, name, [-][qty][+], [×] remove
    +-- Empty state: "Ihr Warenkorb ist leer" + link back to search
    +-- Sticky footer
        +-- [Warenkorb leeren] (AlertDialog confirmation)
        +-- [Zur Kasse →] (disabled when empty, links to /checkout in OPH-78)
```

---

### C) Data Model

In-memory React Context state only — no server calls, no database. Clears on tab close (acceptable for MVP per spec).

```
BasketItem: { article: ArticleCatalogItem, quantity: number }
Basket: { items: BasketItem[], itemCount: number (sum of quantities) }
```

---

### D) Files Changed

| File | Change |
|---|---|
| `src/components/salesforce/basket-provider.tsx` | NEW: React Context holding basket state |
| `src/hooks/use-basket.ts` | MODIFY: Convert from local state to context consumer |
| `src/app/sf/[slug]/layout.tsx` | MODIFY: Wrap children with `<BasketProvider>` |
| `src/components/salesforce/salesforce-header.tsx` | MODIFY: Add basket icon + count badge + link to `/basket` |
| `src/app/sf/[slug]/basket/page.tsx` | NEW: Basket route |
| `src/components/salesforce/basket-view.tsx` | NEW: Basket list, quantity controls, sticky footer |

---

### E) No New Dependencies

React Context is built-in. All UI uses existing shadcn/ui: `Button`, `Badge`, `Input`, `AlertDialog`.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
