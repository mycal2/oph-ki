# OPH-76: Salesforce App — Article Search & Browse (SF-5)

## Status: In Progress
**Created:** 2026-04-17
**Last Updated:** 2026-04-17
**PRD:** [Salesforce App PRD](../docs/SALESFORCE-PRD.md)

## Dependencies
- OPH-75 (SF-4): Magic Link Authentication — user must be logged in
- OPH-72 (SF-1): Subdomain Routing — tenant is resolved from subdomain
- OPH-39: Manufacturer Article Catalog — article data source

## User Stories
- As a sales rep, I want a prominent search bar on the home screen so that I can quickly find articles by typing a name, number, or keyword.
- As a sales rep, I want search results to appear instantly as I type so that I can find articles without waiting.
- As a sales rep, I want to see article details (article number, name, packaging, size) in the search results so that I can identify the correct product.
- As a sales rep, I want to search across all article fields (article number, name, GTIN, ref_no, keywords, packaging, size) so that I can find articles no matter what information I have.
- As a sales rep, I want to add an article to my basket directly from the search results so that the ordering flow is fast.

## Acceptance Criteria
- [ ] The Salesforce App home screen has a prominent search bar at the top, auto-focused on page load.
- [ ] Search queries are matched against all article catalog fields: `article_number`, `name`, `gtin`, `ref_no`, `keywords`, `packaging`, `size1`, `size2`.
- [ ] Search is debounced (300ms) and results update as the user types (minimum 2 characters).
- [ ] Results only show articles belonging to the authenticated user's tenant.
- [ ] Each result card shows: article number, name, packaging info, and an "Hinzufügen" (Add) button.
- [ ] Tapping "Hinzufügen" adds 1x of that article to the basket (with option to adjust quantity later).
- [ ] If no results match, a "Keine Artikel gefunden" message is shown.
- [ ] Search is case-insensitive and accent-insensitive.
- [ ] Results are paginated or lazy-loaded if there are many matches (> 20).

## Edge Cases
- Tenant has no articles in catalog: show a friendly "Noch keine Artikel vorhanden" message instead of the search bar.
- Very short search term (1 character): don't trigger search, show hint "Mindestens 2 Zeichen eingeben".
- Article already in basket: "Hinzufügen" button still works (adds another 1x, or increments quantity).
- Search with special characters (hyphens, dots, slashes in article numbers): must work correctly.
- Slow network: show loading indicator during search.

---

## Tech Design (Solution Architect)

### Overview
The Salesforce App home page (currently a placeholder) becomes a live article search page. The existing `/api/articles` endpoint is reused — it already handles auth, tenant scoping, and pagination for `sales_rep` users. One small extension: the current search covers 3 fields; spec requires all 8. The "Hinzufügen" button introduces a thin `useBasket` hook that OPH-77 will expand.

---

### A) Component Structure

```
sf/[slug]/page.tsx              ← MODIFY: Replace placeholder with <ArticleSearch />
  +-- ArticleSearch             ← NEW: Mobile-first search client component
      +-- Search bar (auto-focused)
      +-- Hint ("Mindestens 2 Zeichen eingeben") shown for 0–1 chars
      +-- Loading skeleton (while fetching)
      +-- ArticleResultCard (one per result)
      |     +-- Article number (bold) + name
      |     +-- Packaging / size details (muted text)
      |     +-- [Hinzufügen] button → calls useBasket().addToBasket(article)
      +-- "Keine Artikel gefunden" (empty search result)
      +-- "Noch keine Artikel vorhanden" (catalog is empty)
      +-- "Weitere laden" button (pagination, > 20 results)
```

---

### B) Files Changed

| File | Change |
|---|---|
| `src/app/sf/[slug]/page.tsx` | MODIFY: Render `<ArticleSearch />` instead of placeholder |
| `src/components/salesforce/article-search.tsx` | NEW: Mobile-first search UI with debounce + article result cards |
| `src/hooks/use-basket.ts` | NEW: Thin basket interface stub — `addToBasket(article)` + `itemCount`. OPH-77 expands this. |
| `src/app/api/articles/route.ts` | MODIFY: Extend search OR-filter to include `gtin`, `ref_no`, `packaging`, `size1`, `size2` |

---

### C) Basket Interface (stub for OPH-77)

`useBasket()` returns `addToBasket(article)` and `itemCount`. In OPH-76 this is a simple localStorage/in-memory store. OPH-77 expands it with quantity management, display, and checkout — no changes needed to the article card.

---

### D) Search Behaviour

| Input | Behaviour |
|---|---|
| 0–1 chars | No API call, hint shown |
| 2+ chars | API call after 300ms debounce |
| Typing | Loading skeleton shown |
| 0 results | "Keine Artikel gefunden" |
| Empty catalog | "Noch keine Artikel vorhanden" |
| > 20 results | "Weitere laden" pagination button |

---

### E) No New Dependencies

Debouncing via `useRef` + `setTimeout` (standard React). All UI: existing shadcn/ui `Input`, `Card`, `Button`, `Skeleton`.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
