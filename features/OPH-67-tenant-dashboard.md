# OPH-67: Tenant User Dashboard

## Status: Planned
**Created:** 2026-04-16
**Last Updated:** 2026-04-16

## Dependencies
- Requires: OPH-11 (Bestellhistorie & Dashboard) — provides `DashboardStats` component and `GET /api/orders/stats` endpoint that this feature reuses
- Requires: OPH-1 (Multi-Tenant Auth) — tenant-scoped data access

## Problem Context

The `/dashboard` page is the first page tenant users and tenant admins see after login. It currently shows **hardcoded zeros** and placeholder text — it never queries the database. The stats API and stats component already exist (built for OPH-11 on the `/orders` page) but are not wired up here.

Real example: user michael.mollath@ids.online logs in, sees "0 Bestellungen heute", "0 ausstehende Prüfungen" — while their tenant (Hager & Meisinger) has 180 orders in the database.

## User Stories

- As a **tenant user**, I want to see a real count of today's orders on my dashboard, so that I immediately know if there is new work waiting for me after logging in.
- As a **tenant user**, I want to see how many orders are pending review, so that I can prioritize my workload without navigating to the orders list first.
- As a **tenant user**, I want to see my 5 most recently uploaded orders with their current status, so that I can quickly jump back to work in progress.
- As a **tenant admin**, I want to see the number of active team members on my dashboard, so that I have a quick overview of my team without navigating to settings.
- As a **tenant user**, I want the dashboard to show a quick-access button to upload a new order, so that I can start the most common action directly from the landing page.
- As a **platform admin** visiting `/dashboard`, I want to see my tenant's stats (same as tenant users), so that I don't see a broken or empty page when viewing the tenant-facing side.

## Acceptance Criteria

### Stats Tiles
- [ ] The dashboard shows the same 5 stat tiles as the `/orders` page (Heute, Diese Woche, Dieser Monat, Offene Bestellungen, Fehlerrate 7 Tage) using the existing `DashboardStats` component and `GET /api/orders/stats` endpoint.
- [ ] Tiles show real data from the database, scoped to the user's tenant.
- [ ] Tiles show skeleton loaders while data is fetching.
- [ ] Stats auto-refresh every 30 seconds (same as `/orders` page — already built into `DashboardStats`).

### Recent Orders
- [ ] A "Letzte Bestellungen" section shows the 5 most recently created orders for the tenant.
- [ ] Each row shows: date, dealer name (or "–" if not yet recognised), order number (or "–" if not yet extracted), status badge.
- [ ] Clicking a row navigates to `/orders/[orderId]`.
- [ ] If no orders exist yet, show an empty state: "Noch keine Bestellungen. Laden Sie Ihre erste Bestellung hoch." with an upload button.

### Team Member Count
- [ ] The "Teammitglieder" tile shows the count of active users in the tenant (replacing the hardcoded "–").
- [ ] Only tenant_admin and platform_admin users see the team member count tile. Tenant users see a "Bestellung hochladen" quick-action tile instead.

### Quick Actions
- [ ] A primary "Bestellung hochladen" button is visible on the dashboard, linking to `/orders/upload`.

### Out of Scope
- Real-time Supabase subscription (polling is sufficient).
- Charts or trend graphs.
- Per-user filtering (all tenant users see tenant-wide stats).

## Edge Cases

- **New tenant with zero orders:** Empty state message shown in recent orders; stat tiles show all zeros (valid state).
- **Platform admin on `/dashboard`:** Uses their assigned `tenant_id` from app_metadata — same stats as tenant users. `/admin/dashboard` remains the admin KPI view.
- **User with no tenant_id and no platform_admin role:** Shouldn't reach the page (auth middleware redirects), but `/api/orders/stats` already handles this with a 403.
- **Stats fetch fails:** Tiles should fail silently (as they do on `/orders`), not break the whole page.
- **Recent orders fetch fails:** Show an error state inline ("Bestellungen konnten nicht geladen werden. Bitte Seite neu laden."), not a full-page error.
- **Tenant admin count:** Only `status = 'active'` users are counted — inactive/deactivated users are excluded.

## Technical Requirements

- **No new API endpoints needed:** Reuse `GET /api/orders/stats` (stats tiles) and `GET /api/orders?limit=5` (recent orders). Team member count can be fetched server-side at page load from `user_profiles` via the existing Supabase client.
- **No new database migrations.**
- **Component reuse:** `DashboardStats` from `src/components/orders/dashboard-stats.tsx` is used as-is. The recent orders table is a simple new component specific to this page.
- **Server + client split:** Team member count and initial recent orders can be fetched server-side (SSR). Stats tiles are client-side (need polling).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
