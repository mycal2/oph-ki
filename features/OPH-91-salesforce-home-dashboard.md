# OPH-91: Salesforce App Home Dashboard

## Status: Planned
**Created:** 2026-04-20
**Last Updated:** 2026-04-20

## Dependencies
- OPH-72: Per-Tenant Subdomain Routing & Layout (provides the SF layout, header, slug)
- OPH-75: Magic Link Authentication (user must be logged in)
- OPH-76: Article Search & Browse (moved to `/sf/[slug]/order`)
- OPH-81: Order History (linked from the dashboard tile)
- OPH-85: Header User Identity (user name for greeting)

## Problem Statement

The Salesforce App currently drops the sales rep directly into the article search on login. There is no welcoming home screen, no clear navigation starting point, and no way to reach the home page by tapping the logos in the header. Sales reps have no visual orientation about where they are or what they can do.

## User Stories

- As a **sales rep**, I want to see a welcoming home screen after login so that I know where I am and can quickly choose what to do.
- As a **sales rep**, I want to tap "Bestellung erfassen" to go directly to the article search so that I can start ordering immediately.
- As a **sales rep**, I want to tap "Meine Bestellungen" to go directly to my order history so that I can check the status of past orders.
- As a **sales rep**, I want the home screen to greet me by name so that the app feels personal.
- As a **sales rep**, I want to tap either logo (IDS.online or manufacturer) in the header to return to the home screen from any page.

## Acceptance Criteria

- [ ] The home page at `{slug}.ids.online` (i.e. `/sf/[slug]/`) is replaced by the new dashboard page.
- [ ] The dashboard shows a personal greeting: **"Hallo [Vorname]!"** using the logged-in sales rep's first name.
- [ ] The dashboard shows the tenant (manufacturer) logo prominently below the greeting.
- [ ] Two large clickable tiles are displayed:
  - **"Bestellung erfassen"** — navigates to the article search page (`/sf/[slug]/order`)
  - **"Meine Bestellungen"** — navigates to the order history page (`/sf/[slug]/orders`)
- [ ] The article search page moves from `/sf/[slug]/` to `/sf/[slug]/order`.
- [ ] The IDS.online logo in the header is a clickable link to the home page (`/sf/[slug]/`).
- [ ] The tenant logo in the header is a clickable link to the home page (`/sf/[slug]/`).
- [ ] The dashboard is mobile-first: tiles are displayed full-width on small screens, side-by-side on wider screens.
- [ ] If the user has no first name in their profile, the greeting falls back to: **"Willkommen!"**

## Edge Cases

- **No tenant logo configured:** The greeting and tiles are still shown without the logo; layout does not break.
- **User has no first name:** Greeting shows "Willkommen!" without a name.
- **User not authenticated:** Middleware already redirects to login — same behavior as today.
- **Navigating to `/sf/[slug]/` (old article search URL):** Now shows the dashboard — existing bookmarks to the home page are unaffected.
- **Navigating to `/sf/[slug]/order` (new article search URL):** Works correctly; old `/sf/[slug]/` bookmark no longer lands on article search.

## UI Description

```
┌─────────────────────────────────┐
│  [IDS Logo]    🛒  User ▾  [Logo] │  ← header (logos now clickable → home)
├─────────────────────────────────┤
│                                 │
│  [Manufacturer Logo]            │
│                                 │
│  Hallo Max!                     │
│  Willkommen bei der             │
│  Meisinger Bestellplattform.    │
│                                 │
│  ┌─────────────┐ ┌────────────┐ │
│  │  📦          │ │  📋        │ │
│  │  Bestellung  │ │  Meine     │ │
│  │  erfassen    │ │  Bestellun.│ │
│  └─────────────┘ └────────────┘ │
│                                 │
└─────────────────────────────────┘
```

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

```
/sf/[slug]/ — Home Dashboard (changed: was article search)
+-- SalesforceHomeDashboard (new component)
    +-- Tenant Logo (optional, shown prominently)
    +-- Greeting ("Hallo [Vorname]!")
    +-- Navigation Tiles (2 cards, side-by-side on desktop, stacked on mobile)
        +-- "Bestellung erfassen" → links to /sf/[slug]/order
        +-- "Meine Bestellungen" → links to /sf/[slug]/orders

/sf/[slug]/order/ — Article Search (new route, moved from /sf/[slug]/)
+-- ArticleSearch (existing component, no changes)

SalesforceHeader (updated — 2 small changes)
+-- IDS.online logo → becomes a link to /sf/[slug]/
+-- Tenant logo → becomes a link to /sf/[slug]/
```

### Data Model

No new data stored. The dashboard reads from existing sources:

```
Dashboard needs:
- User's first name    → already fetched in layout (user_profiles table)
- Tenant logo URL      → already fetched in layout (tenants table)
- Tenant name          → already fetched in layout (tenants table)

Approach: Home page server component re-fetches first_name + tenant logo
from the same tables the layout uses. Small fast queries — acceptable
duplication, no new infrastructure needed.
```

### Tech Decisions

- **New `/order` route for article search**: The existing URL `/sf/[slug]/` must become the dashboard. Article search moves to `/sf/[slug]/order`. This is a one-line page file — no logic changes to `ArticleSearch`.
- **No new API endpoints**: All data (user name, tenant logo) comes from existing DB queries the layout already performs.
- **Logo links in header**: Wrapping the existing `<Image>` tags in `<Link href={basePath}>` — a minimal two-line change per logo.
- **Mobile-first tiles**: Use shadcn `Card` components as large tappable tiles — consistent with the rest of the app's component library, no new dependencies.

### Touch Points (files to change)

| File | Change |
|---|---|
| `src/app/sf/[slug]/page.tsx` | Replace `ArticleSearch` with new `SalesforceHomeDashboard` |
| `src/app/sf/[slug]/order/page.tsx` | **New file** — renders `ArticleSearch` (moved from home) |
| `src/components/salesforce/salesforce-home.tsx` | **New component** — greeting + tiles |
| `src/components/salesforce/salesforce-header.tsx` | Wrap both logos in `<Link href={basePath}>` |

### No new dependencies needed.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
