# OPH-75: Salesforce App — Magic Link Authentication (SF-4)

## Status: Planned
**Created:** 2026-04-17
**Last Updated:** 2026-04-17
**PRD:** [Salesforce App PRD](../docs/AD-PRD.md)

## Dependencies
- OPH-72 (SF-1): Subdomain Routing — login page lives under the Salesforce layout
- OPH-73 (SF-2): Sales Rep Role — auth must verify role and tenant match

## User Stories
- As a sales rep, I want to log in by entering my email and tapping a magic link so that I don't need to remember a password.
- As a sales rep, I want the login page to show my manufacturer's branding so that I know I'm on the right page.
- As a sales rep, I want to stay logged in on my phone so that I don't have to re-authenticate for every order.

## Acceptance Criteria
- [ ] The Salesforce App login page at `{slug}.ids.online` shows the tenant's logo, a welcome message, and an email input field.
- [ ] Sales rep enters email → system sends a magic link via Supabase Auth → sales rep taps link → logged in.
- [ ] After authentication, middleware verifies: (a) user has `sales_rep` role, (b) user's `tenant_id` matches the subdomain's tenant. Both must pass.
- [ ] If the email does not belong to a `sales_rep` user of this tenant, a generic "Zugang nicht möglich" message is shown (no information leakage about whether the email exists).
- [ ] The magic link redirects back to the same subdomain (`{slug}.ids.online`) after authentication, not to the OPH domain.
- [ ] Session persists across browser restarts (Supabase refresh token) so sales reps don't need to re-authenticate frequently.
- [ ] A "Abmelden" (logout) button is available in the Salesforce App header.

## Edge Cases
- Sales rep enters an email that exists in the system but belongs to a different tenant: generic rejection, no details revealed.
- Sales rep enters an email with `tenant_admin` role (not `sales_rep`): rejected at login.
- Magic link is opened on a different device than where the email was entered: should still work (Supabase handles this).
- Magic link expires (default Supabase expiry): show "Link abgelaufen, bitte erneut anfordern" message.
- Sales rep is deactivated between requesting the magic link and clicking it: login fails with "Zugang nicht möglich".

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
