# OPH-74: Salesforce App — Sales Rep User Management in OPH (SF-3)

## Status: Planned
**Created:** 2026-04-17
**Last Updated:** 2026-04-17
**PRD:** [Salesforce App PRD](../docs/AD-PRD.md)

## Dependencies
- OPH-73 (SF-2): Sales Rep Role & Tenant Feature Flag — section only visible when `salesforce_enabled = true`
- OPH-1: Multi-Tenant Auth (user management foundation)

## User Stories
- As a tenant admin, I want a dedicated "Außendienst" section in OPH to manage my sales rep users separately from back-office users.
- As a tenant admin, I want to invite a new sales rep by entering their email address so that they receive a magic link to set up their account.
- As a tenant admin, I want to deactivate a sales rep so that they can no longer access the Salesforce App.
- As a tenant admin, I want to see a list of all sales rep users with their name, email, and status (active/inactive).

## Acceptance Criteria
- [ ] A new "Außendienst" navigation item appears in the OPH sidebar for tenant admins, ONLY when `salesforce_enabled = true` for their tenant.
- [ ] The Außendienst page shows a table of all `sales_rep` users belonging to the tenant: name, email, status, last login.
- [ ] "Einladen" button allows tenant admin to invite a new sales rep by email. The invited user is created with role `sales_rep`.
- [ ] Tenant admin can activate/deactivate a sales rep (toggle status).
- [ ] Tenant admin can resend the invite email for a pending sales rep.
- [ ] The user count in this section only shows `sales_rep` users, not `tenant_admin` or `tenant_user`.
- [ ] If the platform admin disables Salesforce App for the tenant, the "Außendienst" section disappears from the sidebar.

## Edge Cases
- Tenant admin tries to invite an email that already exists as a user in the system (different role or different tenant): clear error message.
- Tenant admin deactivates all sales reps: Außendienst section still visible (just empty list), Salesforce App returns "no active users" if someone tries to log in.
- Sales rep user is the only user with that email: deactivating them doesn't affect other tenants.
- Large number of sales reps (50+): paginated list.

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
