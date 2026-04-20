# OPH-72: Salesforce App — Per-Tenant Subdomain Routing & Layout (SF-1)

## Status: Planned
**Created:** 2026-04-17
**Last Updated:** 2026-04-17
**PRD:** [Salesforce App PRD](../docs/SALESFORCE-PRD.md)

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

### Overview
OPH-72 creates the route structure and layout shell for the Salesforce App. The key technique is **URL rewriting** in middleware: when a request arrives at `meisinger.ids.online/basket`, middleware internally rewrites it to `/_sf/meisinger/basket` — the user's browser still shows `meisinger.ids.online/basket`, but Next.js serves the `/_sf/[slug]/basket` route.

---

### A) Component Structure

**New route group:**
```
src/app/_sf/[slug]/
  layout.tsx              ← Salesforce layout (resolves tenant from slug, renders header + branding)
  page.tsx                ← Placeholder home (future: SF-5 article search)
  login/
    page.tsx              ← Magic link login page (future: SF-4)
  not-found.tsx           ← "App nicht verfügbar" page

src/components/salesforce/
  salesforce-header.tsx   ← Mobile-first header: IDS.online logo (left) + tenant logo (right) + user menu
```

**Salesforce Header (mobile-first):**
```
+-------------------------------------------------------+
|  [IDS.online Logo]            [Tenant Logo]  [Avatar]  |
+-------------------------------------------------------+
```
- No sidebar (unlike OPH's AppLayout)
- Minimal, clean header — optimized for mobile
- Future: basket icon with count badge (SF-6) added here

**Salesforce Layout data flow:**
```
meisinger.ids.online/  →  Middleware rewrites to /_sf/meisinger/
                          →  layout.tsx reads slug = "meisinger"
                          →  Server query: tenants WHERE salesforce_slug = "meisinger" AND salesforce_enabled = true
                          →  Found: render layout with tenant branding
                          →  Not found: render "App nicht verfügbar" page
```

---

### B) Data Model

No new database tables or columns. Uses existing data:
```
From tenants table (added in OPH-73):
- salesforce_slug: "meisinger" (used to resolve subdomain → tenant)
- salesforce_enabled: true (checked before rendering)
- logo_url: "https://..." (displayed in the Salesforce header)
- name: "Meisinger" (shown in page title / meta)
```

---

### C) Tech Decisions

**Why URL rewriting instead of a separate app or route group detection?**
URL rewriting (`NextResponse.rewrite()`) is the cleanest approach in Next.js for subdomain routing. The user sees `meisinger.ids.online/basket` while Next.js internally serves `/_sf/meisinger/basket`. This means:
- The `[slug]` param gives every server component access to the tenant slug
- No custom headers, cookies, or context providers needed
- Standard Next.js dynamic routes — nothing unusual
- `/_sf/` routes are hidden from the OPH app (middleware blocks direct access)

**Why a separate layout instead of reusing AppLayout?**
The Salesforce App is mobile-first with no sidebar. OPH's `AppLayout` has a full sidebar, desktop-oriented navigation, and tenant admin features. A separate `salesforce-header.tsx` keeps the Salesforce UI lightweight and focused.

**Why resolve the tenant in the layout server component?**
The layout runs server-side on every navigation. It queries Supabase once to resolve the slug, checks `salesforce_enabled`, and renders the shell. If the tenant is disabled or not found, it shows a static error page — no sensitive data is leaked.

**Middleware changes (extend OPH-73):**
1. If `isSalesforceSubdomain` is true → rewrite URL from `/{path}` to `/_sf/{slug}/{path}`
2. Block direct access to `/_sf/` paths from non-Salesforce hosts (return 404)
3. OPH-73's existing role enforcement stays as-is (runs after rewrite for authenticated users)

**Vercel wildcard domain:**
Vercel Pro supports wildcard domains. Configure `*.ids.online` in the Vercel dashboard. SSL is auto-provisioned for all subdomains.

---

### D) Files Changed

| File | Change |
|------|--------|
| `src/app/_sf/[slug]/layout.tsx` | NEW: Salesforce layout — resolves tenant from slug, renders header |
| `src/app/_sf/[slug]/page.tsx` | NEW: Placeholder home page (will become article search in SF-5) |
| `src/app/_sf/[slug]/login/page.tsx` | NEW: Placeholder login page (will become magic link in SF-4) |
| `src/components/salesforce/salesforce-header.tsx` | NEW: Mobile-first header with IDS.online + tenant logo |
| `src/lib/supabase/middleware.ts` | MODIFY: Add URL rewrite for Salesforce subdomains, block direct `/_sf/` access |

### E) Dependencies
No new npm packages. Uses existing Next.js middleware, Supabase client, and Image component for logos.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
