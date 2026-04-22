# OPH-94: Tenant Excel Sheet Filter

## Status: In Review
**Created:** 2026-04-22
**Last Updated:** 2026-04-22

## Dependencies
- OPH-4: KI-Datenextraktion (extraction pipeline where sheet filtering is applied)
- OPH-23: Chunked Extraction for Large Excel Files (sheet filter must apply before chunking)
- OPH-8: Admin: Mandanten-Management (tenant settings UI)
- OPH-42: Admin Tenant Detail Page (where the setting will be configured)

---

## Problem Statement

When a multi-sheet Excel file is uploaded as an order, the extraction system currently combines ALL sheets into one CSV and sends everything to Claude. This creates two problems:

1. **Noise from irrelevant sheets:** Many Excel orders contain auxiliary sheets (price lists, templates, instructions) that are not part of the order. These confuse the extraction engine and can produce incorrect results.
2. **No tenant-level control:** Different tenants receive Excel orders with different sheet naming conventions. Meisinger's Italian subsidiary sends files where only the "Order Form" sheet contains the order. Another tenant might use "Bestellung". There is no way to configure this per tenant.

---

## User Stories

- As a **platform admin**, I want to configure which Excel sheet name a tenant's orders use, so that extraction only processes the relevant sheet and ignores auxiliary data.
- As a **platform admin**, I want to leave the setting empty for tenants that don't need sheet filtering, so that the system continues to process all sheets as before (backwards compatible).
- As a **tenant admin**, I want to see which Excel sheet filter is configured for my tenant, so that I understand how my orders are processed.
- As a **tenant user**, I want the extraction to automatically pick the correct sheet from my Excel orders, so that I get clean extraction results without manual intervention.

---

## Acceptance Criteria

### Configuration
- [ ] AC-1: A new optional field **"Excel-Blattname"** is added to the tenant settings (Admin > Mandanten-Verwaltung > [Tenant]).
- [ ] AC-2: The field accepts a free-text sheet name (e.g., "Order Form", "Bestellung"). Max 100 characters.
- [ ] AC-3: The field can be left empty — meaning "use all sheets" (current behavior, backwards compatible).
- [ ] AC-4: Only `platform_admin` users can edit this setting. `tenant_admin` users can view it but not change it.

### Extraction behavior
- [ ] AC-5: When the tenant has an Excel sheet name configured and the uploaded Excel file contains a sheet with that exact name (case-insensitive match), ONLY that sheet is extracted.
- [ ] AC-6: When the tenant has an Excel sheet name configured but the uploaded file does NOT contain a matching sheet, ALL sheets are extracted as fallback (no data loss) and a warning is logged.
- [ ] AC-7: When the tenant has no Excel sheet name configured (null/empty), ALL sheets are extracted as before.
- [ ] AC-8: The sheet filter is applied BEFORE chunking (OPH-23) — so the row count for chunking decisions is based only on the filtered sheet.
- [ ] AC-9: Non-Excel files (PDF, EML, CSV) are completely unaffected by this setting.

### UI
- [ ] AC-10: The "Excel-Blattname" field is shown on the Admin Tenant Detail Page in the settings section.
- [ ] AC-11: The field has a help text explaining: "Wenn gesetzt, wird bei Excel-Bestellungen nur das Blatt mit diesem Namen extrahiert. Leer lassen = alle Blätter."
- [ ] AC-12: Tenant admins see the configured value as read-only text (not an editable field).

---

## Edge Cases

- **Sheet name with different casing:** Match is case-insensitive. "Order Form" matches "order form" or "ORDER FORM".
- **Sheet name with leading/trailing spaces:** Trimmed before comparison.
- **Excel file with only one sheet:** Sheet filter is effectively a no-op — the single sheet is used regardless.
- **Excel file where the configured sheet is empty:** The empty sheet is used (results in empty extraction). This is correct behavior — the user configured it explicitly.
- **Multiple Excel files on one order:** Sheet filter applies to each Excel file independently.
- **Non-Excel files mixed with Excel:** Sheet filter only applies to .xlsx/.xls files; other files (PDF, images, etc.) are processed normally.
- **Setting changed after orders were already extracted:** No retroactive effect. Only new extractions use the updated setting. Re-extraction of existing orders will use the current setting.
- **Tenant has no orders yet:** Setting can still be configured in advance.

---

## Technical Requirements

- **Database:** New nullable `excel_sheet_name` text column on the `tenants` table (max 100 chars).
- **Extraction:** In `src/lib/claude-extraction.ts`, the Excel sheet loop must check the tenant's sheet filter before combining sheets. If the configured sheet exists, use only that one.
- **API:** The tenant detail API already returns tenant fields — just include the new column.
- **UI:** Add field to existing Admin Tenant Detail Page form — no new page needed.
- **No new dependencies.**

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview

A small, focused change with four touch points: one database column, one type/schema update, one extraction logic change, and one UI field. No new tables, no new routes, no new dependencies.

---

### Component Structure

```
Admin Tenant Detail Page (existing — 1 change)
+-- TenantProfileForm (existing — add one field)
    +-- [NEW] "Excel-Blattname" Input
        - Free-text, optional (empty = all sheets)
        - Max 100 characters
        - Shown to platform_admin as editable Input
        - Help text: "Wenn gesetzt, wird bei Excel-Bestellungen nur das Blatt
          mit diesem Namen extrahiert. Leer lassen = alle Blätter."

Tenant Admin Settings (existing read-only area — 1 minor change)
+-- Inbound Email / Settings page
    +-- [NEW] Show "Excel-Blattname" as read-only text (if set)
        - Visible to tenant_admin but not editable
```

---

### Data Model

One new column on the existing `tenants` table:

```
tenants table (updated):
  excel_sheet_name  — NEW nullable text column, max 100 characters
                     The name of the Excel sheet to extract from.
                     NULL or empty string = use all sheets (backward compatible).
```

No new tables. No changes to RLS policies (the `tenants` table RLS already restricts
platform_admin writes vs. tenant reads).

---

### Extraction Flow Change

The Excel processing in `src/lib/claude-extraction.ts` currently loops over ALL
`workbook.SheetNames` and concatenates every sheet into one CSV. The change:

1. The `ExtractionInput` interface gets a new optional field: `excelSheetName?: string | null`
2. The extraction route (`src/app/api/orders/[orderId]/extract/route.ts`) fetches the
   tenant's `excel_sheet_name` from the database and passes it as `excelSheetName` into
   `extractOrderData()`
3. In the Excel case block, **before** combining sheets and **before** the chunking decision:
   - If `excelSheetName` is set: filter `workbook.SheetNames` to the matching sheet (case-insensitive, trimmed). If no match found → log a warning and fall back to all sheets (no data loss).
   - If `excelSheetName` is null/empty: process all sheets as before (fully backward compatible).

The chunking threshold check (OPH-23) runs on the already-filtered CSV — so row counts
reflect only the selected sheet, satisfying AC-8.

---

### New & Changed Files

| File | Type of change |
|---|---|
| `supabase/migrations/049_oph94_tenant_excel_sheet_filter.sql` | **New** — adds `excel_sheet_name` column to `tenants` |
| `src/lib/types.ts` | Add `excel_sheet_name: string \| null` to `Tenant` interface |
| `src/lib/validations.ts` | Add `excel_sheet_name` optional field to `updateTenantSchema` (max 100 chars, nullable) |
| `src/lib/claude-extraction.ts` | Add `excelSheetName?` to `ExtractionInput`; filter sheet loop before combining |
| `src/app/api/orders/[orderId]/extract/route.ts` | Fetch tenant's `excel_sheet_name`, pass to `extractOrderData()` |
| `src/components/admin/tenant-profile-form.tsx` | Add "Excel-Blattname" Input field with help text (platform_admin editable) |
| `src/app/(protected)/settings/inbound-email/page.tsx` | Show `excel_sheet_name` as read-only text for tenant_admin |

No new routes needed — `PATCH /api/admin/tenants/[id]` already handles arbitrary
tenant field updates via the `updateTenantSchema`. `GET /api/admin/tenants/[id]` uses
`select("*")` so the new column is returned automatically.

---

### Tech Decisions

| Decision | Why |
|----------|-----|
| Single text field on `tenants` (not a rules table) | One name per tenant is the exact requirement. A rules table would be over-engineering for a single string. |
| Case-insensitive match with trim | Prevents configuration errors from casing or whitespace — "Order Form" vs "order form" should both work. |
| Fallback to all sheets if sheet not found | Never silently loses data. A misconfigured name means all sheets are processed, which is the safe default. Warning logged for diagnosis. |
| Filter before chunking | The chunking decision (OPH-23) should reflect the actual data being extracted, not the full file. Applying filter first gives correct chunk sizing. |
| Pass through `ExtractionInput` | The extraction function is pure (no DB access). Keeping DB fetching in the route layer maintains this separation. |

---

### No new dependencies needed.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
