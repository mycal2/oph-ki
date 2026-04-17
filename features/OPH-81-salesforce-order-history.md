# OPH-81: Salesforce App — Order History & Reorder (SF-10)

## Status: Planned
**Created:** 2026-04-17
**Last Updated:** 2026-04-17
**PRD:** [Salesforce App PRD](../docs/AD-PRD.md)

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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
