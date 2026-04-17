# OPH-76: Salesforce App — Article Search & Browse (SF-5)

## Status: Planned
**Created:** 2026-04-17
**Last Updated:** 2026-04-17
**PRD:** [Salesforce App PRD](../docs/AD-PRD.md)

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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
