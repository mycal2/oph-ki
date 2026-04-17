# OPH-80: Salesforce App — Order Submission (SF-9)

## Status: In Progress
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

### Overview
OPH-80 is step 3 of the 3-step checkout (OPH-78 → OPH-79 → OPH-80). Shows the full order summary (line items, dealer, delivery address, notes) and submits to the existing `POST /api/sf/orders` endpoint. On success, shows a confirmation screen with order ID and a "Neue Bestellung" button.

---

### A) Component Structure

```
sf/[slug]/checkout/confirm/page.tsx  (ALREADY EXISTS)
+-- Auth guard: redirect to /login if unauthenticated
+-- CheckoutConfirmStep (NEW client component)
    +-- Flow guard: redirect to /checkout if isDealerIdentified=false or basket empty
    +-- Step header: "Schritt 3 von 3: Bestätigung"
    +-- Progress bar / step indicator (3 steps)
    |
    +-- [REVIEW MODE]
    |   +-- Dealer summary card (name, number, method badge)
    |   +-- Delivery address card (only if set)
    |   +-- Notes card (only if set)
    |   +-- Line items list (article number, name, quantity badge)
    |   +-- Error alert (if submission failed)
    |   +-- Sticky footer: [← Zurück] + [Bestellung absenden] (disables on click)
    |
    +-- [SUCCESS MODE] (after submission)
        +-- Confirmation icon + heading
        +-- Order ID, article count, confidence score
        +-- [Neue Bestellung] button → clears basket + checkout, goes to home
```

---

### B) API Used

`POST /api/sf/orders` (already exists — built in OPH-80 backend)

Request body matches `sfOrderSubmitSchema`:
- `lineItems`: from BasketContext
- `dealer`: from CheckoutContext (customer_number/dropdown/manual)
- `deliveryAddress`: from CheckoutContext (OPH-79)
- `notes`: from CheckoutContext (OPH-79)

---

### C) Files Changed

| File | Change |
|---|---|
| `src/app/sf/[slug]/checkout/confirm/page.tsx` | ALREADY EXISTS: Auth guard + renders CheckoutConfirmStep |
| `src/components/salesforce/checkout-confirm-step.tsx` | NEW: Order review, submission, confirmation screen |

No new npm packages. No context changes needed.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
