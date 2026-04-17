# OPH-80: Salesforce App — Order Submission (SF-9)

## Status: Planned
**Created:** 2026-04-17
**Last Updated:** 2026-04-17
**PRD:** [Salesforce App PRD](../docs/AD-PRD.md)

## Dependencies
- OPH-78 (SF-7): Checkout — Dealer Identification
- OPH-79 (SF-8): Checkout — Delivery & Notes
- OPH-4: KI-Datenextraktion (canonical JSON format for extracted_data)

## User Stories
- As a sales rep, I want to review my complete order (articles, dealer, delivery, notes) before submitting so that I can catch mistakes.
- As a sales rep, I want to submit the order with one tap so that the process is fast and final.
- As a sales rep, I want to see a confirmation screen after submission so that I know the order was received.
- As a tenant user in OPH, I want Salesforce App orders to appear in my order list alongside email orders so that I have one unified workflow.

## Acceptance Criteria
- [ ] Before submission, a full order summary is shown: all line items (article number, name, quantity), dealer info, delivery address (if set), and notes (if set).
- [ ] A "Bestellung absenden" (Submit order) button is prominent and clearly labeled.
- [ ] On submission, the order is created in the `orders` table with `source = "salesforce_app"` and `submitted_by = user.id`.
- [ ] The `extracted_data` field is populated in the same canonical JSON format used by AI extraction (line_items, sender, order metadata).
- [ ] Confidence score is set based on dealer identification method: 99% (customer number matched), 95% (dealer selected), 60% (manual dealer entry), 40% (no customer data).
- [ ] After successful submission, a confirmation screen shows: order summary, order ID, and a "Neue Bestellung" (New order) button that resets the basket.
- [ ] The order appears in the OPH order list with source indicator "Salesforce App" and the correct confidence score.
- [ ] The order's `status` is set to `pending_review` (same as email-ingested orders).
- [ ] If submission fails (network error, server error): show error message, do NOT clear the basket, allow retry.

## Edge Cases
- Sales rep submits and immediately closes the browser: if the API call completed, the order is saved. If not, the basket is lost (session-based).
- Double-tap on submit button: prevent duplicate submissions (disable button after first tap, show loading state).
- Server returns a validation error (e.g. empty basket somehow): show the specific error, let the sales rep fix it.
- Very large order (100+ line items): submission may take a few seconds — show progress indicator.

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
