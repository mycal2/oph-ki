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

| Priority | Feature | Description |
|----------|---------|-------------|
| P0 | SF-1: Per-Tenant Subdomain Routing & Layout | Wildcard `*.ids.online` routing. Middleware resolves subdomain slug → tenant. Salesforce App layout with IDS.online logo + tenant manufacturer logo. |
| P0 | SF-2: Sales Rep Role & Tenant Feature Flag | New `sales_rep` role. Platform admin toggle to enable Salesforce App per tenant. `salesforce_slug` field on tenant config. |
| P0 | SF-3: Sales Rep User Management in OPH | Tenant admin can add/remove/manage sales rep users. Separate section in OPH, only visible when Salesforce App is enabled for the tenant. |
| P0 | SF-4: Magic Link Authentication | Sales reps log in via email magic link at `{slug}.ids.online`. No password needed. Only sales reps belonging to the resolved tenant can authenticate. |
| P0 | SF-5: Article Search & Browse | Full-text search across all article catalog fields for the resolved tenant. Prominent search bar, mobile-optimized results. |
| P0 | SF-6: Shopping Basket | Add articles with quantities, adjust amounts, remove items. Persistent during session. Visible item count badge. |
| P0 | SF-7: Checkout — Dealer Identification | Enter customer number (auto-recognize via tenant's customer catalog) → select from existing dealers → manual dealer entry fallback. |
| P0 | SF-8: Checkout — Delivery & Notes | Optional delivery address (different from dealer). Order-level notes field. |
| P0 | SF-9: Order Submission | Submit basket as OPH order. Source = "salesforce_app". Confidence score based on customer data completeness. |
| P1 | SF-10: Order History & Reorder | Sales rep sees own past orders with status. Copy past order into new basket for quick reorder. |

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
2. Enters email → receives magic link → taps to log in
3. Searches for article by name/number/keyword
4. Adds articles to basket, adjusts quantities
5. Taps "Zur Kasse" (Checkout)
6. Enters customer number → system recognizes dealer, shows dealer name
7. Optionally adds delivery address and/or notes
8. Submits order → confirmation screen with order summary
9. Order appears in OPH with 99% confidence

### Fallback: Unknown Customer Number
1. Steps 1-5 same as above
2. Customer number field is empty → system shows dealer selection dropdown
3. Sales rep selects a dealer from the list
4. Continues with optional delivery address and notes
5. Submits → order in OPH with 95% confidence (dealer identified)

### Fallback: Dealer Not in System
1. Steps 1-5 same as above
2. Customer number empty, dealer not in dropdown
3. Sales rep taps "Neuer Händler" and enters dealer details manually (company name, contact info)
4. Submits → order in OPH with LOW confidence (needs manual review for dealer assignment)

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
- OPH-51: Tenant Company Logo (manufacturer logo display)
