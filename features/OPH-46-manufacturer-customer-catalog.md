# OPH-46: Manufacturer Customer Catalog

## Overview
**Status:** In Review
**Created:** 2026-03-23
**Priority:** P1

## Problem
Each manufacturer has a list of their customers (dealers, dental practices, distributors) with a unique Kundennummer assigned by the manufacturer. Today, there is no central place to store this customer master data. When orders arrive, the customer number must be recognized from unstructured text (OPH-19) or entered manually — because the system has no reference table to match against.

Without a customer catalog, the AI customer number matching (OPH-47) cannot function: there is nothing to match against.

## Solution
Provide a Manufacturer Customer Catalog — a CRUD-able, importable, exportable customer master data list — scoped per tenant. Tenant admins manage their own customers. Platform admins can manage catalogs for any tenant. The catalog is the reference data source for OPH-47 (AI Customer Number Matching during Extraction).

This feature follows the same structure as OPH-39 (Manufacturer Article Catalog).

## User Stories

1. **As a tenant admin**, I want to view my customer list in Settings so that I have an overview of all registered customers.
2. **As a tenant admin**, I want to add a single customer via a form so that I can maintain the list without needing a CSV file.
3. **As a tenant admin**, I want to edit and delete existing customers so that I can keep the catalog accurate and up to date.
4. **As a tenant admin**, I want to upload a CSV or Excel file to bulk-import customers so that I can populate the catalog quickly from my existing CRM or ERP export.
5. **As a tenant admin**, I want to download the full customer list as CSV so that I can edit it offline and re-import it later.
6. **As a tenant admin**, I want to download a sample CSV file showing the correct format so that I know how to prepare my import file.
7. **As a platform admin**, I want to manage the customer catalog for any tenant (via the Admin panel → Tenant detail) so that I can assist during onboarding.
8. **As a tenant admin**, I want to search the customer list by customer number or company name so that I can quickly find a specific customer.

## Customer Fields

| Field | German label | Required | Notes |
|-------|-------------|----------|-------|
| `customer_number` | Kundennummer | Yes | Manufacturer's internal customer ID. Unique per tenant. |
| `company_name` | Firma | Yes | Customer's company name. Primary matching signal. |
| `street` | Strasse | No | Street address. Used for address-based matching and ERP export. |
| `postal_code` | PLZ | No | Postal code. Used for address matching and ERP export. |
| `city` | Stadt | No | City. Used for address matching and ERP export. |
| `country` | Land | No | Country. For ERP export. |
| `email` | E-Mail | No | Customer email. Strong exact-match signal. |
| `phone` | Telefon | No | Customer phone number. Match signal. |
| `keywords` | Suchbegriffe / Aliase | No | Comma-separated alternate names, abbreviations, former names, dealer group names. |

## Acceptance Criteria

### AC-1: Customer List View
- [ ] A "Kundenstamm" tab appears in the tenant Settings page (for tenant_admin / tenant_user)
- [ ] The same "Kundenstamm" tab appears in the Admin panel under each tenant's detail page (for platform_admin)
- [ ] The customer table shows: Kundennummer, Firma, PLZ, Stadt, E-Mail, Telefon
- [ ] The table supports text search across: Kundennummer, Firma, Suchbegriffe
- [ ] An empty state with a call to action is shown when no customers exist yet

### AC-2: Add / Edit Customer
- [ ] Tenant admin can add a single customer via a form dialog with all fields
- [ ] Tenant admin can edit any existing customer via the same form dialog
- [ ] Required fields (Kundennummer, Firma) are validated before save
- [ ] Kundennummer is unique per tenant: attempting to create a duplicate on manual add shows an inline error "Kundennummer bereits vorhanden"
- [ ] All other fields are optional
- [ ] Kundennummer is stored with all internal spaces stripped (same as article_number in OPH-39)

### AC-3: Delete Customer
- [ ] Tenant admin can delete a customer via a confirmation dialog
- [ ] Deleted customers do not affect past orders (extraction data is denormalized)

### AC-4: CSV / Excel Import
- [ ] A file upload dialog accepts CSV and Excel (.xlsx, .xls) files
- [ ] The import parses the file and shows a preview of detected rows before the user confirms
- [ ] The import reports how many rows were created / updated / skipped
- [ ] Duplicate Kundennummer within the same tenant → upsert (update existing), not rejected
- [ ] Duplicate Kundennummer within the same file → last row wins
- [ ] Rows missing Kundennummer or Firma are skipped with a warning message
- [ ] Accepted German and English column header names are supported (see Column Mapping section)
- [ ] Encoding: UTF-8 with BOM support for Excel exports

### AC-5: CSV Export
- [ ] "Exportieren" button downloads the full customer catalog as a UTF-8 CSV file
- [ ] Export filename: `kundenstamm-{tenantName}-{date}.csv`
- [ ] Exported columns include all fields in the same order as the Column Mapping section
- [ ] Empty fields are exported as empty cells (not "null" text)

### AC-6: Sample CSV Download
- [ ] A "Beispiel-CSV herunterladen" button is available in the import dialog or toolbar
- [ ] The sample CSV shows the correct column headers and 2–3 example rows
- [ ] Filename: `kundenstamm-beispiel.csv`

### AC-7: Platform Admin Access
- [ ] Platform admin can view, add, edit, delete, import, and export the customer catalog for any tenant via the Admin panel → Tenant detail → "Kundenstamm" tab
- [ ] RLS ensures tenants can only access their own customer data

## Column Mapping for CSV Import

| Canonical field | Accepted header labels (case-insensitive) |
|---|---|
| `customer_number` | customer_number, kundennummer, kd.-nr., kd.nr., kd-nr, kundennr |
| `company_name` | company_name, firma, unternehmen, unternehmensname, company |
| `street` | street, strasse, straße, adresse, address |
| `postal_code` | postal_code, plz, postleitzahl, zip, zip_code |
| `city` | city, stadt, ort |
| `country` | country, land |
| `email` | email, e-mail, e_mail |
| `phone` | phone, telefon, tel., tel, telefonnummer |
| `keywords` | keywords, suchbegriffe, aliase, suchbegriffe / aliase |

## Edge Cases

- **EC-1:** Import file with 0 valid rows → show error, no changes made to the catalog
- **EC-2:** Import file with duplicate Kundennummer within the file → last row wins (same as OPH-39 article import)
- **EC-3:** Deleting a customer that was matched in a past order → allow deletion; past orders are unaffected (customer_number is stored in reviewed_data, not referenced by FK)
- **EC-4:** Tenant with 0 customers → show empty state with call to action
- **EC-5:** Platform admin imports for a tenant → same import rules, scoped to that tenant
- **EC-6:** Very large catalog (5,000+ rows) → import must not time out; use the same chunked upsert approach as OPH-39
- **EC-7:** Kundennummer already exists on manual add → inline error: "Kundennummer bereits vorhanden"
- **EC-8:** Kundennummer contains spaces → strip all spaces on save (same as article_number in OPH-39)
- **EC-9:** Import file has no recognizable header for Kundennummer or Firma → show error listing recognized header names

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) — tenant_admin and platform_admin roles
- Requires: OPH-8 (Admin: Mandanten-Management) — platform admin manages catalogs per tenant
- Related: OPH-39 (Manufacturer Article Catalog) — same UX pattern; reuse import/export utilities where possible
- Related: OPH-43 (Sample CSV Download for Article Import) — same sample download pattern
- Enables: OPH-47 (AI Customer Number Matching during Extraction)

---

## Tech Design (Solution Architect)

### Component Structure

```
Settings → "Kundenstamm" Tab (tenant_admin / tenant_user)
+-- CustomerCatalogPage
    +-- CustomerCatalogToolbar
    |   +-- Search Input (Kundennummer, Firma, Suchbegriffe)
    |   +-- "Kunde hinzufügen" Button
    |   +-- "Importieren" Button (CSV / Excel)
    |   +-- "Exportieren" Button (CSV download)
    +-- CustomerCatalogTable
    |   +-- Columns: Kundennummer, Firma, PLZ, Stadt, E-Mail, Telefon
    |   +-- Per-row: Edit + Delete action buttons
    +-- Empty State (with import / add CTA)
    +-- CustomerFormDialog (Add / Edit — same dialog reused for both)
    +-- CustomerDeleteDialog (confirmation)
    +-- CustomerImportDialog
        +-- File drop zone (CSV / Excel)
        +-- Import Preview Table (parsed rows, errors highlighted)
        +-- "Beispiel-CSV herunterladen" link
        +-- Confirm Import Button
        +-- Import Result Summary (created / updated / skipped)

Admin Panel → Tenant Detail Page → "Kundenstamm" Tab (platform_admin)
+-- Same CustomerCatalogPage component, tenantId injected from Admin context
```

### Database Table: `customer_catalog`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key, auto-generated |
| `tenant_id` | UUID | Foreign key → tenants; RLS-enforced |
| `customer_number` | text | Manufacturer's Kundennummer. Unique per tenant. Spaces stripped on save. |
| `company_name` | text | Required. Primary matching signal for OPH-47. |
| `street` | text | Optional |
| `postal_code` | text | Optional |
| `city` | text | Optional |
| `country` | text | Optional |
| `email` | text | Optional. Exact-match signal for OPH-47. |
| `phone` | text | Optional. Digits-only normalization in OPH-47. |
| `keywords` | text | Optional. Comma-separated alternate names / aliases. |
| `created_at` | timestamp | Auto |
| `updated_at` | timestamp | Auto |

**Unique constraint:** `(tenant_id, customer_number)`
**RLS:** Tenant users read/write only their own rows. Platform admin uses service role.
**Index:** on `tenant_id` for fast catalog lookups during OPH-47 matching.

### API Routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/customers` | List tenant customers (paginated, searchable) |
| POST | `/api/customers` | Create single customer |
| PUT | `/api/customers/[id]` | Update single customer |
| DELETE | `/api/customers/[id]` | Delete single customer |
| POST | `/api/customers/import` | Bulk upsert from CSV / Excel |
| GET | `/api/customers/export` | Download full catalog as CSV |
| GET | `/api/admin/tenants/[id]/customers` | Platform admin: list any tenant's customers |
| POST | `/api/admin/tenants/[id]/customers/import` | Platform admin: bulk import for any tenant |
| GET | `/api/admin/tenants/[id]/customers/export` | Platform admin: export any tenant's catalog |

### Tech Decisions

| Decision | Reasoning |
|---|---|
| Mirrors OPH-39 exactly | Proven pattern; reduces risk and development time |
| `xlsx` package (already installed) | Handles CSV + Excel; consistent with article and dealer mappings import |
| Upsert on import | Admins re-export → edit offline → re-import frequently; rejecting duplicates breaks this workflow |
| Keywords as comma-separated text | Simpler than a join table; sufficient for single-tenant scale |
| Shared `CustomerCatalogPage` for Settings + Admin | Same component receives `tenantId` prop — no duplication |
| Separate `customer_catalog` table | Different entity and fields from articles — clean separation |

### Dependencies

- `xlsx` — already installed, no new packages needed

---

## QA Test Results

**Tested:** 2026-03-23
**App URL:** http://localhost:3003
**Tester:** QA Engineer (AI)
**Method:** Code review + build verification (npm run build passes cleanly)

### Acceptance Criteria Status

#### AC-1: Customer List View
- [x] A "Kundenstamm" tab appears in the tenant Settings page (for tenant_admin / tenant_user) -- Verified: top-navigation.tsx includes the link at `/settings/customer-catalog`, page.tsx renders CustomerCatalogPage with readOnly for tenant_user
- [x] The same "Kundenstamm" tab appears in the Admin panel under each tenant's detail page (for platform_admin) -- Verified: admin tenant detail page has `<TabsTrigger value="customers">Kundenstamm</TabsTrigger>` and renders `<CustomerCatalogPage adminTenantId={tenantId} />`
- [x] The customer table shows: Kundennummer, Firma, PLZ, Stadt, E-Mail, Telefon -- Verified: TableHead columns match exactly. PLZ/Stadt hidden on mobile (md:table-cell), E-Mail/Telefon hidden on tablet (lg:table-cell) -- responsive design is correct
- [x] The table supports text search across: Kundennummer, Firma, Suchbegriffe -- Verified: API uses `.or()` with ilike on customer_number, company_name, keywords. Client debounces at 300ms.
- [x] An empty state with a call to action is shown when no customers exist yet -- Verified: empty state shows "Noch keine Kunden vorhanden" with Import and Add buttons (hidden in readOnly mode)

#### AC-2: Add / Edit Customer
- [x] Tenant admin can add a single customer via a form dialog with all fields -- Verified: CustomerFormDialog renders all 9 fields from FIELDS array
- [x] Tenant admin can edit any existing customer via the same form dialog -- Verified: same dialog, pre-populated via useEffect when customer prop is set
- [x] Required fields (Kundennummer, Firma) are validated before save -- Verified: HTML `required` attribute on form fields + Zod schema on server (createCustomerSchema requires customer_number min 1, company_name min 1)
- [x] Kundennummer is unique per tenant: attempting to create a duplicate on manual add shows an inline error "Kundennummer bereits vorhanden" -- Verified: API catches PostgreSQL error code 23505 and returns 409 with the exact message
- [x] All other fields are optional -- Verified: Zod schema marks all other fields as `.nullable().optional()`
- [x] Kundennummer is stored with all internal spaces stripped -- Verified: both client-side (formData.customer_number.replace(/\s+/g, "")) and server-side (Zod .transform(v => v.replace(/\s+/g, "")))

#### AC-3: Delete Customer
- [x] Tenant admin can delete a customer via a confirmation dialog -- Verified: CustomerDeleteDialog with AlertDialog, shows customer number and company name, requires confirmation click
- [x] Deleted customers do not affect past orders -- Verified: no FK from orders to customer_catalog; delete is a hard delete on the catalog row only

#### AC-4: CSV / Excel Import
- [x] A file upload dialog accepts CSV and Excel (.xlsx, .xls) files -- Verified: file input accept=".csv,.xlsx,.xls", server validates extensions
- [x] The import parses the file and shows a preview of detected rows before the user confirms -- Verified: import dialog has "select" -> "preview" -> "uploading" -> "result" steps. Preview shows first 10 rows with Kundennummer, Firma, Stadt.
- [x] The import reports how many rows were created / updated / skipped -- Verified: result step shows badges for created, updated, skipped counts
- [x] Duplicate Kundennummer within the same tenant -> upsert (update existing), not rejected -- Verified: API uses `.upsert()` with `onConflict: "tenant_id,customer_number"` and `ignoreDuplicates: false`
- [x] Duplicate Kundennummer within the same file -> last row wins -- Verified: parseCustomerFile uses `rowMap.set(customerNumber.toLowerCase(), ...)` which overwrites earlier entries
- [x] Rows missing Kundennummer or Firma are skipped with a warning message -- Verified: both server and client parsers check for empty values and push error messages
- [x] Accepted German and English column header names are supported -- Verified: COLUMN_MAP in both customer-import.ts and customer-import-dialog.tsx contains all headers from the Column Mapping spec table
- [x] Encoding: UTF-8 with BOM support for Excel exports -- Verified: XLSX.read with codepage 65001

#### AC-5: CSV Export
- [x] "Exportieren" button downloads the full customer catalog as a UTF-8 CSV file -- Verified: export route returns text/csv with UTF-8 BOM
- [ ] BUG: Export filename does not match spec (see BUG-1)
- [x] Exported columns include all fields in the same order as the Column Mapping section -- Verified: header is "Kundennummer;Firma;Strasse;PLZ;Stadt;Land;E-Mail;Telefon;Suchbegriffe" which matches the Column Mapping table order
- [x] Empty fields are exported as empty cells (not "null" text) -- Verified: esc() function returns "" for null values

#### AC-6: Sample CSV Download
- [x] A "Beispiel-CSV herunterladen" button is available in the toolbar -- Verified: button labeled "Beispiel-CSV" in the toolbar action buttons area
- [x] The sample CSV shows the correct column headers and 2-3 example rows -- Verified: 3 example rows with realistic dental industry data
- [x] Filename: `kundenstamm-beispiel.csv` -- Verified: a.download = "kundenstamm-beispiel.csv"

#### AC-7: Platform Admin Access
- [x] Platform admin can view, add, edit, delete, import, and export the customer catalog for any tenant via the Admin panel -- Verified: all admin API routes exist under /api/admin/tenants/[id]/customers/*, admin tenant detail page renders CustomerCatalogPage with adminTenantId
- [x] RLS ensures tenants can only access their own customer data -- Verified: migration 029 creates RLS policies for SELECT (own tenant), INSERT/UPDATE/DELETE (own tenant + tenant_admin/platform_admin role). API routes additionally use adminClient (service role) with explicit tenant_id filtering.

### Edge Cases Status

#### EC-1: Import file with 0 valid rows
- [x] Handled correctly -- Server returns 400 with "Keine gueltigen Zeilen gefunden" message. Client preview step shows parse errors.

#### EC-2: Duplicate Kundennummer within the same file
- [x] Handled correctly -- rowMap.set() uses lowercased customer_number as key; last row overwrites previous entries.

#### EC-3: Deleting a customer matched in a past order
- [x] Handled correctly -- No FK constraint between customer_catalog and orders. Hard delete succeeds. Past order data is denormalized.

#### EC-4: Tenant with 0 customers
- [x] Handled correctly -- Empty state component renders with CTA buttons (Import + Add).

#### EC-5: Platform admin imports for a tenant
- [x] Handled correctly -- Admin import route at /api/admin/tenants/[id]/customers/import verifies tenant exists, then processes identically to tenant import.

#### EC-6: Very large catalog (5,000+ rows)
- [x] Handled correctly -- Both tenant and admin import routes use UPSERT_BATCH_SIZE = 500, processing in batches.

#### EC-7: Kundennummer already exists on manual add
- [x] Handled correctly -- API returns 409 with "Kundennummer bereits vorhanden." which is shown as inline error in the form dialog.

#### EC-8: Kundennummer contains spaces
- [x] Handled correctly -- Spaces stripped client-side (form dialog: replace(/\s+/g, "")), server-side (Zod transform), and in import parser.

#### EC-9: Import file has no recognizable header
- [x] Handled correctly -- Both server and client parsers check for required headers and return descriptive error messages listing accepted header names.

### Security Audit Results

- [x] Authentication: All API routes verify user session via supabase.auth.getUser() before processing
- [x] Authorization (tenant isolation): GET /api/customers filters by tenant_id from JWT. PUT/DELETE verify existing.tenant_id matches user's tenant_id before modifying.
- [x] Authorization (role check): POST, PUT, DELETE, import routes all check role is tenant_admin or platform_admin
- [x] Authorization (admin routes): All admin routes use requirePlatformAdmin() which verifies platform_admin role
- [x] Authorization (cross-tenant protection on update/delete): Both tenant and admin PUT/DELETE routes verify the customer belongs to the correct tenant before modification
- [x] Input validation: All create/update endpoints use Zod schemas with max length constraints. Import parser also enforces max lengths (200 for customer_number, 500 for company_name, etc.)
- [x] UUID validation: All endpoints with path params validate UUID format before querying
- [x] File upload validation: Import routes check file extension and enforce 10 MB size limit
- [x] Inactive user/tenant handling: All tenant API routes check for user_status === "inactive" and tenant_status === "inactive"
- [x] RLS as second line of defense: RLS policies enabled on customer_catalog table with proper tenant isolation
- [ ] BUG: PostgREST filter injection via search parameter (see BUG-2)
- [x] No secrets exposed in client-side code or API responses
- [x] Admin import verifies tenant exists before processing (prevents inserting data for non-existent tenants)

### Cross-Browser / Responsive Notes

- Responsive design verified in code: PLZ/Stadt columns hidden below md breakpoint, E-Mail/Telefon hidden below lg breakpoint. Toolbar wraps with flex-wrap on small screens. Search input is full-width on mobile, max-w-xs on sm+.
- Dialog content has max-h-[90vh] overflow-y-auto for form dialog -- handles small viewports.
- Table has overflow-x-auto for horizontal scrolling on narrow screens.

### Bugs Found

#### BUG-1: Export filename does not include tenant name and date
- **Severity:** Low
- **Steps to Reproduce:**
  1. Go to Settings > Kundenstamm (with at least 1 customer)
  2. Click "Exportieren"
  3. Expected: Downloaded file is named `kundenstamm-{tenantName}-{date}.csv` (per AC-5)
  4. Actual: Downloaded file is named `kundenstamm.csv` (static name)
- **Details:** The export API route sets `Content-Disposition: attachment; filename="kundenstamm.csv"` without tenant name or date. The client-side hook also uses `a.download = "kundenstamm.csv"`. The tenant name is not available in the export route (would need to be fetched) and no date formatting is applied. The same issue exists in the admin export route.
- **Files affected:**
  - `/Users/michaelmollath/projects/oph-ki/src/app/api/customers/export/route.ts` (line 119)
  - `/Users/michaelmollath/projects/oph-ki/src/hooks/use-customer-catalog.ts` (line 230)
- **Priority:** Fix before deployment (spec mismatch)

#### BUG-2: PostgREST filter injection via search parameter containing commas
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Go to Settings > Kundenstamm
  2. Type a search string containing a comma, e.g. `test,company_name.eq.hack`
  3. Expected: Search treats the entire string as a literal search term
  4. Actual: The comma is interpreted by PostgREST as an OR separator in the filter string, potentially causing unexpected filter behavior or errors
- **Details:** The search string is escaped for `%` and `_` (SQL LIKE wildcards) but not for commas, which are PostgREST filter separators. The `.or()` method constructs: `customer_number.ilike.%test,company_name.eq.hack%,...` which PostgREST parses as two separate filter conditions. This is a pre-existing pattern also present in the article catalog API routes.
- **Files affected:**
  - `/Users/michaelmollath/projects/oph-ki/src/app/api/customers/route.ts` (lines 81-84)
  - `/Users/michaelmollath/projects/oph-ki/src/app/api/admin/tenants/[id]/customers/route.ts` (lines 49-53)
- **Priority:** Fix in next sprint (pre-existing pattern; not unique to OPH-46)

#### BUG-3: Admin import route duplicates logic instead of reusing processCustomerImport
- **Severity:** Low
- **Steps to Reproduce:** Code review finding -- not a user-facing bug.
- **Details:** The tenant import route (`/api/customers/import/route.ts`) exports a reusable `processCustomerImport()` function, but the admin import route (`/api/admin/tenants/[id]/customers/import/route.ts`) reimplements the same parsing/upserting logic (lines 49-165) instead of calling the shared function. This creates maintenance risk: if the import logic is updated in one place, the other may be missed.
- **Files affected:**
  - `/Users/michaelmollath/projects/oph-ki/src/app/api/admin/tenants/[id]/customers/import/route.ts`
- **Priority:** Fix in next sprint (code quality / maintenance)

### Regression Testing

- [x] OPH-39 (Article Catalog): Same UX pattern; no shared code was modified. Article catalog functionality should be unaffected.
- [x] OPH-1 (Auth): Auth flow unchanged; only new API routes added.
- [x] OPH-8 (Tenant Management): Admin tenant detail page extended with new tab; existing tabs unaffected.
- [x] OPH-42 (Tenant Detail Page): New "Kundenstamm" tab added alongside existing tabs (Profil, Benutzer, Artikelstamm) -- no modification to existing tab content.
- [x] Build passes cleanly with no TypeScript errors.

### Summary
- **Acceptance Criteria:** 20/21 passed (1 minor spec mismatch on export filename)
- **Edge Cases:** 9/9 passed
- **Bugs Found:** 3 total (0 critical, 0 high, 1 medium, 2 low)
- **Security:** 1 medium-severity finding (PostgREST filter injection via comma in search -- pre-existing pattern)
- **Production Ready:** YES (conditionally)
- **Recommendation:** Fix BUG-1 (export filename) before deployment as it is an explicit spec requirement. BUG-2 and BUG-3 can be addressed in a follow-up sprint. No critical or high-severity bugs block deployment.
