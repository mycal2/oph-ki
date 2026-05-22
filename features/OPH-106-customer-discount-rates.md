# OPH-106: Customer Discount Rates Management

## Status: Deployed
**Created:** 2026-05-17
**Last Updated:** 2026-05-17

## Dependencies
- OPH-104 (Price Lookup Feature Flag) — UI only visible when flag is enabled
- OPH-105 (Article RRP Field) — articles need RRPs before discounts are meaningful
- OPH-46 (Manufacturer Customer Catalog) — discount rates live inside the customer detail view

## Background

Each customer of a tenant may have negotiated discount rates for the tenant's products. Discounts are stored as percentages. A customer can have:

1. A **default discount rate** — applies to all products that have no explicit override.
2. **Per-product overrides** — a specific rate for individual articles that differs from the default.

The system looks up the discount using: explicit per-product rate → customer default rate → missing (triggers Klärung in OPH-108).

## User Stories

- As a tenant admin, I want to open a customer in my customer catalog and see a "Discount Rates" tab so I can manage their pricing.
- As a tenant admin, I want to set a default discount rate for a customer so that all products automatically receive that rate during price lookup.
- As a tenant admin, I want to add a per-product override for a customer so that specific articles have a different discount than the default.
- As a tenant admin, I want to edit or delete any explicit per-product override so I can correct mistakes.
- As a tenant admin, I want to see the effective discount rate for every article (whether it comes from an explicit override or the customer default) in one table.

## Acceptance Criteria

- [ ] `price_lookup_enabled = true` on the tenant is required to see the Discount Rates tab; it is hidden otherwise.
- [ ] The customer detail view has a "Discount Rates" tab alongside existing customer info.
- [ ] The tab shows:
  - A **Default Discount Rate** field at the top (editable; format: percentage e.g. "15.00 %").
  - A table of all articles in the tenant's article catalog, each row showing: Article Number, Article Name, RRP, Effective Discount Rate (%), Computed Discounted Price (= RRP × (1 − rate)), Override Source ("Default" or "Override").
- [ ] Rows with an explicit per-product override are visually distinguished from rows using the default (e.g. bold or badge).
- [ ] Tenant admin can click any row to set or edit an explicit override for that article.
- [ ] Tenant admin can delete an explicit override (row reverts to the customer default).
- [ ] Saving the default discount rate does NOT create/modify existing explicit override records — it only changes the fallback value.
- [ ] If no default discount rate is set and no explicit override exists for an article, the Effective Discount Rate shows "—" (no rate).
- [ ] A new article added to the catalog after the default is set automatically appears in this table and resolves to the default rate (dynamic lookup, no record creation).
- [ ] All operations are tenant-scoped (no cross-tenant data access).
- [ ] `npx tsc --noEmit` clean.

## Data Model (conceptual)

**`customer_default_discounts`** — one row per (tenant, customer):
- `tenant_id`, `customer_id`, `discount_rate` (%)

**`customer_article_discounts`** — one row per explicit (tenant, customer, article) override:
- `id` (UUID), `tenant_id`, `customer_id`, `article_id`, `discount_rate` (%)

Both tables have DB migrations added by the backend skill.

## Edge Cases

- **Customer has no default and no overrides:** Table shows all articles with "—" for discount — no Klärung at this point (Klärung fires during extraction in OPH-108, not in the management UI).
- **Delete the default:** All articles with no explicit override revert to "—". The explicit overrides remain intact.
- **Article removed from catalog:** Its discount records become orphaned; they should be CASCADE-deleted when the article is deleted.
- **Discount rate = 0%:** Valid — the customer pays full RRP. Displayed as "0.00 %", discounted price = RRP.
- **Discount rate > 100%:** Rejected with validation error ("Discount rate must be between 0 and 100").
- **Large catalog:** Table is paginated or virtualized if the tenant has > 100 articles.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview
OPH-106 introduces a new tabbed customer detail page so the existing flat customer form has room for the discount-rates management UI. Two new DB tables hold the customer-default and per-article overrides. The "effective rate" per article is computed in memory at view time — not persisted — so adding a new article to the catalog automatically inherits the default without backfill.

### Component Structure

```
Customer Catalog Page  (existing — unchanged)
  └─ "Bearbeiten" row action → now navigates to Customer Detail Page (instead of opening dialog)

Customer Detail Page  ← NEW (mirrors admin tenant detail page pattern)
  ├─ Header (customer number + company name + Back)
  └─ Tabs
      ├─ Tab: "Profil"        — existing customer-form fields, moved out of dialog
      └─ Tab: "Rabatte"       ← NEW (only visible if tenant.price_lookup_enabled = true)
          ├─ Default Discount Rate input  (single % field + Save/Delete buttons)
          └─ Article Discount Table
              ├─ Columns: Art.Nr | Bezeichnung | UVP | Eff. Rabatt % | Disk. Preis | Quelle
              ├─ Pagination (server-side, 50/page — matches article catalog)
              ├─ Row click → opens "Override" mini-dialog (set / clear)
              └─ Quelle column: "Standard" (default) | "Override" (explicit) | "—" (none)
```

The dialog-based customer edit is retired; the existing `CustomerFormDialog` content is reused inside the Profil tab.

### Data Model

**Table: `customer_default_discounts`** (one row per customer who has a default set)

| Column | Type | Notes |
|--------|------|-------|
| `tenant_id` | UUID NOT NULL | FK → tenants.id, CASCADE |
| `customer_id` | UUID NOT NULL | FK → customers.id, CASCADE |
| `discount_rate` | NUMERIC(5,2) NOT NULL | 0.00 – 100.00, CHECK constraint |
| `created_at` | TIMESTAMPTZ | default now() |
| `updated_at` | TIMESTAMPTZ | trigger-updated |
| **PK** | (tenant_id, customer_id) | |

**Table: `customer_article_discounts`** (one row per explicit override)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK, default gen_random_uuid() |
| `tenant_id` | UUID NOT NULL | FK → tenants.id, CASCADE |
| `customer_id` | UUID NOT NULL | FK → customers.id, CASCADE |
| `article_id` | UUID NOT NULL | FK → article_catalog.id, CASCADE |
| `discount_rate` | NUMERIC(5,2) NOT NULL | 0.00 – 100.00, CHECK constraint |
| `created_at` | TIMESTAMPTZ | default now() |
| `updated_at` | TIMESTAMPTZ | trigger-updated |
| **Unique** | (tenant_id, customer_id, article_id) | |

Both tables get RLS policies tenant-scoped on `tenant_id`. Indexes on `(tenant_id, customer_id)` for lookup.

### API Routes (new)

| Route | Purpose |
|-------|---------|
| `GET /api/customers/[id]/discounts` | Returns `{ default: number \| null, overrides: Record<articleId, number> }` |
| `PUT /api/customers/[id]/discount-default` | Body `{ rate: number }` — upserts default |
| `DELETE /api/customers/[id]/discount-default` | Removes default |
| `PUT /api/customers/[id]/article-discounts/[articleId]` | Body `{ rate: number }` — upserts override |
| `DELETE /api/customers/[id]/article-discounts/[articleId]` | Removes override |
| `GET /api/customers/[id]/discount-table?page=N` | Joined table: articles + effective rate (server-paginated, 50/page) |

The combined `discount-table` endpoint does the JOIN + COALESCE in SQL so the frontend doesn't have to merge three lists in JS.

### Routing

| Path | What it shows |
|------|---------------|
| `/settings/customer-catalog` | (existing) list page |
| `/settings/customer-catalog/[id]` | NEW detail page with Profil + Rabatte tabs |
| `/settings/customer-catalog/[id]?tab=rabatte` | Deep link to Rabatte tab |

### Computed "Effective Rate" Logic

```
effective_rate = override_rate IF explicit override exists for (customer, article)
              ELSE default_rate IF customer default exists
              ELSE NULL (display "—")

computed_price = rrp × (1 − effective_rate / 100)  IF rrp AND effective_rate exist
              ELSE NULL (display "—")
```

This is computed in the SQL query of `discount-table` to keep the frontend simple.

### Tech Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Detail UI shape | Dedicated page with tabs (not dialog) | Discount table needs more room than a dialog; matches admin tenant detail pattern |
| Default discount storage | Separate `customer_default_discounts` table (not a column on `customers`) | Keeps `customers` table stable; easy DELETE → "no default" semantics |
| Effective rate persistence | Computed at view/extraction time, never stored | New articles auto-inherit default — no backfill, no orphans |
| Pagination | Server-side, 50/page | Matches existing article catalog UX; keeps response sizes bounded for large tenants |
| Discount rate type | NUMERIC(5,2), CHECK 0–100 | Two decimals is sufficient; DB-level validation prevents bad data |
| Override delete UX | "Reset to default" button per row | Less destructive language than "Delete"; matches user mental model |

### New Packages
None required.

### Migration
```
supabase/migrations/054_oph106_customer_discount_rates.sql
- CREATE TABLE customer_default_discounts (PK + RLS)
- CREATE TABLE customer_article_discounts (Unique constraint + RLS)
- CHECK constraint: discount_rate BETWEEN 0 AND 100
- Indexes on (tenant_id, customer_id)
```

### Dependencies on Other Features
- **OPH-104 (Price Lookup Flag):** Rabatte tab is hidden unless `tenant.price_lookup_enabled = true`. Wired by reading the flag from app metadata on the page server component.
- **OPH-105 (RRP):** Computed price column shows "—" if the article has no RRP. Functional even without RRP — just shows the rate.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
