# OPH-85: Salesforce App — Header User Identity & Navigation Dropdown

## Status: Planned
**Created:** 2026-04-18
**Last Updated:** 2026-04-18
**PRD:** [Salesforce App PRD](../docs/AD-PRD.md)

## Dependencies
- OPH-75 (SF-4): Magic Link Authentication — user session required to read name
- OPH-81 (SF-10): Order History — dropdown links to order history page
- OPH-86: SF Sales Rep Profile Page — dropdown links to profile page

## User Stories
- As a sales rep, I want to see my first and last name in the Salesforce App header so that I always know which account I am logged in with.
- As a sales rep, I want to tap my name to open a dropdown menu so that I can quickly navigate to my profile or order history.
- As a sales rep, I want a "Profil" option in the dropdown so that I can view my account details.
- As a sales rep, I want a "Bestellhistorie" option in the dropdown so that I can quickly check my past orders.
- As a sales rep, I want a "Abmelden" (logout) option in the dropdown so that I can sign out from a single place.

## Acceptance Criteria
- [ ] The Salesforce App header displays the logged-in user's first and last name next to or in place of the logout button.
- [ ] The name is tappable and opens a dropdown menu.
- [ ] The dropdown contains three items: "Profil" (→ profile page, OPH-86), "Bestellhistorie" (→ orders page, OPH-81), and "Abmelden" (logout).
- [ ] The logout action in the dropdown works identically to the existing logout button.
- [ ] The existing standalone logout button in the header is replaced by the dropdown (no duplicate logout buttons).
- [ ] If the user's name cannot be loaded, the dropdown trigger shows the user's email address as a fallback.
- [ ] The dropdown is accessible on mobile (touch-friendly tap target, min 44×44px).

## Edge Cases
- User profile has only a first name (no last name): show first name only.
- User profile has neither first nor last name: fall back to email address.
- Name is very long (e.g. "Bartholomäus Schwarzenberger"): truncate with ellipsis on small screens (max ~20 chars visible).
- The profile page (OPH-86) or order history page (OPH-81) is not yet deployed: links still render, user reaches a 404 until those features are live.

---

## Tech Design (Solution Architect)

### Overview
OPH-85 is a frontend-only change. No new API routes, no new database tables. The user's first/last name is already stored in `user_profiles` — the layout just needs to fetch it alongside the tenant data it already loads, and pass it down to the header. In the header, the standalone logout button is replaced with a dropdown menu triggered by the user's name.

---

### A) Component Structure

```
src/app/sf/[slug]/layout.tsx  (MODIFY)
+-- Also fetch current user's first_name, last_name, email from user_profiles
+-- Pass userName (or fallback email) as a new prop to SalesforceHeader

src/components/salesforce/salesforce-header.tsx  (MODIFY)
+-- Accept new prop: userName (string | null)
+-- Remove standalone logout button
+-- Replace with: DropdownMenu triggered by user name
    +-- Trigger: "[First Last] ▾" (or email if name missing, truncated if long)
    +-- DropdownMenuItem: "Profil"          → /profile
    +-- DropdownMenuItem: "Bestellhistorie" → /orders
    +-- DropdownMenuSeparator
    +-- DropdownMenuItem: "Abmelden"        → existing logout logic
```

**Visual: Header after OPH-85**
```
┌─────────────────────────────────────────────┐
│  [IDS.online logo]     [🛒 3]  [Max M. ▾]  [logo] │
└─────────────────────────────────────────────┘

Dropdown (tapping "Max M. ▾"):
┌───────────────────┐
│  Profil           │
│  Bestellhistorie  │
│  ─────────────    │
│  Abmelden         │
└───────────────────┘
```

---

### B) Data Flow

```
layout.tsx (server component)
  ├── existing: tenant name, logo ← tenants table
  └── NEW: user name              ← user_profiles table (first_name, last_name)
                                     fallback: auth user email
        ↓
SalesforceHeader (client component)
  receives: tenantName, tenantLogoUrl, slug, userName
  renders: name dropdown (or email fallback)
```

The layout already runs on the server and already calls Supabase for tenant data. Adding a second lightweight query for the current user's profile adds negligible overhead.

---

### C) Tech Decisions

- **Why fetch name in the layout (server) rather than the header (client)?** The layout is already an async server component making a DB call. Fetching user profile there keeps the header a "dumb" display component — it receives data as props rather than making its own API calls. This is faster (no client-side fetch waterfall) and simpler.

- **Why use the existing `DropdownMenu` shadcn component?** It's already installed and handles keyboard navigation, focus trapping, and mobile touch correctly. No new packages needed.

- **Why replace the logout button rather than adding the dropdown alongside it?** The header is already tight on mobile. A name + dropdown consolidates identity + navigation + logout into one tappable element, which is standard mobile UX (like iOS/Android app headers).

- **Why truncate the name?** On 375px screens, a long name would push the basket icon and logo off screen. Truncating to ~20 chars keeps the layout stable.

---

### D) Fallback Chain for User Name

```
1. user_profiles.first_name + " " + user_profiles.last_name  (preferred)
2. user_profiles.first_name only (if no last name)
3. auth user email (if no name at all)
4. "Mein Konto" (if email is also unavailable — very unlikely)
```

---

### E) No New Dependencies
Uses existing: `DropdownMenu` (shadcn/ui, already installed), `createClient` (Supabase server client, already in layout).

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
