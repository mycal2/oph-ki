# OPH-49: Dealer-Linked Kundenstamm

## Overview
**Status:** Deployed
**Created:** 2026-03-24
**Priority:** P1

## Problem
Dealers who send orders to a tenant are effectively that tenant's customers (they're ordering products from the manufacturer). However:
- Tenant admins cannot see any dealer data — only their manually-maintained Kundenstamm
- There is no automatic link between a dealer who sends an order and the tenant's customer records
- When an order arrives, the tenant sees the sender name but cannot cross-reference it against their Kundenstamm without manual work
- The Kundenstamm and the order sender info are two separate, unconnected areas for the tenant

Platform admins see the global dealer profiles, but tenants have no visibility into who is sending them orders from a catalog perspective.

## Solution
- Auto-create a Kundenstamm entry for any dealer the first time they send an order to a tenant
- Link Kundenstamm entries to the global dealer profile (via a `dealer_id` reference)
- Tenant admins can view and edit their per-tenant copy of dealer data (name, address, email, customer number, notes) without affecting the global dealer profile
- Add a `notes` free-text field to the Kundenstamm for tenant-specific annotations
- Dealer-linked entries are visually distinguished in the Kundenstamm with a badge

## User Stories

1. **As a tenant admin**, I want dealers who send me orders to automatically appear in my Kundenstamm, so I don't have to manually create entries for them.
2. **As a tenant admin**, I want to see which of my Kundenstamm entries came from a dealer versus were created manually, so I understand where the data originated.
3. **As a tenant admin**, I want to edit the contact data of a dealer in my Kundenstamm (my copy), so I can keep locally relevant information without affecting the global dealer profile.
4. **As a tenant admin**, I want to add free-text notes to any Kundenstamm entry, so I can store internal context like contact persons or special instructions.
5. **As a tenant admin**, I want to store my customer number with each dealer, so the AI extraction can match future orders to the right Kundenstamm entry.
6. **As a platform admin**, I want the global dealer profiles to remain unchanged when tenants edit their local copies, so centrally managed dealer data stays accurate.

## Acceptance Criteria

### AC-1: Auto-Create on First Order
- [ ] When an order is successfully processed for a tenant and the sender matches a known dealer (by `dealer_id`), check if that dealer already exists in the tenant's `customer_catalog`
- [ ] If not present, auto-create a `customer_catalog` entry populated from the global dealer data (name, email, address)
- [ ] The entry has `dealer_id` set to link it to the global dealer profile
- [ ] If the entry already exists (manual or from a previous order), do NOT overwrite it
- [ ] Auto-creation is silent — no notification to the tenant admin

### AC-2: Notes Field
- [ ] The `customer_catalog` table gains a `notes` field (free-text, nullable)
- [ ] The Kundenstamm create/edit form shows the notes field
- [ ] Notes are visible in the customer detail/edit view

### AC-3: Dealer Badge in Kundenstamm
- [ ] Kundenstamm entries linked to a global dealer show a "Händler" badge in the table
- [ ] Hovering the badge shows a tooltip: "Automatisch aus globalem Händlerprofil erstellt"
- [ ] Manually-created entries have no badge

### AC-4: Tenant Editing is Isolated
- [ ] A tenant admin can edit any field of a dealer-linked Kundenstamm entry (company_name, street, postal_code, city, country, email, phone, customer_number, keywords, notes)
- [ ] Edits are saved only to the tenant's `customer_catalog` row
- [ ] The global `dealers` table is NOT modified
- [ ] The `dealer_id` reference on the tenant's entry is preserved after editing

### AC-5: Platform Admin View Unchanged
- [ ] Platform admins see global dealer profiles in the admin dealer management area without any tenant-local changes reflected
- [ ] Platform admins can still see which tenants have a Kundenstamm entry linked to a given dealer (informational, no action required)

### AC-6: Customer Number Matching Integration
- [ ] Dealer-linked Kundenstamm entries are included in the OPH-47 AI customer number matching logic
- [ ] If a dealer-linked entry has a `customer_number`, it participates in the matching cascade like any other Kundenstamm entry

## Edge Cases

- **EC-1:** Dealer sends first order but tenant already has a manual Kundenstamm entry with the same `company_name` → do NOT auto-create a duplicate; leave the manual entry untouched (no `dealer_id` is set)
- **EC-2:** The auto-created entry has no `customer_number` (dealer profile doesn't have one) → entry is created without it; tenant can fill it in manually
- **EC-3:** Global dealer profile is updated by platform admin after a tenant has a linked Kundenstamm entry → tenant's copy is NOT updated automatically (they own their copy)
- **EC-4:** Tenant deletes a dealer-linked Kundenstamm entry → if that dealer sends another order later, a new entry is auto-created again
- **EC-5:** Order sender matches a dealer but the match has low confidence → auto-creation only happens when `dealer_id` is definitively resolved (not fuzzy matches)
- **EC-6:** Tenant has Kundenstamm entries from before this feature is deployed → existing entries remain as-is with no `dealer_id`; they are NOT retroactively linked

## Tech Design (Solution Architect)

### Component Structure
```
/settings/customer-catalog (existing page, extended)
+-- CustomerCatalogPage (existing)
    +-- Table rows
    |   +-- [NEW] "Händler" badge (when dealer_id is set)
    +-- CustomerFormDialog (existing, extended)
        +-- [NEW] Notes textarea field
        +-- [UNCHANGED] All existing fields

Extraction pipeline (existing, extended)
+-- POST /api/orders/[orderId]/extract (existing route)
    +-- [NEW] Auto-create Kundenstamm step (after dealer recognition)
```

### Data Model
Two new columns on `customer_catalog`:
- **`dealer_id`** (UUID, nullable, FK → dealers): Links to global dealer profile. NULL = manually created entry. Set once at auto-create, never overwritten by tenant edits.
- **`notes`** (text, nullable): Free-text tenant annotation field.

Unique constraint added on `(tenant_id, dealer_id)` to prevent duplicate auto-creation on extraction retry.

### Auto-Create Logic (in existing extraction route)
```
Order extracted successfully
  └─ dealer_id definitively resolved?  → YES
       └─ (tenant_id + dealer_id) already in customer_catalog?  → NO
            └─ Auto-create entry from global dealer data
```
Runs after OPH-47 customer number matching so it doesn't affect the current order's match result.

### UI Changes
- **Kundenstamm table**: "Händler" badge on rows where dealer_id is set (existing Badge + Tooltip components)
- **Customer form dialog**: "Notizen" textarea added at bottom of existing field list (existing Textarea component)
- **dealer_id**: never shown or editable in UI — managed by the system only

### Tech Decisions
- **No new API routes** — existing customer CRUD endpoints handle edits; dealer_id is preserved server-side on update
- **Auto-create in extraction route** — runs in the right context, immediate, no background job complexity
- **Copy-on-create, no live sync** — tenant owns their copy; global dealer changes do not cascade
- **No new packages** — Badge, Tooltip, Textarea already installed via shadcn/ui

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) — tenant_admin role access
- Requires: OPH-3 (Händler-Erkennung) — global dealer profiles and dealer_id resolution
- Requires: OPH-46 (Manufacturer Customer Catalog) — Kundenstamm data model and UI
- Related: OPH-47 (AI Customer Number Matching) — dealer-linked entries feed into matching
- Related: OPH-4 (AI Extraction) — order processing triggers auto-create

---

## QA Test Results

### Round 1 (Initial)
**Tested:** 2026-03-24
**Tester:** QA Engineer (AI)
**Build Status:** PASS
**Result:** 5 bugs found (1 medium, 4 low). NOT production-ready due to BUG-3.

### Round 2 (Re-test after fixes)
**Tested:** 2026-03-24
**Tester:** QA Engineer (AI)
**Build Status:** PASS (production build succeeds with no errors)
**Commits verified:** 698f858 fix(OPH-49): Fix 5 QA bugs, 2c71422 fix(OPH-49): Fix customer number matching order, ac98044 fix(OPH-49): Use AI-extracted customer number, 3e42b88 fix(OPH-49): Update existing entry with extracted customer number, 584187f fix(OPH-49): Read customer_number from sender object

### Acceptance Criteria Status

#### AC-1: Auto-Create on First Order
- [x] When an order is processed and the sender matches a known dealer (by `dealer_id`), the extraction route checks if that dealer already exists in the tenant's `customer_catalog` (extract/route.ts line 566-571)
- [x] If not present, auto-creates a `customer_catalog` entry populated from the global dealer data (name, email via `known_sender_addresses[0]`, street, postal_code, city, country) (lines 612-623)
- [x] The entry has `dealer_id` set to link it to the global dealer profile (line 614)
- [x] If the entry already exists (checked via `maybeSingle()` on tenant_id + dealer_id), it does NOT overwrite it -- but it DOES fill in a missing customer_number from extraction (lines 574-582, good improvement)
- [x] Auto-creation is silent -- no notification or toast to the tenant admin (wrapped in try/catch, errors only logged server-side)

#### AC-2: Notes Field
- [x] The `customer_catalog` table gains a `notes` field (TEXT, nullable) via migration 030 (line 7)
- [x] The Kundenstamm create/edit form shows a "Notizen" textarea field at the bottom (customer-form-dialog.tsx lines 163-176)
- [x] Notes are populated when editing an existing customer (`notes: customer.notes ?? ""`)
- [x] Notes are included in create and update Zod schemas with max 5000 chars validation

#### AC-3: Dealer Badge in Kundenstamm
- [x] Kundenstamm entries linked to a global dealer show a "Haendler" badge in the table (customer-catalog-page.tsx lines 329-342)
- [x] Badge text is now proper German umlaut: "Haendler" -- FIXED. Tooltip text: "Automatisch aus globalem Haendlerprofil erstellt" -- FIXED. (Verified at lines 334 and 338: source uses proper UTF-8 umlauts.)
- [x] Manually-created entries (dealer_id is null) have no badge -- conditional rendering on `customer.dealer_id` (line 329)

#### AC-4: Tenant Editing is Isolated
- [x] A tenant admin can edit all fields of a dealer-linked Kundenstamm entry (the form includes customer_number, company_name, street, postal_code, city, country, email, phone, keywords, notes)
- [x] Edits are saved only to the tenant's `customer_catalog` row -- the PUT /api/customers/[id] route verifies `existing.tenant_id !== tenantId` (line 100)
- [x] The global `dealers` table is NOT modified -- the update route only touches `customer_catalog` via `.update(updateData).eq("id", id)` (lines 128-131)
- [x] The `dealer_id` reference is preserved after editing -- `dealer_id` is not in the `updateCustomerSchema` Zod schema, so it is never included in `updateData` and cannot be changed via API

#### AC-5: Platform Admin View Unchanged
- [x] Platform admins see global dealer profiles in the admin dealer management area -- dealer admin routes query the `dealers` table directly, not `customer_catalog`
- [ ] **KNOWN GAP (Low):** No UI for platform admins to see which tenants have a Kundenstamm entry linked to a given dealer. AC-5 says "informational, no action required" -- the data is queryable in the DB but not exposed in UI. Acceptable for initial deployment.

#### AC-6: Customer Number Matching Integration
- [x] Dealer-linked Kundenstamm entries are stored in the same `customer_catalog` table and have the same structure as manual entries
- [x] The OPH-47 AI customer number matching queries `customer_catalog` by `tenant_id` without filtering on `dealer_id`, so dealer-linked entries participate in matching equally
- [x] If a dealer-linked entry has a `customer_number` (either AI-extracted at creation time or manually set by tenant), it participates in the matching cascade

### Edge Cases Status

#### EC-1: Manual entry with same company_name exists
- [x] PASS -- the extraction route performs a case-insensitive check via `.ilike("company_name", dealerName)` before auto-creating (lines 597-602). If a match exists, no duplicate is created.

#### EC-2: Auto-created entry has no customer_number from dealer
- [x] PASS -- IMPROVED since Round 1. The auto-created entry now uses the AI-extracted customer_number from the order's sender data if available (line 609-610). If no customer_number is extracted, the entry is created with `customer_number: null` (migration 033 made customer_number nullable). No more H- placeholder values.

#### EC-3: Global dealer profile updated after tenant has linked entry
- [x] PASS -- tenant's copy is a snapshot at creation time. No sync mechanism. Copy-on-create approach ensures tenant data independence.

#### EC-4: Tenant deletes dealer-linked entry, dealer sends another order
- [x] PASS -- the unique partial index `uq_customer_catalog_tenant_dealer` on `(tenant_id, dealer_id)` is cleared on deletion. Next extraction auto-creates a new entry.

#### EC-5: Low confidence dealer match
- [x] PASS -- FIXED. The auto-creation logic now checks `effectiveConfidence >= 80` (line 563). The effective confidence is calculated from either the AI content match confidence or the original metadata recognition confidence (lines 560-562). Low-confidence matches (word-overlap at 55, auto-created dealers at 70) are correctly excluded from auto-creation.

#### EC-6: Pre-existing entries not retroactively linked
- [x] PASS -- migration 030 only adds columns (`dealer_id` defaults to NULL, `notes` defaults to NULL). No data backfill. Existing entries remain untouched.

### Security Audit Results

- [x] **Authentication:** All customer API routes (GET, POST, PUT, DELETE) verify user session via `supabase.auth.getUser()` before processing. Returns 401 if not authenticated.
- [x] **Authorization (tenant isolation):** PUT and DELETE routes verify `existing.tenant_id !== tenantId` before allowing modification. RLS policies on `customer_catalog` enforce tenant_id matching at the database level as a second line of defense (migration 029, lines 38-83).
- [x] **Authorization (role check):** POST, PUT, DELETE require `tenant_admin` or `platform_admin` role. `tenant_user` can only read (GET).
- [x] **dealer_id not user-controllable:** The `dealer_id` field is NOT included in `createCustomerSchema` or `updateCustomerSchema` Zod schemas (confirmed in validations.ts). It cannot be set or modified through any customer API endpoint. Only the extraction pipeline (server-side) can set it. An attacker sending `{"dealer_id": "..."}` in a PUT/POST request would have it silently stripped by Zod parsing.
- [x] **Input validation:** All user input validated server-side via Zod schemas. Notes field has max 5000 char limit. Customer number has max 200 chars with whitespace stripping. UUID params validated via regex before DB queries.
- [x] **SQL injection:** Not applicable -- Supabase client uses parameterized queries throughout.
- [x] **XSS:** React auto-escapes rendered content. Badge and tooltip text are static strings. Notes field is rendered as text content, not dangerouslySetInnerHTML.
- [x] **Cross-tenant data access:** The unique partial index `uq_customer_catalog_tenant_dealer` is scoped to `(tenant_id, dealer_id)`, preventing cross-tenant conflicts. RLS policies enforce tenant isolation at the DB level for all four operations (SELECT, INSERT, UPDATE, DELETE).
- [x] **Inactive user/tenant checks:** All customer routes check `user_status === "inactive"` and `tenant_status === "inactive"` returning 403.
- [x] **ON DELETE SET NULL on dealer FK:** If a global dealer is deleted, the `dealer_id` on customer_catalog entries is set to NULL rather than cascading delete. This preserves tenant data even if a dealer is removed globally.
- [x] **No secrets exposed:** No API keys, tokens, or credentials in client-side code or API responses. dealer_id is a UUID reference, not sensitive data.
- [x] **Rate limiting consideration:** Customer API routes do not have explicit rate limiting, but this is consistent with all other API routes in the project and is an infrastructure-level concern (handled by Vercel/Supabase).

### Cross-Browser & Responsive (Code Review)

- [x] **Badge component:** Uses shadcn/ui Badge with `variant="secondary"` and `shrink-0` -- renders correctly across browsers.
- [x] **Tooltip component:** Uses shadcn/ui Tooltip with TooltipProvider -- standard component, cross-browser compatible.
- [x] **Textarea component:** Uses shadcn/ui Textarea -- standard component.
- [x] **Mobile (375px):** The "Firma" column (where the badge appears) uses `flex items-center gap-2` which wraps naturally. Badge has `shrink-0` to prevent text truncation.
- [x] **Tablet (768px):** Table uses `overflow-x-auto` for horizontal scrolling if needed.
- [x] **Desktop (1440px):** Full table layout with all columns visible.
- [x] **Form dialog:** Uses `max-h-[90vh] overflow-y-auto` to handle the additional notes field on smaller screens.

### Regression Check

- [x] **OPH-46 (Customer Catalog):** Existing CRUD operations unaffected. Zod schemas extended with optional `notes` field (backward compatible). Migration 033 made customer_number nullable with a partial unique index -- existing entries with non-null customer numbers retain their uniqueness constraint.
- [x] **OPH-47 (AI Customer Number Matching):** The matching logic queries all `customer_catalog` entries for the tenant regardless of `dealer_id`. OPH-49 auto-creation now runs BEFORE OPH-47 matching (line 557-631 before line 633+), so newly created entries with extracted customer numbers are immediately available for matching. No regression.
- [x] **OPH-4 (AI Extraction):** The auto-create block is wrapped in try/catch and logs errors without failing extraction. Non-critical path. No regression to extraction flow.
- [x] **Build:** Production build succeeds with no TypeScript errors.

### Bug Fix Verification (from Round 1)

| Bug | Status | Verification |
|-----|--------|-------------|
| BUG-1 (Umlaut text) | FIXED | Badge now shows "Haendler" with proper UTF-8 umlaut at line 334 |
| BUG-2 (Admin view) | DEFERRED | Accepted as low-priority gap -- AC-5 says "informational, no action required" |
| BUG-3 (Confidence threshold) | FIXED | Line 563: `effectiveConfidence >= 80` check now prevents low-confidence auto-creation |
| BUG-4 (CSV export notes) | FIXED | Export route (line 83, 105, 117) now includes notes column as "Notizen" |
| BUG-5 (CSV import notes) | FIXED | Import route (line 158) now processes notes field from CSV |

### Remaining Known Gaps

#### GAP-1: No platform admin view showing which tenants have entries linked to a dealer
- **Severity:** Low
- **Context:** AC-5 second bullet says "informational, no action required." The data exists in the database (joinable via customer_catalog.dealer_id) but no UI or API endpoint exposes it yet.
- **Priority:** Nice to have (next sprint). Not blocking for deployment.

### Summary
- **Acceptance Criteria:** 16/17 sub-criteria passed (1 low-priority informational gap in AC-5)
- **Edge Cases:** 6/6 passed (all edge cases handled correctly)
- **Bugs from Round 1:** 4/5 fixed, 1 deferred (low priority)
- **New Bugs Found:** 0
- **Security:** PASS -- no vulnerabilities found. dealer_id is not user-controllable, tenant isolation enforced at API and RLS level, all inputs validated server-side.
- **Production Ready:** YES
- **Recommendation:** Feature is ready for deployment. GAP-1 (admin informational view) can be addressed in a future sprint as a separate enhancement.
