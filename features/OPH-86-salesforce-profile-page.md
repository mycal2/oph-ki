# OPH-86: Salesforce App — Sales Rep Profile Page

## Status: Planned
**Created:** 2026-04-18
**Last Updated:** 2026-04-18
**PRD:** [Salesforce App PRD](../docs/AD-PRD.md)

## Dependencies
- OPH-75 (SF-4): Magic Link Authentication — user must be logged in
- OPH-80 (SF-9): Order Submission — orders must exist to show history
- OPH-81 (SF-10): Order History — order list component reused below the profile info
- OPH-85: Header User Identity — the dropdown navigation that links to this page

## User Stories
- As a sales rep, I want to see my profile page with my first name, last name, and email address so that I can verify my account details.
- As a sales rep, I want to see my order history below my profile info so that I can review past orders without navigating to a separate page.
- As a sales rep, I want to tap an order in the list to see its full details so that I can check what was submitted.

## Acceptance Criteria
- [ ] The profile page is accessible at `{slug}.ids.online/profile` (or equivalent route under the SF layout).
- [ ] The page shows a profile section at the top with: first name, last name, and email address.
- [ ] Below the profile section, the full order history list is shown — identical to OPH-81's order list (date, dealer, item count, status badge), sorted newest first.
- [ ] Tapping an order in the list navigates to the order detail page (OPH-81).
- [ ] The profile section shows "—" for missing name fields (e.g. if only first name is set).
- [ ] The page uses the standard Salesforce App layout (header, scroll content, no sticky footer needed).

## Edge Cases
- Sales rep has no past orders: the order history section shows "Noch keine Bestellungen" with a CTA to start a new order.
- Profile data fails to load: show an error state with a retry option; do not show partial data.
- Sales rep has many orders: the order list is paginated (reuses OPH-81 pagination logic).
- Email address is very long: truncate with ellipsis or wrap gracefully.

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
