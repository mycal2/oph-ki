# OPH-72: Salesforce App — Per-Tenant Subdomain Routing & Layout (SF-1)

## Status: Planned
**Created:** 2026-04-17
**Last Updated:** 2026-04-17
**PRD:** [Salesforce App PRD](../docs/AD-PRD.md)

## Dependencies
- OPH-73 (SF-2): Sales Rep Role & Tenant Feature Flag — needs `salesforce_slug` and `salesforce_enabled` on tenant config

## User Stories
- As a sales rep, I want to access the Salesforce App via my manufacturer's subdomain (e.g. `meisinger.ids.online`) so that I have a branded, dedicated entry point.
- As a platform admin, I want unrecognized subdomains to show a "not found" page so that random subdomains don't expose any application UI.
- As a tenant admin, I want the Salesforce App to display the IDS.online logo alongside our company logo so that the app looks professional and branded.

## Acceptance Criteria
- [ ] Wildcard domain `*.ids.online` is configured on Vercel and routes to the Next.js app.
- [ ] Middleware extracts the subdomain from the `Host` header and looks up the `salesforce_slug` in the tenants table.
- [ ] If the subdomain matches a tenant with `salesforce_enabled = true`, the request proceeds to the Salesforce App route group.
- [ ] If the subdomain does not match any tenant, or the tenant has `salesforce_enabled = false`, a branded "Nicht gefunden" page is shown.
- [ ] The Salesforce App uses a separate layout (`src/app/(salesforce)/`) with its own header: IDS.online logo (left) + tenant company logo (right).
- [ ] OPH routes (`oph-ki.ids.online`, `oph-ki-dev.ids.online`, etc.) are unaffected by the wildcard routing.
- [ ] Reserved slugs (`www`, `api`, `app`, `admin`, `mail`, `oph-ki`, `oph-ki-dev`, `oph-ki-staging`) are blocked and never resolve to a tenant.

## Edge Cases
- Subdomain with uppercase letters or special characters: normalize to lowercase, reject invalid characters.
- Request to bare `ids.online` (no subdomain): route to existing OPH or a landing page, not Salesforce App.
- Tenant has a logo but it fails to load: show IDS.online logo only, no broken image.
- Multiple requests to the same subdomain: tenant resolution should be cached (e.g. in-memory or edge cache) to avoid a DB lookup on every request.

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
