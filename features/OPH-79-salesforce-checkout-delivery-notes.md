# OPH-79: Salesforce App — Checkout: Delivery & Notes (SF-8)

## Status: Planned
**Created:** 2026-04-17
**Last Updated:** 2026-04-17
**PRD:** [Salesforce App PRD](../docs/AD-PRD.md)

## Dependencies
- OPH-78 (SF-7): Checkout — Dealer Identification — delivery step comes after dealer identification

## User Stories
- As a sales rep, I want to optionally add a delivery address that is different from the dealer's address so that orders can be shipped to an alternate location.
- As a sales rep, I want to add notes to the order so that I can communicate special instructions (e.g. "urgent", "deliver by Friday").
- As a sales rep, I want to skip both delivery address and notes if they're not needed so that the checkout stays fast.

## Acceptance Criteria
- [ ] After dealer identification, the checkout shows an optional "Abweichende Lieferadresse" (alternate delivery address) section, collapsed by default.
- [ ] Expanding the delivery address section shows fields: company name, street, zip code, city, country (defaulting to Deutschland).
- [ ] An order-level "Bemerkungen" (notes) text field is shown, optional, with a placeholder like "z.B. Dringend, Lieferung bis Freitag".
- [ ] Notes field has a reasonable max length (500 characters) with a character counter.
- [ ] Both sections can be left empty — they are purely optional.
- [ ] A "Weiter zur Zusammenfassung" (Continue to summary) button proceeds to the order review/submission step.

## Edge Cases
- Sales rep enters a partial delivery address (e.g. only city, no street): allow it — the back office can follow up.
- Notes contain special characters or line breaks: preserve formatting.
- Sales rep goes back from this step to change the dealer: delivery and notes inputs are preserved.

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
