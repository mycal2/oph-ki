# OPH-105: Article RRP (Recommended Retail Price) Field

## Status: Planned
**Created:** 2026-05-17
**Last Updated:** 2026-05-17

## Dependencies
- OPH-39 (Manufacturer Article Catalog) — adds a field to the existing articles table and catalog UI

## Background

Discount rates (OPH-106) are stored as percentages. To compute the actual discounted price, the system needs the Recommended Retail Price (RRP) per article. This is a single price per product — the same for all customers — and is managed as part of the article catalog.

## User Stories

- As a tenant admin, I want to enter an RRP for each article in my catalog so that discounted prices can be computed automatically during extraction.
- As a tenant admin, I want the RRP to be visible in the article list so I can spot articles that are missing a price.
- As a tenant admin, I want to include the RRP in article CSV/Excel imports and exports so I can manage it in bulk alongside other article data.

## Acceptance Criteria

- [ ] The `articles` table has an `rrp` column (`NUMERIC(12,4)`, nullable, default null).
- [ ] The article form dialog (create/edit) includes an "RRP (€)" numeric input field.
- [ ] The article catalog table shows an "RRP" column (right-aligned, formatted as currency; blank if null).
- [ ] The article CSV/Excel export includes an `rrp` column.
- [ ] The article CSV/Excel import accepts an `rrp` column (numeric; invalid values are skipped with a row-level error).
- [ ] Articles without an RRP can still exist — the field is optional.
- [ ] DB migration adds `rrp NUMERIC(12,4) NULL` to the `articles` table.
- [ ] `npx tsc --noEmit` clean.

## Edge Cases

- **RRP = 0:** Treated as a valid explicit price of zero, not as "not set". Display as "€0.00".
- **RRP missing when price lookup fires:** If extraction tries to compute a discounted price but the article has no RRP, treat it the same as "no discount record found" — triggers Klärung (handled by OPH-108).
- **Currency:** Stored as a raw numeric value. Currency symbol display is always €; no multi-currency support in scope.
- **Import: negative RRP:** Reject with a row-level validation error ("RRP must be ≥ 0").

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview
OPH-105 is a narrow vertical slice: one new nullable column on the existing `articles` table, surfaced in the existing article form, catalog table, and import/export. No new components, routes, or packages are needed.

### Component Structure

```
Article Catalog Page (article-catalog-page.tsx)
+-- Article Table
|   +-- ... (existing 8 columns)
|   +-- "UVP (€)" column  ← NEW (right-aligned, blank if null)
+-- Article Form Dialog (article-form-dialog.tsx)
|   +-- ... (existing 10 fields)
|   +-- "UVP (€)" numeric input  ← NEW (optional, ≥ 0)
+-- Article Import Dialog (article-import-dialog.tsx)
|   (no UI change — import accepts new column automatically via CSV)
```

### Data Model

**Table: `public.articles`**

New column added via migration:

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `rrp` | `NUMERIC(12,4)` | YES | NULL |

- 12 digits total, 4 decimal places — sufficient for dental product pricing
- NULL = "not set" (distinct from 0.00 which means "€0.00 explicit price")
- No index needed (not used in WHERE/JOIN for this feature)

**`ArticleCatalogItem` interface** — gains `rrp: number | null`

**`updateArticleSchema` / create schema** — gains `rrp: z.number().min(0).nullable().optional()`

### API Changes (no new routes)

| Route | Change |
|-------|--------|
| `GET /api/articles` | Include `rrp` in SELECT |
| `POST /api/articles` | Accept + persist `rrp` |
| `PATCH /api/articles/[id]` | Accept + persist `rrp` |
| `GET /api/articles/export` | Add `UVP` column after `Suchbegriffe` |
| `POST /api/articles/import` | Parse `UVP` column; validate ≥ 0, skip row with error if negative |
| Admin variants (`/api/admin/tenants/[id]/articles/...`) | Same changes as above |

### CSV/Excel Import & Export

**Export** — new 11th column appended to existing 10:
```
Herst.-Art.-Nr.;Artikelbezeichnung;...;Suchbegriffe;UVP
```
Value: formatted as decimal with dot separator (e.g., `12.5000`), empty if null.

**Import** — accepts optional `UVP` column:
- Numeric string → parsed to `number`
- Negative → row-level error: "UVP muss ≥ 0 sein"
- Non-numeric / blank → treated as null (field is optional)
- Column absence → all rows imported with `rrp: null` (backward compatible)

### Display Formatting

- In the catalog table: `€12.50` (2 decimal places using `Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" })`)
- Null: blank cell (not "—", not "€0.00")
- RRP = 0: displayed as `€0,00`

### Tech Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Currency | Hardcoded € | No multi-currency requirement; avoids over-engineering |
| Storage precision | NUMERIC(12,4) | Consistent with other price fields; allows sub-cent precision for discount math |
| Nullable vs 0 default | NULL default | Distinguishes "not entered" from "explicitly €0.00" |
| Column position in table | After keywords | Least disruptive; rightmost columns already hidden on small screens |
| Import column label | `UVP` | Matches German industry standard (Unverbindliche Preisempfehlung = UVP) |

### New Packages
None required.

### Migration
```
supabase/migrations/053_oph105_article_rrp.sql
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS rrp NUMERIC(12,4) NULL;
```

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
