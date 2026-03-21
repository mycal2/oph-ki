# OPH-39: Manufacturer Article Catalog

## Status: In Review
**Created:** 2026-03-20
**Last Updated:** 2026-03-21

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

## Tech Design (Solution Architect)

### Component Structure

```
Settings → "Artikelstamm" Tab (tenant_admin)
+-- ArticleCatalogPage
    +-- ArticleCatalogToolbar
    |   +-- Search Input
    |   +-- "Artikel hinzufügen" Button
    |   +-- "Importieren" Button (CSV/Excel)
    |   +-- "Exportieren" Button (CSV download)
    +-- ArticleCatalogTable
    |   +-- Columns: Herst.-Art.-Nr., Name, Kategorie, Farbe, Verpackung, Ref.-Nr., GTIN, Suchbegriffe
    |   +-- Per-row: Edit + Delete action buttons
    +-- Empty State (with import / add CTA)
    +-- ArticleFormDialog (Add / Edit, reused for both)
    +-- ArticleDeleteDialog (confirmation)
    +-- ArticleImportDialog
        +-- File drop zone (CSV / Excel)
        +-- Import Preview Table (parsed rows, errors highlighted)
        +-- Confirm Import Button
        +-- Import Result Summary (created / updated / skipped)

Admin Panel → Tenant Detail Sheet → "Artikelstamm" Tab (platform_admin)
+-- Same ArticleCatalogPage component, tenant_id injected from Admin context
```

### Database Table: `article_catalog`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key, auto-generated |
| `tenant_id` | UUID | Foreign key → tenants, RLS-enforced |
| `article_number` | text | Unique per tenant (Herst.-Art.-Nr.) |
| `name` | text | Required (Artikelbezeichnung) |
| `category` | text | Optional |
| `color` | text | Optional (Farbe/Shade) |
| `packaging` | text | Optional (Verpackungseinheit) |
| `ref_no` | text | Optional (Ref.-Nr.) |
| `gtin` | text | Optional (GTIN/EAN) |
| `keywords` | text | Optional, comma-separated aliases |
| `created_at` | timestamp | Auto |
| `updated_at` | timestamp | Auto |

**Unique constraint:** `(tenant_id, article_number)` — enforced at DB level.
**RLS:** Tenant users read/write only their own rows. Platform admin uses service role (bypasses RLS).
**Index:** on `tenant_id` for fast catalog lookups during AI matching (OPH-40).

### API Routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/articles` | List tenant articles (paginated, searchable) |
| POST | `/api/articles` | Create single article |
| PUT | `/api/articles/[id]` | Update single article |
| DELETE | `/api/articles/[id]` | Delete single article |
| POST | `/api/articles/import` | Bulk upsert from CSV/Excel |
| GET | `/api/articles/export` | Download full catalog as CSV |
| GET | `/api/admin/tenants/[id]/articles` | Platform admin: list any tenant's articles |
| POST | `/api/admin/tenants/[id]/articles/import` | Platform admin: bulk import for any tenant |

### Tech Decisions

- **`xlsx` package** (already installed) — parses both `.csv` and `.xlsx` files, consistent with existing dealer mappings import
- **Upsert on import** — tenant admins frequently re-export → edit → re-import; rejecting duplicates would break this workflow
- **Keywords as comma-separated text** — simpler than a join table; sufficient for full-text matching at the scale of a single tenant's catalog
- **Shared component for Settings + Admin** — same `ArticleCatalogPage` receives `tenantId` as a prop; no code duplication

### Dependencies

- `xlsx` — already installed, no new packages needed

---

## QA Test Results

**Tested:** 2026-03-21
**App URL:** http://localhost:3003
**Tester:** QA Engineer (AI)
**Build Status:** PASS (production build compiles without errors)

### Acceptance Criteria Status

#### AC-1: "Artikelstamm" tab appears in Settings (tenant_admin/tenant_user) and Admin panel (platform_admin)
- [x] Navigation link "Artikelstamm" is present at `/settings/article-catalog` for all logged-in users (not gated by `adminOnly`)
- [x] Admin panel tenant detail sheet includes an "Artikelstamm" tab (in `tenant-form-sheet.tsx`, only shown when `!isNew`)
- [ ] BUG: Settings page blocks `tenant_user` role with "Zugriff verweigert" message. The AC says the tab should appear for tenant_admin AND tenant_user. tenant_user should see the catalog in read-only mode. (See BUG-1)

#### AC-2: Article table shows all specified columns
- [x] Table headers include: Herst.-Art.-Nr., Artikelbezeichnung, Kategorie, Farbe, Verpackung, Ref.-Nr., GTIN, Suchbegriffe
- [x] Responsive column hiding: Kategorie hidden below md, Farbe/Verpackung hidden below lg, Ref.-Nr./GTIN/Suchbegriffe hidden below xl
- [x] Table has overflow-x-auto for horizontal scrolling on small screens

#### AC-3: Tenant admin can add a single article via form dialog
- [x] "Artikel hinzufuegen" button opens a dialog with all 8 fields
- [x] Required fields (Herst.-Art.-Nr., Artikelbezeichnung) are marked with asterisk
- [x] Form submits to POST /api/articles with Zod validation
- [x] Success closes dialog and shows toast notification
- [x] Error state displayed in dialog (e.g., duplicate article number returns 409)

#### AC-4: Tenant admin can edit any article via the same form dialog
- [x] Pencil icon button per row opens the edit dialog pre-populated with article data
- [x] PUT /api/articles/[id] validates ownership (tenant_id match) before updating
- [x] Duplicate article_number on update returns 409 with inline error

#### AC-5: Tenant admin can delete an article with confirmation dialog
- [x] Trash icon button opens AlertDialog with article number and name displayed
- [x] Confirmation message explains past orders are not affected
- [x] DELETE /api/articles/[id] validates ownership before deleting
- [x] Success closes dialog and refreshes list

#### AC-6: Tenant admin can import articles via CSV or Excel file upload
- [x] "Importieren" button opens import dialog with file drop zone
- [x] Accepts .csv, .xlsx, .xls files (validated on client and server)
- [x] File size limit: 10 MB (validated on client and server)
- [ ] BUG: Import does NOT show a preview of parsed rows before confirming. The spec says "Import shows a preview of parsed rows before confirming" but the dialog goes directly from file selection to uploading/result. (See BUG-2)
- [x] Import result shows created/updated/skipped counts with colored badges
- [x] Errors/warnings from import are listed in a scrollable area

#### AC-6a: Duplicate Herst.-Art.-Nr. within same tenant are updated (upsert)
- [x] Upsert uses `onConflict: "tenant_id,article_number"` with `ignoreDuplicates: false`
- [x] Created vs updated counting uses created_at/updated_at timestamp comparison (1 second tolerance)

#### AC-7: Tenant admin can export the full catalog as CSV download
- [x] "Exportieren" button triggers GET /api/articles/export
- [x] CSV uses semicolon separator with UTF-8 BOM for Excel compatibility
- [x] All 8 columns exported with German headers
- [x] Fields containing semicolons, quotes, or newlines are properly escaped
- [x] Export disabled when total is 0

#### AC-8: Article list supports text search across article number, name, and keywords
- [x] Search input with 300ms debounce implemented
- [x] Server-side search uses `ilike` on article_number, name, and keywords
- [x] Search resets to page 1
- [x] Search text displayed in article count ("X Artikel fuer ...")
- [x] Special characters (%, _) escaped in search queries

#### AC-9: Platform admin can access and manage catalogs for any tenant in Admin panel
- [x] Admin panel tenant detail sheet has "Artikelstamm" tab with `ArticleCatalogPage` receiving `adminTenantId`
- [x] GET /api/admin/tenants/[id]/articles uses `requirePlatformAdmin` auth check
- [x] Import via /api/admin/tenants/[id]/articles/import works with platform admin auth
- [x] Export via /api/admin/tenants/[id]/articles/export works with platform admin auth
- [ ] BUG: No POST handler on /api/admin/tenants/[id]/articles for creating single articles. Platform admin "Artikel hinzufuegen" will POST to the admin base URL but only GET is implemented -- results in 405. (See BUG-3)
- [ ] BUG: updateArticle and deleteArticle in the hook always use /api/articles/[id] (tenant endpoint) even when in admin mode. Since the tenant API checks article.tenant_id === user's own tenant_id, the platform admin cannot edit or delete articles for other tenants. (See BUG-4)

#### AC-10: RLS ensures tenants can only see and modify their own articles
- [x] RLS enabled on article_catalog table
- [x] SELECT policy: tenant_id matches JWT app_metadata.tenant_id
- [x] INSERT policy: tenant_id matches AND role is tenant_admin or platform_admin
- [x] UPDATE policy: tenant_id matches AND role is tenant_admin or platform_admin
- [x] DELETE policy: tenant_id matches AND role is tenant_admin or platform_admin
- [x] Note: API routes use adminClient (service role) which bypasses RLS, but API-level auth checks are in place

#### AC-11: All fields except Herst.-Art.-Nr. and Artikelbezeichnung are optional
- [x] Zod schemas mark category, color, packaging, ref_no, gtin, keywords as `.nullable().optional()`
- [x] Database schema allows NULL for all optional columns
- [x] Form dialog does not mark optional fields as required

#### AC-12: Herst.-Art.-Nr. is unique per tenant (duplicate -> upsert on import, error on manual form)
- [x] Database unique constraint: `article_catalog_tenant_article_unique (tenant_id, article_number)`
- [x] Manual create: 23505 error code caught and returns "Artikel-Nr. bereits vorhanden." (409)
- [x] Import: upsert on conflict updates existing row

### Edge Cases Status

#### EC-1: Import file with 0 valid rows
- [x] Returns 400 with error message "Keine gueltigen Zeilen gefunden"
- [x] No database changes made

#### EC-2: Import file with duplicate Herst.-Art.-Nr. within file itself
- [x] `parseArticleFile` uses a Map keyed by `articleNumber.toLowerCase()` -- last row wins
- [x] Correct behavior per spec

#### EC-3: Deleting article used for match in past order
- [x] Delete dialog mentions "Bereits verarbeitete Bestellungen sind davon nicht betroffen"
- [x] Hard delete with no foreign key dependency on orders (data denormalized on extraction)

#### EC-4: Tenant with 0 articles
- [x] Empty state shown with Package icon, descriptive text, and CTA buttons ("CSV/Excel importieren" and "Artikel hinzufuegen")
- [x] Search-specific empty state ("Fuer X wurden keine Artikel gefunden")

#### EC-5: Platform admin imports for a tenant
- [x] Admin import endpoint verifies tenant exists before processing
- [x] Same parse/upsert logic applied with target tenant_id from URL param

#### EC-6: Very large catalog (5,000+ rows)
- [x] Import uses batched upsert (UPSERT_BATCH_SIZE = 500)
- [x] Loading spinner shown during import
- [ ] BUG (Minor): No progress indicator for large imports -- spec says "show progress indicator" but dialog only shows a generic spinner. For 5,000+ rows in 10+ batches, user has no feedback on progress. (See BUG-5)

#### EC-7: Article number already exists on manual add
- [x] 409 response with "Artikel-Nr. bereits vorhanden." error message
- [x] Error shown in form dialog's alert area

### Security Audit Results

#### Authentication
- [x] All API endpoints verify user session via `supabase.auth.getUser()`
- [x] Unauthenticated requests return 401
- [x] Admin endpoints use `requirePlatformAdmin()` helper

#### Authorization
- [x] Inactive user (user_status === "inactive") returns 403
- [x] Inactive tenant (tenant_status === "inactive") returns 403
- [x] Users without tenant_id get 403
- [x] Create/update/delete restricted to tenant_admin and platform_admin roles
- [x] PUT and DELETE verify article.tenant_id matches user's tenant_id before proceeding (IDOR protection)
- [ ] BUG: GET /api/articles (list) has no role restriction -- tenant_user can read articles via API. This is arguably correct (read-only access for tenant_user) but contradicts the UI that blocks them entirely. (See BUG-1)

#### Input Validation
- [x] Zod validation on all create/update payloads
- [x] UUID regex validation on article ID and tenant ID path parameters
- [x] File extension validation on import
- [x] File size validation (10 MB limit)
- [x] Field length limits enforced: article_number (200), name (500), keywords (1000), others (200)
- [x] Search input has % and _ escaping to prevent LIKE injection
- [x] CSV field escaping in export (semicolons, quotes, newlines)

#### Data Leakage
- [x] Export endpoint scoped to tenant_id
- [x] List endpoint scoped to tenant_id
- [x] No sensitive data exposed in error messages

#### Rate Limiting
- [ ] No rate limiting on any article catalog endpoints. This is consistent with the rest of the application (no endpoints appear to have rate limiting), so not flagging as a new bug specific to OPH-39. Noted for awareness.

### Cross-Browser Testing
- Note: Code review based. No browser-specific APIs used. Standard HTML form elements, Tailwind CSS, shadcn/ui components. Uses standard `fetch` API. Drop zone uses standard drag events.
- [x] Chrome: Standard APIs, no compatibility concerns
- [x] Firefox: Standard APIs, no compatibility concerns
- [x] Safari: Standard APIs, no compatibility concerns

### Responsive Testing (Code Review)
- [x] 375px (Mobile): Search and buttons stack vertically via `flex-col gap-3 sm:flex-row`. Table columns progressively hidden. Action buttons use flex-wrap.
- [x] 768px (Tablet): Kategorie column visible (md breakpoint). Search + actions side by side.
- [x] 1440px (Desktop): All columns visible including Ref.-Nr., GTIN, Suchbegriffe (xl breakpoint).

### Bugs Found

#### BUG-1: tenant_user blocked from viewing article catalog
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Log in as a tenant_user (not tenant_admin)
  2. Navigate to /settings/article-catalog
  3. Expected: See the article catalog in read-only mode (no add/edit/delete buttons)
  4. Actual: See "Zugriff verweigert. Nur fuer Administratoren." message
- **Note:** The acceptance criteria says the tab should appear "for tenant_admin/tenant_user". The API GET endpoint correctly allows any authenticated tenant user to read articles. The page-level role check is too restrictive.
- **Priority:** Fix before deployment

#### BUG-2: Import does not show preview of parsed rows before confirming
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Open the import dialog
  2. Select a CSV or Excel file
  3. Click "Importieren"
  4. Expected: See a preview table of parsed rows with errors highlighted, then a "Confirm Import" button
  5. Actual: File is immediately uploaded and processed. Result summary shown only after import completes.
- **Note:** The acceptance criteria explicitly states "Import shows a preview of parsed rows before confirming" and the tech design includes an "Import Preview Table" component. This step was not implemented.
- **Priority:** Fix before deployment

#### BUG-3: Admin panel -- no POST endpoint for single article creation
- **Severity:** High
- **Steps to Reproduce:**
  1. Log in as platform_admin
  2. Go to Admin > Mandanten > open a tenant's detail sheet > "Artikelstamm" tab
  3. Click "Artikel hinzufuegen" and fill out the form
  4. Click "Hinzufuegen"
  5. Expected: Article is created for the selected tenant
  6. Actual: POST request to /api/admin/tenants/[id]/articles returns 405 Method Not Allowed because only GET is exported from that route file
- **Priority:** Fix before deployment

#### BUG-4: Admin panel -- edit and delete use wrong API endpoint
- **Severity:** High
- **Steps to Reproduce:**
  1. Log in as platform_admin
  2. Go to Admin > Mandanten > open a tenant's detail sheet > "Artikelstamm" tab
  3. Click the edit (pencil) icon on any article
  4. Modify any field and click "Speichern"
  5. Expected: Article is updated
  6. Actual: PUT request goes to /api/articles/[id] (tenant endpoint). This endpoint checks article.tenant_id against the platform admin's own tenant_id. If the admin's tenant_id differs from the target tenant, the request returns 403 "Keine Berechtigung fuer diesen Artikel."
- **Note:** Same issue affects DELETE. The hook's `updateArticle` and `deleteArticle` functions always use `/api/articles/${id}` regardless of `adminTenantId`. Either admin-specific PUT/DELETE endpoints are needed, or the existing endpoints need to be updated to allow platform_admin to act on any tenant's articles.
- **Priority:** Fix before deployment

#### BUG-5: No progress indicator for large imports
- **Severity:** Low
- **Steps to Reproduce:**
  1. Prepare a CSV with 5,000+ rows
  2. Open the import dialog and select the file
  3. Click "Importieren"
  4. Expected: Progress indicator showing batch progress (e.g., "Processing batch 3 of 10...")
  5. Actual: Only a generic spinner with "Datei wird importiert..." is shown
- **Note:** The spec says "show progress indicator" for large catalogs. Current implementation is functional but provides no progress feedback.
- **Priority:** Nice to have

### Summary
- **Acceptance Criteria:** 9/12 passed (3 have bugs)
- **Edge Cases:** 6/7 passed (1 has minor bug)
- **Bugs Found:** 5 total (0 critical, 2 high, 2 medium, 1 low)
- **Security:** Pass (no vulnerabilities found; auth and input validation are solid)
- **Production Ready:** NO
- **Recommendation:** Fix BUG-3 and BUG-4 (High) first -- platform admin cannot create/edit/delete articles for other tenants. Then fix BUG-1 and BUG-2 (Medium) -- tenant_user access and import preview. BUG-5 (Low) can be deferred.
