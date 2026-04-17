# OPH-78: Salesforce App — Checkout: Dealer Identification (SF-7)

## Status: Planned
**Created:** 2026-04-17
**Last Updated:** 2026-04-17
**PRD:** [Salesforce App PRD](../docs/AD-PRD.md)

## Dependencies
- OPH-77 (SF-6): Shopping Basket — checkout is entered from the basket
- OPH-46: Manufacturer Customer Catalog — customer number lookup
- OPH-3: Händler-Erkennung & Händler-Profile — dealer selection

## User Stories
- As a sales rep, I want to enter a customer number so that the system automatically identifies the dealer and I don't need to enter details manually.
- As a sales rep, I want to select a dealer from a list if I don't have the customer number so that I can still submit the order quickly.
- As a sales rep, I want to enter dealer details manually if the dealer is not in the system so that I can place orders for new dealers.

## Acceptance Criteria
- [ ] Checkout page shows a customer number input field as the primary identification method.
- [ ] As the sales rep types a customer number, the system searches the tenant's customer catalog in real-time.
- [ ] If the customer number is recognized: show the matched dealer/customer name as confirmation. Sales rep can proceed.
- [ ] If the customer number is not recognized: show a message "Kundennummer nicht gefunden" and offer the dealer selection dropdown as a fallback.
- [ ] Dealer selection dropdown shows all dealers linked to the tenant, searchable by name.
- [ ] If the dealer is also not in the list: a "Neuer Händler" button reveals a manual entry form with fields: company name, contact person (optional), email (optional), phone (optional), address (optional).
- [ ] The checkout flow is a single page with progressive disclosure: customer number → dealer dropdown → manual entry (each fallback only shown when needed).
- [ ] The identified dealer info (however obtained) is shown as a summary card before proceeding to delivery/notes.

## Edge Cases
- Customer number matches multiple entries in the catalog: show all matches and let the sales rep pick one.
- Sales rep enters customer number, gets a match, then clears the field: reset to initial state.
- Tenant has no customer catalog entries: skip customer number step, go directly to dealer selection.
- Tenant has no dealers linked: skip dealer selection, go directly to manual entry.
- Sales rep starts typing in manual entry, then finds the dealer in the dropdown: switching back clears the manual entry form.

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
