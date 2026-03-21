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

### Round 1 (2026-03-21)

**Tested:** 2026-03-21
**Tester:** QA Engineer (AI)
**Build Status:** PASS
**Bugs Found:** 5 (0 critical, 2 high, 2 medium, 1 low)
**Result:** NOT READY -- all 5 bugs fixed in commit 3b8992a

---

### Round 2 -- Re-test after fixes (2026-03-21)

**Tested:** 2026-03-21
**App URL:** http://localhost:3003
**Tester:** QA Engineer (AI)
**Build Status:** PASS (production build compiles without errors)
**Fix Commit:** 3b8992a ("fix(OPH-39): Fix all 5 QA bugs for article catalog")

### Bug Fix Verification

#### BUG-1 (Medium): tenant_user blocked from viewing article catalog -- FIXED
- `page.tsx` now checks for `tenant_user` role (line 23) and passes `readOnly={true}` to `ArticleCatalogPage`
- `ArticleCatalogPage` accepts `readOnly` prop and hides add/edit/delete/import buttons when true
- Empty state shows appropriate read-only message for tenant_user
- API GET endpoint was already permissive -- no API change needed
- **Status:** VERIFIED FIXED

#### BUG-2 (Medium): Import does not show preview before confirming -- FIXED
- `ArticleImportDialog` now implements a 4-step flow: select -> preview -> uploading -> result
- Step 1 (select): File selection with "Vorschau" button instead of "Importieren"
- Step 2 (preview): Client-side parsing via `parseFileForPreview()` shows a table of up to 10 rows (Herst.-Art.-Nr., Artikelbezeichnung, Kategorie), total valid count, skipped count, and parse warnings
- Step 3 (uploading): Shows "Importiere X Artikel..." during server processing
- Step 4 (result): Shows created/updated/skipped badges
- "Zurueck" button allows returning from preview to file selection
- Confirm button shows exact article count: "X Artikel importieren"
- Confirm button disabled when 0 valid articles
- **Status:** VERIFIED FIXED

#### BUG-3 (High): Admin panel -- no POST endpoint for single article creation -- FIXED
- `/api/admin/tenants/[id]/articles/route.ts` now exports both GET and POST handlers
- POST handler validates platform_admin role via `requirePlatformAdmin()`
- POST handler verifies tenant exists before creating article
- POST handler uses Zod validation and handles 23505 duplicate constraint
- Hook's `createArticle` correctly routes to admin base URL when `adminTenantId` is set
- **Status:** VERIFIED FIXED

#### BUG-4 (High): Admin panel -- edit and delete use wrong API endpoint -- FIXED
- New route file: `/api/admin/tenants/[id]/articles/[articleId]/route.ts` with PUT and DELETE handlers
- Both handlers validate platform_admin role, UUID params, article existence, and article-tenant ownership
- Hook's `updateArticle` now routes to `/api/admin/tenants/${adminTenantId}/articles/${id}` when in admin mode
- Hook's `deleteArticle` now routes to `/api/admin/tenants/${adminTenantId}/articles/${id}` when in admin mode
- **Status:** VERIFIED FIXED

#### BUG-5 (Low): No progress indicator for large imports -- FIXED
- Uploading step now displays "Importiere X Artikel..." (using the count from preview data) instead of generic "Datei wird importiert..."
- Not a per-batch progress bar, but provides meaningful feedback on the scope of the import
- **Status:** VERIFIED FIXED (acceptable improvement)

### Acceptance Criteria Status (Round 2)

#### AC-1: "Artikelstamm" tab appears in Settings (tenant_admin/tenant_user) and Admin panel (platform_admin)
- [x] Navigation link "Artikelstamm" visible for all roles (no `adminOnly` flag)
- [x] Admin panel tenant detail sheet includes "Artikelstamm" tab (only for existing tenants)
- [x] tenant_user sees read-only view (no add/edit/delete/import buttons) -- BUG-1 FIXED
- **PASS**

#### AC-2: Article table shows all specified columns
- [x] All 8 columns present: Herst.-Art.-Nr., Artikelbezeichnung, Kategorie, Farbe, Verpackung, Ref.-Nr., GTIN, Suchbegriffe
- [x] Responsive column hiding at md/lg/xl breakpoints
- [x] Horizontal scroll on overflow
- **PASS**

#### AC-3: Tenant admin can add a single article via form dialog
- [x] "Artikel hinzufuegen" button opens dialog with all 8 fields
- [x] Required fields marked with asterisk
- [x] Zod validation on submit
- [x] Success: toast + dialog close + list refresh
- [x] Error: inline alert in dialog (e.g., 409 duplicate)
- **PASS**

#### AC-4: Tenant admin can edit any article via the same form dialog
- [x] Pencil icon opens pre-populated form dialog
- [x] PUT validates ownership before updating
- [x] Duplicate article_number returns 409
- **PASS**

#### AC-5: Tenant admin can delete an article with confirmation dialog
- [x] Trash icon opens AlertDialog with article number and name
- [x] Confirmation message mentions past orders unaffected
- [x] DELETE validates ownership before deleting
- [x] Success: toast + dialog close + list refresh
- **PASS**

#### AC-6: Tenant admin can import articles via CSV or Excel file upload
- [x] "Importieren" button opens import dialog with drop zone
- [x] Accepts .csv, .xlsx, .xls (client + server validation)
- [x] File size limit 10 MB (client + server)
- [x] Preview shows parsed rows before confirming -- BUG-2 FIXED
- [x] Import result shows created/updated/skipped with colored badges
- [x] Errors/warnings listed in scrollable area
- **PASS**

#### AC-6a: Duplicate Herst.-Art.-Nr. within same tenant are updated (upsert)
- [x] Upsert on conflict with timestamp-based created/updated counting
- **PASS**

#### AC-7: Tenant admin can export the full catalog as CSV download
- [x] "Exportieren" button triggers CSV download
- [x] Semicolon separator with UTF-8 BOM
- [x] All 8 columns with German headers
- [x] Proper field escaping
- [x] Export disabled when 0 articles
- **PASS**

#### AC-8: Article list supports text search
- [x] Debounced search (300ms)
- [x] Server-side ilike on article_number, name, keywords
- [x] Resets to page 1
- [x] Search text shown in count label
- [x] LIKE special chars escaped
- **PASS**

#### AC-9: Platform admin can access and manage catalogs for any tenant
- [x] Admin panel Artikelstamm tab with `adminTenantId` prop
- [x] GET with `requirePlatformAdmin` auth
- [x] POST for single article creation -- BUG-3 FIXED
- [x] PUT/DELETE via new admin route -- BUG-4 FIXED
- [x] Import via admin endpoint
- [x] Export via admin endpoint
- **PASS**

#### AC-10: RLS ensures tenants can only see and modify their own articles
- [x] RLS enabled with SELECT/INSERT/UPDATE/DELETE policies scoped to tenant_id + role
- [x] API routes use adminClient (service role) with application-level auth checks
- **PASS**

#### AC-11: All fields except Herst.-Art.-Nr. and Artikelbezeichnung are optional
- [x] Zod schemas, DB schema, and form dialog all consistent
- **PASS**

#### AC-12: Herst.-Art.-Nr. unique per tenant
- [x] DB unique constraint, 409 on manual create, upsert on import
- **PASS**

### Edge Cases Status (Round 2)

- [x] EC-1: Import file with 0 valid rows -- returns 400, no changes
- [x] EC-2: Duplicate article numbers within file -- Map deduplication, last wins
- [x] EC-3: Delete article used in past order -- allowed, data denormalized
- [x] EC-4: Tenant with 0 articles -- empty state with CTA (read-only variant for tenant_user)
- [x] EC-5: Platform admin imports for tenant -- admin endpoint verifies tenant exists
- [x] EC-6: Large catalog (5,000+ rows) -- batched upsert, article count shown during import
- [x] EC-7: Duplicate article number on manual add -- 409 with inline error

### Security Audit Results (Round 2)

#### Authentication
- [x] All endpoints verify session via `supabase.auth.getUser()`
- [x] Unauthenticated requests return 401
- [x] Admin endpoints use `requirePlatformAdmin()` helper
- [x] New admin PUT/DELETE endpoint also uses `requirePlatformAdmin()`

#### Authorization
- [x] Inactive user/tenant returns 403
- [x] Users without tenant_id get 403
- [x] Create/update/delete restricted to tenant_admin and platform_admin roles
- [x] PUT/DELETE verify article.tenant_id matches user's tenant_id (IDOR protection)
- [x] Admin PUT/DELETE verify article belongs to the target tenant (cross-tenant protection)
- [x] tenant_user gets read-only access at UI level; API GET permits read access (consistent)

#### Input Validation
- [x] Zod validation on all create/update payloads (tenant + admin endpoints)
- [x] UUID regex validation on all path parameters (tenant ID, article ID)
- [x] File extension and size validation on import (client + server)
- [x] Field length limits enforced
- [x] LIKE special chars (%, _) escaped in search
- [x] CSV export field escaping (semicolons, quotes, newlines)

#### Data Leakage
- [x] All endpoints scoped to tenant_id
- [x] No sensitive data in error messages

#### Rate Limiting
- [x] No rate limiting on article catalog endpoints (consistent with rest of application -- not a new OPH-39 issue)

### Cross-Browser Testing (Code Review)
- [x] Chrome: No compatibility concerns (standard APIs, Tailwind, shadcn/ui)
- [x] Firefox: No compatibility concerns
- [x] Safari: No compatibility concerns
- Note: Client-side XLSX parsing uses ArrayBuffer API (supported in all modern browsers)

### Responsive Testing (Code Review)
- [x] 375px (Mobile): flex-col stacking, progressive column hiding, flex-wrap on action buttons
- [x] 768px (Tablet): Kategorie column visible, search + actions side by side
- [x] 1440px (Desktop): All columns visible

### New Issues Found in Round 2

#### BUG-6: tenant_user cannot export CSV (minor UX gap)
- **Severity:** Low
- **Description:** The export button is hidden for `tenant_user` (inside the `!readOnly` block). A read-only user might reasonably want to download the catalog as CSV for reference. The export API endpoint allows any authenticated tenant user to access it (no role check beyond authentication).
- **Steps to Reproduce:**
  1. Log in as a tenant_user
  2. Navigate to /settings/article-catalog
  3. Observe: No "Exportieren" button visible
- **Note:** This is a UX decision rather than a bug per se. If the intention is that tenant_user should have read-only access, export (which is a read operation) could be considered part of that. However, this does not violate the spec acceptance criteria since they specifically mention "Tenant admin can export."
- **Priority:** Nice to have -- defer

#### CODE NOTE: Duplicated import logic
- The admin import endpoint (`/api/admin/tenants/[id]/articles/import/route.ts`) duplicates the batch upsert logic from `processArticleImport` in the tenant import route instead of reusing it. The tenant route exports `processArticleImport` as a shared function but the admin route doesn't use it. Not a functional bug, but a maintainability concern.

### Summary (Round 2)

- **Acceptance Criteria:** 12/12 PASS (all 5 bugs from Round 1 verified fixed)
- **Edge Cases:** 7/7 PASS
- **New Bugs Found:** 1 (low severity -- tenant_user export button hidden)
- **Security:** PASS (no vulnerabilities found; auth, authorization, and input validation solid)
- **Production Ready:** YES
- **Recommendation:** All Critical and High bugs are resolved. The one new Low-severity issue (BUG-6: tenant_user cannot export CSV) can be deferred. Feature is ready for deployment.


## Deployment
- **Production URL:** https://oph-ki.ids.online
- **Deployed:** 2026-03-21
- **Git Tag:** v1.39.0-OPH-39
- **All 5 QA bugs fixed before deployment (12/12 AC passed)**
- **Deferred:** BUG-6 (Low) — tenant_user export button hidden, non-blocking
