# OPH-49: Dealer-Linked Kundenstamm

## Overview
**Status:** Planned
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
