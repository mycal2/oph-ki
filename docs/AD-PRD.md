# Salesforce App — Product Requirements Document

> Child PRD of the [Order Intelligence Platform (OPH)](./PRD.md)

## Vision

Eine mobile-optimierte Bestell-App für den Außendienst von Dentalprodukt-Herstellern, die handschriftliche Bestellzettel und Foto-Uploads durch eine einfache, digitale Artikelsuche mit Warenkorb ersetzt. Bestellungen landen direkt im OPH-System als strukturierte Aufträge — ohne KI-Extraktion, mit hoher Datenqualität.

**Domain:** `{tenant-slug}.ids.online` (per-tenant subdomain, e.g. `meisinger.ids.online`)
**Interner Name:** Salesforce App

## Problem Statement

Manufacturer sales reps visit dealers and practices, take handwritten orders on paper, and send photos of those notes into OPH via email. This results in:
- Poor extraction quality (handwriting recognition is unreliable)
- Extra manual correction work for the back office
- Slow order processing (photo → email → extraction → review → export)
- No order confirmation for the sales rep

The Salesforce App gives sales reps a direct, structured input channel that bypasses AI extraction entirely.

## Target Users

### Primary: Außendienst-Mitarbeiter (Sales Reps)
- Visit dealers and dental practices in the field
- Need to enter orders quickly, often on mobile (phone or tablet)
- May not know the customer number by heart
- Not technical users — UI must be extremely simple
- Often have limited time at the point of order entry

### Secondary: Mandanten-Admins (Tenant Admins)
- Manage sales rep user accounts within OPH
- Need visibility into which sales reps are active
- Receive orders from both email and Salesforce App in the same OPH workflow

### Tertiary: Plattform-Admins
- Enable/disable the Salesforce App feature per tenant
- Configure the tenant's subdomain slug
- Monitor Salesforce App usage across tenants

## Core Features (Roadmap)

### P0 — MVP (Core Order Flow)

| ID | Feature | OPH ID | Status |
|----|---------|--------|--------|
| SF-1 | Per-Tenant Subdomain Routing & Layout | OPH-72 | In Review |
| SF-2 | Sales Rep Role & Tenant Feature Flag | OPH-73 | In Progress |
| SF-3 | Sales Rep User Management in OPH | OPH-74 | In Review |
| SF-4 | Magic Link Authentication | OPH-75 | In Progress |
| SF-5 | Article Search & Browse | OPH-76 | In Progress |
| SF-6 | Shopping Basket | OPH-77 | In Review |
| SF-7 | Checkout — Dealer Identification | OPH-78 | In Review |
| SF-8 | Checkout — Delivery & Notes | OPH-79 | In Review |
| SF-9 | Order Submission | OPH-80 | In Review |

### P1 — Post-MVP (History, Identity, Admin)

| ID | Feature | OPH ID | Status |
|----|---------|--------|--------|
| SF-10 | Order History & Reorder | OPH-81 | In Progress |
| SF-11 | Außendienstler Menu in Stammdaten Sidebar | OPH-82 | In Review |
| SF-12 | Sales Rep Identity on OPH Orders | OPH-83 | In Review |
| SF-13 | Magic Link Domain Validation | OPH-84 | In Progress |
| SF-14 | Header User Identity & Navigation Dropdown | OPH-85 | In Progress |
| SF-15 | Sales Rep Profile Page | OPH-86 | In Review |
| SF-16 | Personalized Login Page | OPH-87 | In Progress |
| SF-17 | Order History Search & Date Filter | OPH-88 | In Review |
| SF-18 | Außendienstler Edit Name & Status | OPH-89 | In Review |

### P1 Feature Descriptions

- **SF-10: Order History & Reorder** — Sales rep sees own past orders with status badges (Eingereicht, In Prüfung, Exportiert). Tap to view details. "Nachbestellen" copies all line items into a new basket. Paginated (20 per page).
- **SF-11: Außendienstler Menu** — Adds "Außendienstler" entry under the Stammdaten sidebar section in OPH, visible only when Salesforce App is enabled for the tenant.
- **SF-12: Sales Rep Identity on OPH Orders** — Orders from the Salesforce App show the submitting sales rep's name in the OPH order list and detail view (with a Smartphone icon).
- **SF-13: Magic Link Domain Validation** — Server-side validation that the sales rep's email domain matches the tenant's `allowed_email_domains`. Prevents magic link abuse from unauthorized email addresses.
- **SF-14: Header User Identity** — The Salesforce App header shows the logged-in sales rep's name with a dropdown menu (Profil, Bestellhistorie, Abmelden).
- **SF-15: Profile Page** — Sales rep can view their profile (name, email) at `{slug}.ids.online/profile`. Order history is embedded below the profile card.
- **SF-16: Personalized Login Page** — Tenant logo at the top, cookie-based returning user greeting ("Hallo Max Muster, willkommen bei der Meisinger Bestellplattform."). First-time visitors see a generic welcome.
- **SF-17: Order History Search & Date Filter** — Search by dealer name or customer number, date filter presets (Alle, Dieser Monat, Letzte 3 Monate, Dieses Jahr). Server-side search with debounce.
- **SF-18: Außendienstler Edit Name** — Tenant admin and platform admin can edit a sales rep's first and last name from the Außendienstler management page. Activate/deactivate via dropdown.

## Per-Tenant Subdomain Architecture

Each tenant that has the Salesforce App enabled gets a unique subdomain:

```
meisinger.ids.online    → Tenant "Meisinger" (slug: "meisinger")
voco.ids.online         → Tenant "VOCO" (slug: "voco")
vita.ids.online         → Tenant "VITA" (slug: "vita")
```

### How it works:
1. **DNS:** Wildcard `*.ids.online` points to the Vercel deployment
2. **SSL:** Wildcard certificate covers all subdomains
3. **Middleware:** Extracts subdomain from `Host` header → looks up `salesforce_slug` in tenants table
4. **Security:** Only `sales_rep` users whose `tenant_id` matches the resolved tenant can log in
5. **Isolation:** A sales rep from Meisinger visiting `voco.ids.online` cannot log in — the middleware rejects the auth attempt

### Tenant Configuration (in OPH Admin):
- `salesforce_enabled: boolean` — Feature flag (platform admin)
- `salesforce_slug: string` — Unique subdomain slug (platform admin, validated for uniqueness and URL-safety)

### Reserved/Blocked Slugs:
`www`, `api`, `app`, `admin`, `mail`, `smtp`, `ftp`, `staging`, `dev`, `oph-ki`, `oph-ki-dev`, `oph-ki-staging` — these cannot be used as tenant slugs.

## User Flows

### Happy Path: Order with Known Customer Number
1. Sales rep opens `meisinger.ids.online` on phone
2. Sees personalized greeting ("Hallo Max Muster, willkommen bei der Meisinger Bestellplattform.") with tenant logo
3. Enters email → receives magic link → taps to log in
4. Lands on article search page ("Bestellung aufgeben")
5. Searches for article by name/number/keyword
6. Adds articles to basket, adjusts quantities
7. Taps "Zur Kasse" (Checkout)
8. Enters customer number → system recognizes dealer, shows dealer name
9. Optionally adds delivery address and/or notes
10. Submits order → confirmation screen with order summary, basket cleared
11. Order appears in OPH with 99% confidence, tagged with the sales rep's name

### Fallback: Unknown Customer Number
1. Steps 1-7 same as above
2. Customer number field is empty → system shows dealer selection dropdown
3. Sales rep selects a dealer from the list
4. Continues with optional delivery address and notes
5. Submits → order in OPH with 95% confidence (dealer identified)

### Fallback: Dealer Not in System
1. Steps 1-7 same as above
2. Customer number empty, dealer not in dropdown
3. Sales rep taps "Neuer Händler" and enters dealer details manually (company name, contact info)
4. Submits → order in OPH with LOW confidence (needs manual review for dealer assignment)

### Returning User Login
1. Sales rep who has previously logged in opens `meisinger.ids.online`
2. Browser has `sf_user` cookie from last login → login page greets them by name
3. Enters email → magic link → back in the app in seconds

### Order History & Reorder
1. Sales rep taps their name in the header → selects "Bestellhistorie"
2. Sees list of past orders with status badges, sorted newest first
3. Searches by dealer name or filters by date range
4. Taps an order → sees full details (line items, dealer, delivery address, notes)
5. Taps "Nachbestellen" → articles copied into a new basket → continues with checkout

### Profile
1. Sales rep taps their name in the header → selects "Profil"
2. Sees their name, email, and recent order history below

## Confidence Score Logic

| Condition | Confidence | OPH Status |
|-----------|-----------|------------|
| Customer number recognized in tenant's customer catalog | 99% | Ready for review (pre-approved quality) |
| Dealer selected from existing dealers (no customer number) | 95% | Ready for review |
| Manual dealer entry (new dealer, no customer number) | 60% | Needs manual review (dealer assignment) |
| No customer data at all | 40% | Needs manual review |

## Architecture Decisions

### Same App, Different Subdomain
The Salesforce App lives in the same Next.js application as OPH. Per-tenant subdomain routing directs to a separate layout and route group (e.g. `src/app/(salesforce)/`). This means:
- Shared authentication (Supabase)
- Shared database (orders, articles, dealers, users)
- Shared deployment pipeline
- No code duplication for data models or API logic

### Role-Based Access & Subdomain Isolation
- `sales_rep` role users can ONLY access routes under the Salesforce App layout
- Middleware checks:
  - If subdomain matches a `salesforce_slug` → resolve tenant, enforce `sales_rep` role for that tenant only
  - If role is `sales_rep` and request is to OPH domain → redirect to tenant's Salesforce subdomain
  - If role is NOT `sales_rep` and request is to a Salesforce subdomain → reject
- This provides two layers of security: role-based AND subdomain-based tenant isolation

### Order Creation
Salesforce App orders are inserted into the same `orders` table with:
- `source: "salesforce_app"` (new enum value)
- `submitted_by: user.id` (the sales rep's user ID)
- `confidence_score` based on the logic above
- `extracted_data` pre-populated with structured basket data in the same canonical JSON format
- No `order_files` (no uploaded documents) — unless we add receipt photo upload later

## UI/UX Principles

- **Mobile-first:** Designed for phone screens (375px), works on tablet and desktop
- **Speed over features:** Every interaction should feel instant. Minimal taps to complete an order
- **Prominent search:** The search bar is the hero element, always visible
- **Clear basket state:** Item count badge always visible, easy to review/edit
- **Branding:** IDS.online logo (left) + manufacturer/tenant logo (right) in the header
- **Language:** German UI (matching OPH)

## Success Metrics
- Order entry time: < 3 minutes per order (from first search to submission)
- Adoption: > 50% of field orders via Salesforce App within 3 months of rollout per tenant
- Data quality: 99% confidence on orders with known dealers (no manual corrections needed)
- Zero handwritten orders for tenants with active Salesforce App

## Constraints
- **Online-only (MVP):** Requires internet connection. PWA/offline can be added later.
- **No pricing:** Articles are displayed without prices. Pricing is handled by the back office.
- **Existing article catalog:** Only works for tenants that have articles in the OPH article catalog.
- **Shared infrastructure:** Must not impact OPH performance or stability.
- **Vercel wildcard domain:** Requires Vercel Pro plan or higher for wildcard domain support.

## Non-Goals (MVP)
- Offline/PWA support
- Price display or order totals
- Direct ERP integration from Salesforce App (goes through normal OPH export)
- Sales rep analytics or reporting dashboard
- Push notifications
- Multi-language support (German only)
- Photo attachment to orders (e.g. shelf photos)
- Approval workflow before order reaches OPH

## Dependencies on OPH
- OPH-1: Multi-Tenant Auth (user management, roles)
- OPH-39: Manufacturer Article Catalog (article data source)
- OPH-46: Manufacturer Customer Catalog (customer number recognition)
- OPH-3: Händler-Erkennung & Händler-Profile (dealer selection)
- OPH-51: Tenant Company Logo (manufacturer logo display in header and login page)
- OPH-17: Allowed Email Domains (magic link domain validation)
