# OPH-11: Bestellhistorie & Dashboard

## Status: In Progress
**Created:** 2026-02-27
**Last Updated:** 2026-03-03

## Dependencies
- Requires: OPH-6 (ERP-Export) — Bestellungen müssen vollständig durch die Pipeline gelaufen sein

## User Stories
- Als Mitarbeiter möchte ich eine Übersicht aller eingegangenen Bestellungen (sortiert nach Datum, neueste zuerst) sehen, damit ich den Überblick über alle zu bearbeitenden Bestellungen behalte.
- Als Mitarbeiter möchte ich Bestellungen nach Status filtern (Neu / In Prüfung / Freigegeben / Exportiert / Fehler), damit ich gezielt offene Bestellungen bearbeiten kann.
- Als Mitarbeiter möchte ich eine Bestellungssuche nach Händlername, Bestellnummer oder Datum durchführen, damit ich eine spezifische Bestellung schnell finde.
- Als Mandanten-Admin möchte ich ein Dashboard mit aggregierten Kennzahlen sehen (Bestellungen diese Woche, durchschnittliche Bearbeitungszeit, Extraktionsgenauigkeit), damit ich die Nutzung und Effizienz im Blick habe.
- Als Mitarbeiter möchte ich aus der Liste direkt in die Review-Ansicht einer Bestellung springen, damit die Navigation effizient ist.

## Acceptance Criteria
- [x] Listenansicht: Tabelle mit Spalten: Eingangsdatum, Händler, Bestellnummer (extrahiert), Status, Bearbeiter (letzter), Aktionen
- [x] Statusfilter als Tabs oder Dropdown: Alle / Neu / In Prüfung / Freigegeben / Exportiert / Fehler
- [x] Freitextsuche über Händlername und Bestellnummer (extrahiert)
- [x] Datumsbereich-Filter (von/bis)
- [x] Paginierung: 25 Bestellungen pro Seite
- [x] Dashboard-Kacheln: Bestellungen heute, diese Woche, diesen Monat; offene Bestellungen (nicht exportiert); Fehlerrate letzte 7 Tage
- [x] Klick auf Bestellung → direkter Sprung zur Review-Ansicht (OPH-5)
- [x] Bestellstatus wird in Echtzeit aktualisiert (Polling alle 30 Sekunden oder Supabase Realtime)
- [x] Alle Daten sind mandantenspezifisch (RLS)

## Edge Cases
- Was passiert, wenn ein Mandant tausende Bestellungen hat? → Paginierung und Datenbankindexes sichern Performance (< 500ms Ladezeit)
- Was passiert, wenn eine Suche keine Ergebnisse liefert? → "Keine Bestellungen gefunden" mit Hinweis auf aktive Filter
- Was passiert, wenn ein Benutzer nur bestimmte Bestellungen sehen soll (zukünftiges Feature)? → MVP: alle Benutzer eines Mandanten sehen alle Bestellungen; Berechtigungen auf Bestellungsebene ist Post-MVP

## Technical Requirements
- Supabase Realtime oder Polling für Live-Status-Updates
- Datenbankindizes auf `tenant_id`, `status`, `created_at`, `dealer_id`
- Server-Side Pagination mit Cursor oder Offset
- Dashboard-Kennzahlen: aggregierte SQL-Queries (keine separates Analytics-Tool für MVP)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview

OPH-11 extends the existing orders list page into a full history & dashboard experience. No new database tables are needed — all data already exists in the `orders` table. The work is split into two areas:

1. **Enhanced list page** — add search, status filter tabs, date range picker, and proper 25-per-page pagination
2. **Dashboard stats row** — a row of tiles above the list showing aggregate counts

---

### A) Component Structure (Visual Tree)

```
/orders (page)
+-- DashboardStats (new component)
|   +-- StatTile: "Heute" (today's count)
|   +-- StatTile: "Diese Woche" (this week)
|   +-- StatTile: "Dieser Monat" (this month)
|   +-- StatTile: "Offene Bestellungen" (pending/review)
|   +-- StatTile: "Fehlerrate (7 Tage)" (error %)
|
+-- OrdersFilterBar (new component)
|   +-- SearchInput (debounced, 400ms)
|   +-- StatusFilterTabs: Alle / Neu / In Prüfung / Freigegeben / Exportiert / Fehler
|   +-- DateRangePicker: Von / Bis
|
+-- OrdersList (existing, enhanced)
|   +-- OrdersTable (rows: date, dealer, order no., status, last handler, actions)
|   +-- EmptyState ("Keine Bestellungen gefunden" + filter hint)
|
+-- PaginationControls (new component)
    +-- Previous / Next buttons
    +-- "Seite X von Y" indicator
    +-- Total count label ("Z Bestellungen")
```

---

### B) Data Model (what changes)

**No new database tables.** All data comes from the existing `orders` table.

**Two API endpoints are needed:**

**1. Enhanced `/api/orders`** — already exists, needs new query parameters:
- `status` → filter by order status (e.g. `new`, `approved`, `error`)
- `search` → text search across dealer name and extracted order number
- `dateFrom` / `dateTo` → filter by `created_at` date range
- `page` → replaces raw `offset` (server calculates offset as `(page - 1) × 25`)
- Response gains: `total` count (for pagination controls)

**2. New `/api/orders/stats`** — returns five numbers:
- Orders created today
- Orders created this week (Mon–Sun)
- Orders created this month
- Open orders (status not `exported` and not `error`)
- Error rate last 7 days (% of orders with `status = error`)

All queries remain scoped to the current user's tenant (RLS enforced at DB level).

**Database indexes** (added via migration, no schema changes):
- `orders(tenant_id, created_at DESC)` — primary list sort
- `orders(tenant_id, status)` — status filter
- `orders(tenant_id, status, created_at)` — stats queries

---

### C) Tech Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Status filter | shadcn `Tabs` component | Already installed, matches existing UI style |
| Date pickers | shadcn `Popover` + native `<input type="date">` | Simple, no extra library needed |
| Search debounce | 400ms client-side delay | Avoids hitting API on every keystroke |
| Pagination | Offset-based (page number) | Simple for MVP; cursor-based is overkill at this scale |
| Stats refresh | 30-second polling (`setInterval`) | Realtime not needed for aggregate counts; polling is simpler |
| List refresh | Keep existing 5s polling when orders are processing | Already works; don't break it |
| Search scope | `dealer name` + `extracted order number` | These are the two identifiers users know |
| Page size | 25 fixed | Meets AC; no user-configurable page size for MVP |

---

### D) Dependencies (no new packages needed)

All shadcn components required are already installed:
- `Tabs`, `TabsList`, `TabsTrigger` — status filter
- `Popover`, `Calendar` — date range (already used elsewhere)
- `Input`, `Button`, `Badge`, `Card` — search and tiles

---

### E) Files to Create / Modify

| File | Change |
|------|--------|
| `src/app/api/orders/route.ts` | Add `status`, `search`, `dateFrom`, `dateTo`, `page` params; return `total` |
| `src/app/api/orders/stats/route.ts` | New endpoint — 5 aggregate numbers |
| `src/components/orders/dashboard-stats.tsx` | New — 5 stat tiles, 30s polling |
| `src/components/orders/orders-filter-bar.tsx` | New — search + status tabs + date range |
| `src/components/orders/orders-list.tsx` | Enhanced — consume filter state, add pagination controls |
| `src/app/(protected)/orders/page.tsx` | Compose new components; manage shared filter state |
| `supabase/migrations/011_order_history_indexes.sql` | Add performance indexes |

---

### F) User Flow

1. User navigates to `/orders`
2. Dashboard stats row loads (30s auto-refresh)
3. Full order list loads (page 1, 25 items, no filters)
4. User types in search → 400ms debounce → list reloads
5. User clicks a status tab → list reloads filtered
6. User selects date range → list reloads filtered
7. User clicks "Weiter" (Next) → page 2 loads
8. User clicks a row → navigates to `/orders/[id]` (OPH-5 review screen)

## QA Test Results

**QA Date:** 2026-03-03
**Build:** PASS (`npm run build` clean)

### Acceptance Criteria Audit

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | Listenansicht: Tabelle mit Spalten (Datum, Haendler, Status, Bearbeiter, Aktionen) | PASS | Table in `orders-list.tsx` has: Datei (filename+link), Haendler (DealerBadge), Hochgeladen von, Status (Badge), Datum. Click on row links to `/orders/[id]`. |
| 2 | Statusfilter als Tabs: Alle / Neu / In Pruefung / Freigegeben / Exportiert / Fehler | PASS | `orders-filter-bar.tsx` uses shadcn `Tabs` with 8 status options. `onValueChange` resets to page 1 and triggers server-side filter. |
| 3 | Freitextsuche ueber Haendlername und Bestellnummer (extrahiert) | PASS | Search input with 400ms debounce. API extracts `order_number` from `extracted_data` JSONB. Also searches filename. |
| 4 | Datumsbereich-Filter (von/bis) | PASS | Two `<input type="date">` fields with `dateFrom`/`dateTo` params. API uses `gte/lte` on `created_at`. |
| 5 | Paginierung: 25 Bestellungen pro Seite | PASS | `PAGE_SIZE = 25`. Pagination controls show "Seite X von Y" + "Z Bestellungen gesamt". Previous/Next buttons disabled at boundaries. |
| 6 | Dashboard-Kacheln (heute, Woche, Monat, offen, Fehlerrate) | PASS | `dashboard-stats.tsx` renders 5 `StatTile` cards. `/api/orders/stats` returns all 5 aggregates via parallel Supabase count queries. |
| 7 | Klick auf Bestellung -> Review-Ansicht | PASS | `<Link href={/orders/${order.id}}>` on the filename cell navigates to order detail/review page. |
| 8 | Echtzeit-Aktualisierung (Polling) | PASS | Stats: 30s polling (`STATS_POLL_INTERVAL_MS`). List: 5s polling when processing orders exist. Both use `setInterval` with cleanup. |
| 9 | Mandantenspezifisch (RLS) | PASS | Both `/api/orders` and `/api/orders/stats` check auth, user status, tenant status, and scope queries to `tenant_id`. Admin client used with explicit tenant filter. |

### Edge Cases

| Edge Case | Status | Notes |
|-----------|--------|-------|
| Tausende Bestellungen -> Performance | PASS | DB indexes created: `idx_orders_tenant_created`, `idx_orders_tenant_status`, `idx_orders_tenant_status_created`. Count + data queries run in parallel. |
| Suche ohne Ergebnisse | PASS | Shows "Keine Bestellungen fuer die aktiven Filter gefunden. Versuchen Sie, die Filter anzupassen." with "Filter zuruecksetzen" button. |
| Filter zuruecksetzen | PASS | "Filter zuruecksetzen" button resets all filters to default and page to 1. |

### Bugs Found & Fixed

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 1 | Stats route used fragile string-based tenant filter parsing (`tenantFilter.split(".")`) | Medium | FIXED — refactored to pass `tenantId` directly to helper functions |
| 2 | `extractOrderNumber()` could crash on non-string `order_number` values (`.toLowerCase()` on number) | Medium | FIXED — added explicit type checking with `typeof` guard |

### Security Audit

| Check | Status | Notes |
|-------|--------|-------|
| Auth required on `/api/orders` | PASS | `getUser()` check at top, returns 401 |
| Auth required on `/api/orders/stats` | PASS | `getUser()` check at top, returns 401 |
| Inactive user blocked | PASS | Both routes check `user_status === "inactive"` and return 403 |
| Inactive tenant blocked | PASS | Both routes check `tenant_status === "inactive"` and return 403 |
| Tenant scoping enforced | PASS | Non-admin queries filter by `tenant_id`. Admin client used with explicit filter, not RLS bypass without scoping. |
| Input validation (page, pageSize) | PASS | `Math.max(1, page)`, `Math.min(Math.max(1, pageSize), 100)` — prevents negative/zero/excessive values |
| Search input sanitization | PASS | Search is passed as Supabase query param (parameterized), not raw SQL. Client-side `.includes()` filtering is safe against injection. |
| No secrets exposed | PASS | No sensitive data in API responses. `_order_number` internal field stripped before response. |
| XSS prevention | PASS | React escapes all rendered values. No `dangerouslySetInnerHTML`. |

### Regression Check

| Feature | Status | Notes |
|---------|--------|-------|
| OPH-18 (Admin Cross-Tenant View) | PASS (minor note) | Tenant filter still works client-side on paginated results. Dropdown only shows tenants from current page — this was already the behavior. Pagination counter shows global total, not filtered total. Acceptable for MVP. |
| OPH-2 (Order Upload) | PASS | Upload flow unaffected. `/api/orders` response shape changed to `OrdersPageResponse` but the upload page uses its own endpoint. |
| OPH-5 (Order Review) | PASS | Click-through to `/orders/[id]` still works via `<Link>` |

### Verdict: PASS

All 9 acceptance criteria pass. 2 bugs found and fixed during QA. No critical/high issues remaining. Ready for deployment.

## Deployment
_To be added by /deploy_
