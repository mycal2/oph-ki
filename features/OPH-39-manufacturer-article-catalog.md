# OPH-39: Manufacturer Article Catalog

## Status: Planned
**Created:** 2026-03-20
**Last Updated:** 2026-03-20

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) — tenant_admin and platform_admin roles
- Requires: OPH-8 (Admin: Mandanten-Management) — platform admin manages catalogs per tenant

## Overview
Each manufacturer (tenant) maintains a catalog of their own articles. This catalog is the authoritative source of manufacturer article numbers (Herst.-Art.-Nr.) and is used to match against dealer order line items during extraction (OPH-40). Tenant admins manage their own catalog; platform admins can manage catalogs for any tenant.

## User Stories
- As a tenant_admin, I want to view my article catalog in the Settings so that I have an overview of all registered articles.
- As a tenant_admin, I want to add individual articles via a form so that I can maintain the catalog without needing a CSV.
- As a tenant_admin, I want to edit and delete existing articles so that I can keep the catalog accurate and up to date.
- As a tenant_admin, I want to upload a CSV or Excel file to bulk-import articles so that I can populate the catalog quickly from existing data.
- As a tenant_admin, I want to download the current catalog as CSV so that I can edit it offline and re-import.
- As a platform_admin, I want to manage the article catalog for any tenant (via the Admin panel → Tenant detail) so that I can assist during onboarding.
- As a tenant_admin, I want to search and filter the article list so that I can quickly find a specific article.

## Acceptance Criteria
- [ ] A new "Artikelstamm" tab appears in Settings (for tenant_admin/tenant_user) and in the Admin panel under each tenant's detail sheet (for platform_admin)
- [ ] The article table shows: Herst.-Art.-Nr., Artikelbezeichnung, Kategorie, Farbe/Shade, Verpackung, Ref.-Nr., GTIN, Suchbegriffe (keywords)
- [ ] Tenant admin can add a single article via a form dialog with all fields
- [ ] Tenant admin can edit any article via the same form dialog
- [ ] Tenant admin can delete an article with a confirmation dialog
- [ ] Tenant admin can import articles via CSV or Excel file upload
  - [ ] Import shows a preview of parsed rows before confirming
  - [ ] Import reports how many rows were created / updated / skipped
  - [ ] Duplicate Herst.-Art.-Nr. within the same tenant are updated (upsert), not rejected
- [ ] Tenant admin can export the full catalog as CSV download
- [ ] The article list supports text search across article number, name, and keywords
- [ ] Platform admin can access and manage catalogs for any tenant in the Admin panel
- [ ] RLS ensures tenants can only see and modify their own articles
- [ ] All fields except Herst.-Art.-Nr. and Artikelbezeichnung are optional
- [ ] Herst.-Art.-Nr. is unique per tenant (duplicate within same tenant → upsert on import, error on manual form)

## Article Fields

| Field | German label | Required | Notes |
|-------|-------------|----------|-------|
| `article_number` | Herst.-Art.-Nr. | Yes | Unique per tenant |
| `name` | Artikelbezeichnung | Yes | Full product name |
| `category` | Kategorie | No | e.g. "Komposit", "Abdruckmaterial" |
| `color` | Farbe / Shade | No | e.g. "A1", "A2", "Universal" |
| `packaging` | Verpackungseinheit | No | e.g. "10 Stk.", "1 Pkg. à 50" |
| `ref_no` | Ref.-Nr. | No | Catalog or reference number |
| `gtin` | GTIN / EAN | No | Barcode for dealer cross-reference |
| `keywords` | Suchbegriffe / Aliase | No | Comma-separated list of alternate names, translations, dealer-specific names |

## CSV Import Format
- First row = header row (column names matched case-insensitively)
- Accepted column names map to the fields above (German and English labels accepted)
- Rows with missing Herst.-Art.-Nr. or Artikelbezeichnung are skipped with a warning
- Encoding: UTF-8 (with BOM support for Excel exports)

## Edge Cases
- EC-1: Import file with 0 valid rows → show error, no changes made
- EC-2: Import file with duplicate Herst.-Art.-Nr. within the file itself → last row wins
- EC-3: Deleting an article that was used for a match in a past order → allow deletion, past orders are not affected (data is denormalized on extraction)
- EC-4: Tenant with 0 articles → show empty state with call to action to import or add
- EC-5: Platform admin imports for a tenant → same rules apply, scoped to that tenant
- EC-6: Very large catalog (5,000+ rows) → import must not time out; show progress indicator
- EC-7: Article number already exists on manual add → show inline error "Artikel-Nr. bereits vorhanden"
