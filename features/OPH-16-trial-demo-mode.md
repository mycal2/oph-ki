# OPH-16: Trial-/Demo-Modus für Interessenten

## Status: Deployed
**Created:** 2026-03-03
**Last Updated:** 2026-03-03
**Deployed:** 2026-03-03

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) — `tenants.status = 'trial'` already in schema
- Requires: OPH-10 (E-Mail-Weiterleitungs-Ingestion) — trial rides on the same inbound email pipeline
- Requires: OPH-4 (KI-Datenextraktion) — trial reuses the same extraction engine
- Restricts: OPH-6 (ERP-Export) — blocked for trial tenants
- Restricts: OPH-9 (ERP-Mapping-Konfiguration) — blocked for trial tenants

## Konzept
Potenzielle Kunden (Interessenten) erhalten einen zeitlich begrenzten Demo-Zugang (28 Tage). Sie senden Bestellungs-E-Mails an ihre dedizierte Weiterleitungsadresse und erhalten automatisch eine Antwort-E-Mail mit den extrahierten Daten (Textübersicht + CSV-Anhang + Magic-Link zur Vorschau). Kein Web-Login nötig — der gesamte Workflow ist E-Mail-basiert. Nach Ablauf der Testphase wird der Admin benachrichtigt und entscheidet manuell über die weitere Vorgehensweise.

---

## User Stories

- Als Vertriebsmitarbeiter möchte ich im Admin-Panel einen Interessenten als Trial-Mandanten anlegen, damit dieser sofort seinen E-Mail-Workflow testen kann — ohne dass ein vollständiger Onboarding-Prozess nötig ist.
- Als Interessent möchte ich eine Bestellungs-E-Mail weiterleiten und automatisch eine Antwort mit den extrahierten Daten erhalten (Textübersicht + CSV + Vorschau-Link), damit ich die Plattform ohne Web-Login evaluieren kann.
- Als Interessent möchte ich über einen Magic-Link eine strukturierte, lesbare Vorschau der extrahierten Bestellung aufrufen können, ohne mich registrieren zu müssen — damit ich das Ergebnis auch mit Kollegen teilen kann.
- Als Admin möchte ich 7 Tage vor Ablauf der Testphase eine Benachrichtigungs-E-Mail erhalten, damit ich den Interessenten rechtzeitig kontaktieren kann.
- Als Admin möchte ich im Mandanten-Dashboard sehen, wann die Testphase eines Trial-Mandanten endet, damit ich den Überblick über laufende Demos behalte.

---

## Acceptance Criteria

1. **Trial-Mandant anlegen:** Admin kann beim Erstellen oder Bearbeiten eines Mandanten `status = trial` setzen. Das Startdatum (`trial_started_at`) wird automatisch auf das Erstellungsdatum gesetzt; das Ablaufdatum (`trial_expires_at`) wird auf 28 Tage später gesetzt.

2. **Admin-Übersicht:** In der Mandanten-Liste zeigt ein Trial-Mandant:
   - Badge "Trial" neben dem Namen
   - Verbleibende Tage bis zum Ablauf (z.B. "Noch 14 Tage")
   - Roter Hinweis wenn ≤ 7 Tage verbleiben

3. **E-Mail-Antwort nach Extraktion:** Wenn ein Trial-Mandant eine E-Mail einsendet und die KI-Extraktion abgeschlossen ist, erhält der Absender automatisch eine Antwort-E-Mail mit:
   - Einer lesbaren Textübersicht der extrahierten Bestelldaten (Bestellnummer, Datum, Artikel, Mengen, Gesamtbetrag)
   - Einem CSV-Datei-Anhang der extrahierten Bestellung
   - Einem Magic-Link zur read-only Vorschauseite (gültig 30 Tage)
   - Einem Hinweis auf die Vollversion der Plattform

4. **Magic-Link-Vorschauseite:** Eine öffentliche, token-geschützte Seite (`/orders/preview/[token]`) zeigt die extrahierten Bestelldaten in einer übersichtlichen, markenlosen Darstellung an — ohne Login-Anforderung. Die Seite ist schreibgeschützt (keine Aktionsbuttons außer "Vollversion testen"-CTA).

5. **Magic-Link-Ablauf:** Nach 30 Tagen ist der Magic-Link ungültig. Die Seite zeigt dann eine freundliche Meldung "Diese Vorschau ist nicht mehr verfügbar."

6. **Zugangsbeschränkungen für Trial-Mandanten:**
   - Kein Web-App-Login möglich (Login-Versuch zeigt Hinweis "Ihr Konto ist ein Trial-Konto. Bitte nutzen Sie die E-Mail-Weiterleitung.")
   - Kein Zugang zur ERP-Export-Funktion (API gibt 403 zurück)
   - Kein Zugang zur ERP-Mapping-Konfiguration (API gibt 403 zurück)
   - Keine Team-Einladungen möglich (API gibt 403 zurück)

7. **Trial-Ablauf-Benachrichtigung:** 7 Tage vor `trial_expires_at` erhält der Platform-Admin eine E-Mail mit dem Namen des Mandanten, dem Ablaufdatum und einem Link zur Admin-Mandantenübersicht. Am Tag des Ablaufs erhält der Admin eine zweite Benachrichtigung.

8. **Kein automatisches Deaktivieren:** Nach Ablauf der 28 Tage bleibt der Mandant aktiv (Admin entscheidet manuell). Eingehende E-Mails werden weiterhin verarbeitet — der Admin wird jedoch täglich benachrichtigt, bis der Status geändert wird.

---

## Edge Cases

- **Extraktion schlägt fehl:** Wenn die KI-Extraktion für einen Trial-Mandanten fehlschlägt, erhält der Absender eine E-Mail "Leider konnten die Bestelldaten nicht automatisch erkannt werden. Bitte prüfen Sie das Dokument-Format."
- **Mehrere E-Mails vom gleichen Absender:** Jede E-Mail erzeugt eine separate Bestellung mit eigenem Magic-Link — keine Zusammenführung.
- **Magic-Link geteilt:** Akzeptiertes Verhalten — die Vorschauseite ist bewusst öffentlich zugänglich (read-only, kein Schaden möglich).
- **Admin ändert Trial → Active:** Alle Beschränkungen werden sofort aufgehoben; die Antwort-E-Mail-Logik für die Vollversion bleibt bestehen (keine Trial-spezifische Antwort mehr).
- **Trial-Mandant sendet E-Mail von nicht-autorisiertem Absender:** Gleiche Quarantäne-Logik wie bei normalen Mandanten — kein Sonderverhalten.
- **Vorschauseite nach Ablauf:** Zeigt eine Hinweisseite "Vorschau abgelaufen" — kein 404, kein Server-Fehler.
- **CSV-Generierung schlägt fehl:** Antwort-E-Mail wird trotzdem versendet, aber ohne CSV-Anhang; ein Hinweis in der E-Mail erklärt das Fehlen des Anhangs.

---

## Technical Requirements

- Neue DB-Spalten auf `tenants`: `trial_started_at TIMESTAMPTZ`, `trial_expires_at TIMESTAMPTZ`
- Neue DB-Spalten auf `orders`: `preview_token TEXT UNIQUE`, `preview_token_expires_at TIMESTAMPTZ`
- Trial-Erkennung im inbound E-Mail webhook: `tenant.status === 'trial'` → andere Post-Extraction-Logik
- Trial-Antwort-E-Mail ausgelöst am Ende der Extraktion (nicht sofort bei Empfang)
- CSV-Generierung im Extraktion-Endpunkt für Trial-Tenants (kein ERP-Mapping nötig, einfache Spalten-Benennung)
- Cron Job: Tägliche Prüfung ablaufender Trial-Mandanten → Admin-Benachrichtigung
- Öffentliche Vorschauseite: kein Auth-Middleware, Token-Validierung in der API-Route
- Login-Seite: Trial-Tenant-Erkennung vor dem Login → Hinweis-Meldung

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

**Designed:** 2026-03-03

---

### Overview

OPH-16 is entirely email-based — trial tenants have no user accounts and never log in. The system reuses the existing inbound email pipeline (OPH-10) and AI extraction engine (OPH-4), with three key additions:

1. **After-extraction email reply** — instead of the current "Eingang bestätigt" confirmation, trial tenants receive their extracted data (text summary + CSV + magic link) once extraction completes.
2. **Public magic-link preview page** — a token-gated read-only page outside the normal auth middleware.
3. **Trial expiry monitoring** — a daily cron job notifies the platform admin as trial periods approach their end.

---

### Component Structure

```
Changes to Existing Pages
+-- Login Page (/login)
|   +-- Trial tenant detection (before sign-in attempt)
|   +-- "Ihr Konto ist ein Trial-Konto" hint banner (no form)

+-- Admin: Tenant List (/admin/tenants)
|   +-- TenantRow (EXISTING)
|   |   +-- "Trial" Badge (new — shown when status = 'trial')
|   |   +-- "Noch X Tage" countdown (new)
|   |   +-- Red warning indicator (≤ 7 days)

New Public Pages (no login required)
+-- Order Preview Page (/orders/preview/[token])
    +-- PreviewHeader (branding-neutral, IDS logo only)
    +-- OrderSummaryCard (read-only extracted data display)
    |   +-- Bestellnummer, Datum, Händler, Gesamtbetrag
    +-- LineItemsTable (read-only list of articles)
    +-- "Vollversion testen" CTA button
    +-- ExpiredTokenMessage (shown when token invalid/expired)
```

---

### Data Model Additions

**Table: `tenants`** — two new columns:

| Column | Type | Purpose |
|--------|------|---------|
| `trial_started_at` | Timestamp (with timezone) | Set automatically when tenant is created with `status = 'trial'` |
| `trial_expires_at` | Timestamp (with timezone) | Set to `trial_started_at + 28 days` automatically |

**Table: `orders`** — two new columns:

| Column | Type | Purpose |
|--------|------|---------|
| `preview_token` | Text (unique) | Cryptographically random token for the magic link |
| `preview_token_expires_at` | Timestamp (with timezone) | Set to order creation + 30 days |

No new tables required — all trial data lives in existing tables.

---

### Backend: API Changes

#### 1. Modified — Tenant Create/Update API (`/api/admin/tenants`)

When `status = 'trial'` is set on a new or updated tenant:
- Auto-populate `trial_started_at = now()`
- Auto-populate `trial_expires_at = now() + 28 days`

When status changes from `'trial'` to `'active'`:
- Trial date columns are preserved for audit purposes
- All restrictions are lifted immediately (no extra action needed — they check `status` at runtime)

#### 2. Modified — Inbound Email Webhook (`/api/inbound/email`)

New behavior for trial tenants (`tenant.status === 'trial'`):

- **Sender authorization**: Instead of matching against user profiles (trial tenants have none), the webhook compares the sender's email address against `tenant.contact_email`. If it matches → proceed. If not → quarantine (same quarantine logic as normal tenants).
- **Preview token generation**: After the order is created, generate a unique preview token (`crypto.randomBytes(32).toString('hex')`) and write it + `preview_token_expires_at` (order creation + 30 days) to the order row.
- **No confirmation email on receipt**: The current "Eingang bestätigt" email is suppressed for trial tenants. The sender receives the full result email after extraction completes instead.

#### 3. Modified — AI Extraction Endpoint (`/api/orders/[orderId]/extract`)

At the end of a successful extraction for a trial tenant:

- **Detect trial**: After storing extraction results, look up `tenant.status` — if `'trial'`, enter trial post-processing.
- **Generate CSV**: Produce a flat CSV from extracted line items using simple default column names (`Artikelnummer`, `Bezeichnung`, `Menge`, `Einheit`, `Preis`). No ERP mapping configuration required.
- **Send trial result email** (via Postmark, using `after()` for non-blocking):
  - **To**: The order's `sender_email`
  - **Body**: Human-readable text summary (order number, date, dealer, item count, total)
  - **Attachment**: The generated CSV file
  - **Magic link**: `https://your-app.vercel.app/orders/preview/[preview_token]`
  - **Tagline**: Brief mention of the full platform

If extraction fails for a trial tenant → send a "konnte nicht erkannt werden" failure notification email (plain text, no attachment).

#### 4. New — Public Preview API (`/api/orders/preview/[token]`)

- **No authentication required** — public endpoint
- Looks up the order by `preview_token`
- Validates that `preview_token_expires_at` is in the future
- Returns the order's `extracted_data` in a safe read-only format
- If token is invalid or expired → returns a specific "expired" error code (not a 404, so the page can show a friendly message)

#### 5. New — Trial Expiry Cron Job (`/api/cron/trial-expiry-check`)

- **Schedule**: Daily (e.g. 08:00 UTC via Vercel Cron)
- **Authorization**: Same `CRON_SECRET` pattern as existing cleanup cron
- **Logic**:
  1. Find all tenants with `status = 'trial'` and `trial_expires_at` between now and now + 7 days → send "7 Tage verbleibend" warning email to platform admin
  2. Find all tenants with `status = 'trial'` and `trial_expires_at` on today's date → send "Testphase abgelaufen" alert to platform admin
  3. Find all tenants with `status = 'trial'` and `trial_expires_at` more than 1 day in the past → send daily "Bitte handeln" reminder until admin changes status

#### 6. Modified — ERP-restricted Endpoints

The following existing endpoints gain a new guard: if the requesting user belongs to a tenant with `status = 'trial'`, return `403` with a clear message:

- `GET/POST /api/orders/[orderId]/export` (ERP export — OPH-6)
- `GET/PUT /api/admin/erp-configs/[tenantId]` (ERP mapping — OPH-9)
- `POST /api/admin/tenants/[id]/users/invite` (team invitations)

The check is added after the existing authentication — no change to auth flow.

#### 7. Modified — Login Page

Before attempting Supabase sign-in, the login form checks: does a tenant with `status = 'trial'` exist for the entered email (matched against `tenants.contact_email`)? If yes → show an inline banner ("Ihr Konto ist ein Trial-Konto. Bitte nutzen Sie die E-Mail-Weiterleitung.") and do not submit the sign-in form.

---

### New Public Route (Outside Auth Middleware)

The file `src/app/orders/preview/[token]/page.tsx` lives **outside** the `(protected)` route group, so Next.js middleware does not require authentication for it. The page fetches data from `/api/orders/preview/[token]` at render time (server component).

---

### Tech Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Token format | 32-byte hex string (64 chars), stored in DB | Cryptographically random, unguessable, easy to include in URLs |
| Token validity | 30 days | Long enough for prospects to share/revisit, spec requirement |
| CSV format | Flat, generic columns | No ERP mapping needed for trial — simplicity wins |
| Trial reply timing | After extraction (not on receipt) | Prospect sees real results, not just "we got your email" |
| Sender auth for trial | Match against `contact_email` | Trial tenants have no user accounts by design |
| Preview page location | `src/app/orders/preview/` (outside `(protected)/`) | Bypasses auth middleware automatically — no config change |
| No auto-deactivation | Admin decides manually | Avoids silent data loss; spec requirement |
| Cron secret | Reuse existing `CRON_SECRET` env var | No new secrets to manage |

---

### Dependencies (No New Packages)

All required functionality is available in existing packages:
- **Token generation**: Node.js built-in `crypto.randomBytes()`
- **CSV generation**: Manual string assembly (no external lib needed for simple flat CSV)
- **Email sending**: Existing Postmark integration (`POSTMARK_SERVER_API_TOKEN`)
- **Cron scheduling**: Vercel Cron (configuration in `vercel.json`)

---

### Files to Create / Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/019_oph16_trial_columns.sql` | Create | Add trial columns to `tenants` + `preview_token` columns to `orders` |
| `src/app/orders/preview/[token]/page.tsx` | Create | Public magic-link preview page |
| `src/app/api/orders/preview/[token]/route.ts` | Create | Public API — fetch order by token |
| `src/app/api/cron/trial-expiry-check/route.ts` | Create | Daily cron for trial expiry notifications |
| `src/lib/postmark.ts` | Modify | Add `sendTrialResultEmail()` and `sendTrialFailureEmail()` functions |
| `src/app/api/inbound/email/route.ts` | Modify | Trial sender auth + preview token generation + suppress confirmation |
| `src/app/api/orders/[orderId]/extract/route.ts` | Modify | Post-extraction trial CSV + result email logic |
| `src/app/api/admin/tenants/route.ts` | Modify | Auto-set `trial_started_at` / `trial_expires_at` on create |
| `src/app/api/admin/tenants/[id]/route.ts` | Modify | Auto-set trial dates on status update to 'trial' |
| `src/app/api/orders/[orderId]/export/route.ts` | Modify | Add trial tenant 403 guard |
| `src/app/api/admin/erp-configs/[tenantId]/route.ts` | Modify | Add trial tenant 403 guard |
| `src/app/api/admin/tenants/[id]/users/invite/route.ts` | Modify | Add trial tenant 403 guard |
| `src/app/login/page.tsx` | Modify | Trial tenant detection before sign-in |
| `src/components/admin/tenant-list.tsx` (or similar) | Modify | Trial badge + countdown in tenant list |
| `vercel.json` | Modify | Add cron schedule for trial-expiry-check |

---

### Verification Steps

1. `npm run build` passes with no TypeScript errors
2. DB migration applied — trial columns visible in Supabase
3. Create a trial tenant in admin → `trial_started_at` and `trial_expires_at` set correctly
4. Send inbound email from `contact_email` → order created, extraction triggered
5. After extraction → sender receives reply email with text, CSV attachment, and magic link
6. Open magic link → preview page shows extracted data (no login prompt)
7. Open magic link after 30 days (or set token expiry to past in DB) → expired message shown
8. Attempt login with trial tenant's email → "Trial-Konto" message shown, no sign-in
9. Attempt ERP export API call with trial tenant → 403 returned
10. Cron endpoint triggered manually → admin notification email sent for expiring trial

---

## QA Test Results

**Tested:** 2026-03-03
**Build Status:** `npm run build` passes cleanly (0 TypeScript errors)
**Tester:** QA Engineer (AI)

### Acceptance Criteria Status

#### AC-1: Trial-Mandant anlegen
- [x] Admin can set `status = trial` when creating a new tenant (validation schema accepts "trial")
- [x] `trial_started_at` is auto-set to `now()` on creation (`POST /api/admin/tenants`, line 128-133)
- [x] `trial_expires_at` is auto-set to `now() + 28 days` on creation
- [x] Admin can set `status = trial` when editing an existing tenant (`PATCH /api/admin/tenants/[id]`, line 116-124)
- [x] Trial dates are auto-set when updating an existing tenant from non-trial to trial status
- [x] Trial dates are preserved when status changes from trial to active (no clearing logic exists)
- [x] Status dropdown in TenantFormSheet includes "Testphase" option
- [x] Hint text shown when creating a new trial tenant ("Testphase: 28 Tage ab Erstellung")
- **PASS**

#### AC-2: Admin-Uebersicht
- [x] "Testphase" badge shown in the tenant list for trial tenants (STATUS_BADGES includes `trial`)
- [x] "Noch X Tage" countdown displayed via `getTrialDaysRemaining()` function
- [x] Red warning indicator shown when <= 7 days remaining (`isTrialUrgent` check)
- [x] "Abgelaufen" text shown when trial has expired (`isTrialExpired` check)
- [x] Trial period dates shown in the tenant edit sheet (started at + expires at)
- [x] Red expiry date in edit sheet when <= 7 days remaining
- **PASS**

#### AC-3: E-Mail-Antwort nach Extraktion
- [x] Trial detection in extraction endpoint (`tenant.status === 'trial'`)
- [x] CSV generation with simple column headers (Pos, Artikelnummer, Bezeichnung, Menge, Einheit, Einzelpreis, Gesamtpreis)
- [x] `sendTrialResultEmail()` sends text summary with order number, date, dealer, item count, total
- [x] CSV attachment included in the email via Postmark API
- [x] Magic link included: `${siteUrl}/orders/preview/${previewToken}`
- [x] "Vollversion" mention included in the email text
- [x] Email sent via `after()` for non-blocking execution
- [x] Confirmation email suppressed for trial tenants (`!isTrial` guard on line 431)
- **PASS**

#### AC-4: Magic-Link-Vorschauseite
- [x] Public page at `/orders/preview/[token]` exists outside `(protected)` route group
- [x] No login required (middleware marks `/orders/preview` as public route)
- [x] Token-based data lookup via `/api/orders/preview/[token]` using service role client
- [x] Read-only display: OrderSummaryCard shows order data, LineItemsTable shows line items
- [x] PreviewHeader shows only IDS logo (branding-neutral)
- [x] "Vollversion testen" CTA button present (PreviewCtaSection)
- [x] No action buttons besides CTA
- [ ] **BUG-1:** Authenticated users visiting the preview page are redirected to `/dashboard` (see Bugs section)
- **PARTIAL PASS** (blocked for authenticated users)

#### AC-5: Magic-Link-Ablauf
- [x] Token expiry check in preview API (`expiresAt.getTime() < Date.now()`)
- [x] Expired token returns `{ status: "expired" }` response (not 404)
- [x] ExpiredTokenMessage component shows friendly "Diese Vorschau ist nicht mehr verfuegbar"
- [x] 30-day token validity set at order creation time in inbound webhook
- **PASS**

#### AC-6: Zugangsbeschraenkungen fuer Trial-Mandanten
- [x] Login detection via `/api/auth/check-trial` endpoint before sign-in
- [x] Trial banner shown: "Ihr Konto ist ein Trial-Konto" with email forwarding instructions
- [x] Login form does not submit when trial detected (`setIsTrialTenant(true); return;`)
- [x] ERP export: 403 guard on `GET /api/orders/[orderId]/export` (checks `appMetadata.tenant_status === 'trial'`)
- [x] ERP config GET: 403 guard on `GET /api/admin/erp-configs/[tenantId]` (checks `tenant.status === 'trial'`)
- [x] ERP config PUT: 403 guard on `PUT /api/admin/erp-configs/[tenantId]` (checks `tenant.status === 'trial'`)
- [x] Team invitations: 403 guard on `POST /api/admin/tenants/[id]/users/invite` (checks `tenant.status === 'trial'`)
- [ ] **BUG-2:** Check-trial endpoint lacks rate limiting -- enumeration risk (see Security Audit)
- [ ] **BUG-3:** Trial login detection matches by contact_email only, not by user email (see Bugs section)
- **PARTIAL PASS** (security concern on check-trial, edge case on login detection)

#### AC-7: Trial-Ablauf-Benachrichtigung
- [x] Daily cron job scheduled at 08:00 UTC (`vercel.json` configured)
- [x] Secured via `CRON_SECRET` bearer token
- [x] Finds trial tenants with 7 days remaining (`daysRemaining === 7`)
- [x] Finds trial tenants with expiry today or past (`daysRemaining <= 0`)
- [x] Sends consolidated email to `PLATFORM_ADMIN_EMAIL` via Postmark
- [x] Email includes tenant name, expiry date, and admin link
- [ ] **BUG-4:** 7-day warning only triggers on exactly day 7, not on days 1-6 (see Bugs section)
- **PARTIAL PASS** (gap in notification coverage for days 1-6)

#### AC-8: Kein automatisches Deaktivieren
- [x] No auto-deactivation logic exists anywhere in the codebase
- [x] Expired trial tenants continue to process inbound emails (no expiry check in webhook)
- [x] Daily reminder emails sent after expiry (`daysRemaining <= 0` in cron job)
- **PASS**

### Edge Cases Status

#### EC-1: Extraktion schlaegt fehl
- [x] `sendTrialFailureEmail()` function sends failure notification to sender
- [x] Triggered in the `catch` block of the extraction endpoint (line 580-614)
- [x] Message: "Leider konnten die Bestelldaten nicht automatisch erkannt werden"
- **PASS**

#### EC-2: Mehrere E-Mails vom gleichen Absender
- [x] Each email creates a separate order with its own `preview_token`
- [x] No aggregation or deduplication by sender (only by Message-ID)
- **PASS**

#### EC-3: Magic-Link geteilt
- [x] Preview page is public (no auth check), sharing is accepted behavior
- [x] Read-only display, no state-changing actions possible
- **PASS**

#### EC-4: Admin aendert Trial -> Active
- [x] Status change from trial to active auto-handled by runtime `status` checks
- [x] All restrictions lift immediately (403 guards check `status` at request time)
- [x] Trial date columns preserved for audit (no clearing logic)
- **PASS**

#### EC-5: Trial-Mandant sendet E-Mail von nicht-autorisiertem Absender
- [x] Quarantine logic applied for non-matching senders (same as normal tenants)
- [x] Quarantine notification suppressed for trial tenants (no admin users to notify)
- **PASS**

#### EC-6: Vorschauseite nach Ablauf
- [x] Shows "Diese Vorschau ist nicht mehr verfuegbar" (ExpiredTokenMessage)
- [x] No 404, no server error -- returns HTTP 200 with `status: "expired"`
- **PASS**

#### EC-7: CSV-Generierung schlaegt fehl
- [ ] **BUG-5:** CSV generation is not wrapped in try/catch. If it throws, the entire trial post-processing fails silently and no email is sent at all. The spec requires the email to be sent without the CSV attachment with an explanatory note.
- **FAIL**

### Security Audit Results

#### Authentication & Authorization
- [x] Preview API uses service role client (correctly bypasses RLS for public access)
- [x] Preview API validates token length >= 32 characters
- [x] Cron endpoint secured with CRON_SECRET bearer token
- [x] ERP export 403 guard placed after existing authentication (no auth bypass)
- [x] ERP config 403 guard placed after existing authentication
- [x] Team invite 403 guard placed after existing authentication
- [x] Token is 32-byte hex (64 chars) -- cryptographically random via `crypto.randomBytes(32)`

#### Input Validation
- [x] Tenant create/update schemas accept "trial" status via Zod validation
- [x] Preview token validated for minimum length before DB query
- [x] Postmark inbound payload validated via Zod schema
- [ ] **BUG-6 (Security):** `/api/auth/check-trial` has no Zod validation or input sanitization on the email field. It directly passes user input to a Supabase `.eq()` query. While Supabase parameterizes queries (preventing SQL injection), the endpoint also lacks rate limiting, allowing unlimited email enumeration.
- [ ] **BUG-7 (Security):** `/api/orders/preview/[token]` returns HTTP 200 for all responses (valid, expired, not_found). While this prevents information leakage via HTTP status codes, the response body still differentiates between "expired" and "not_found", which could allow token enumeration. An attacker can distinguish between tokens that existed but expired vs. tokens that never existed.

#### Rate Limiting
- [ ] **BUG-6 (repeated):** The `/api/auth/check-trial` endpoint is fully public with no rate limiting. An attacker could enumerate email addresses to discover which ones are associated with trial tenants.
- [x] Cron endpoint: rate limited by CRON_SECRET requirement
- [x] Admin endpoints: rate limited via `checkAdminRateLimit()`

#### Data Exposure
- [x] Preview API does not expose `tenant_id`, `uploaded_by`, or internal IDs beyond the order ID
- [x] Preview API does not expose the `preview_token` itself in the response
- [x] Preview API selects only necessary fields from the orders table
- [x] Check-trial endpoint only returns `{ isTrial: boolean }` -- minimal information

#### Secret Management
- [x] `PLATFORM_ADMIN_EMAIL` documented in `.env.local.example`
- [x] No secrets hardcoded in source code
- [x] `SUPABASE_SERVICE_ROLE_KEY` used only server-side (no NEXT_PUBLIC_ prefix)

#### Cross-Site Scripting (XSS)
- [x] Preview page uses React (auto-escaped by default)
- [x] Line items and order data displayed via text content (not dangerouslySetInnerHTML)
- [x] CSV generation properly escapes double quotes (`replace(/"/g, '""')`)

### Responsive Design Review (Code Analysis)

#### Preview Page (375px / 768px / 1440px)
- [x] `max-w-3xl` container with responsive padding (`px-4 sm:px-6 lg:px-8`)
- [x] OrderSummaryCard: `grid-cols-1 sm:grid-cols-2` responsive grid
- [x] LineItemsTable: Article number column hidden on mobile (`hidden sm:table-cell`)
- [x] LineItemsTable: Unit price column hidden on mobile and tablet (`hidden md:table-cell`)
- [x] LineItemsTable: Total price column hidden on mobile (`hidden sm:table-cell`)
- [x] LineItemsTable: `overflow-x-auto` for horizontal scroll on narrow screens
- [x] PreviewCtaSection: `flex-col sm:flex-row` layout for CTA section
- [x] Footer responsive with centered text

#### Admin Tenant Table (Trial indicators)
- [x] Trial countdown shown in status column (hidden on mobile via `hidden sm:table-cell`)
- [x] Trial info in form sheet responsive via sheet's built-in `sm:max-w-xl`

### Regression Testing

#### OPH-1 (Multi-Tenant Auth)
- [x] `TenantStatus` type includes "trial" (already in schema as CHECK constraint)
- [x] Login form still functional for non-trial users
- [x] Middleware still correctly handles public routes, auth redirects
- [x] Session timeout logic unaffected

#### OPH-6 (ERP Export)
- [x] Export route still functional for active tenants (trial guard is additive)
- [x] No changes to export logic beyond the 403 guard

#### OPH-9 (ERP Mapping)
- [x] ERP config GET/PUT still functional for active tenants
- [x] Trial guard added after auth check (does not affect active tenants)

#### OPH-10 (Email Ingestion)
- [x] Normal tenant email flow unaffected (isTrial=false path preserved)
- [x] Confirmation email still sent for non-trial tenants
- [x] Quarantine logic still works for both trial and normal tenants
- [x] Duplicate detection (Message-ID) still functional

#### OPH-8 (Tenant Management)
- [x] Tenant list page still loads correctly
- [x] Create/edit sheet still works for active/inactive tenants
- [x] User management tab still functional
- [x] CSV export still works

### Bugs Found

#### BUG-1: Authenticated users redirected away from preview page
- **Severity:** High
- **Steps to Reproduce:**
  1. Log in to the platform as any user
  2. Navigate to `/orders/preview/[valid-token]`
  3. Expected: Preview page displays the order data
  4. Actual: User is redirected to `/dashboard` because the middleware treats `/orders/preview` as a public route and redirects authenticated users on public routes to the dashboard
- **Root Cause:** In `src/lib/supabase/middleware.ts` line 115, the authenticated-user redirect only excludes `/reset-password` and `/auth/callback` but not `/orders/preview`. The condition should also exclude the preview route.
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/supabase/middleware.ts` line 115
- **Priority:** Fix before deployment

#### BUG-2: Check-trial endpoint lacks rate limiting and input validation
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Send POST requests to `/api/auth/check-trial` with different email addresses
  2. No rate limit is enforced; all requests succeed
  3. An attacker can enumerate which email addresses belong to trial tenants
- **Root Cause:** The `/api/auth/check-trial` endpoint has no Zod validation on the email field and no rate limiting mechanism.
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/auth/check-trial/route.ts`
- **Priority:** Fix before deployment (add rate limiting or throttle)

#### BUG-3: Trial login detection matches contact_email not user email
- **Severity:** Low
- **Steps to Reproduce:**
  1. Create a trial tenant with `contact_email = "admin@acme.com"`
  2. Try to log in with email "employee@acme.com" (a different email at the same company)
  3. Expected: The trial banner should appear (the user is trying to access a trial tenant)
  4. Actual: No trial banner appears; the login attempt proceeds normally and fails (since trial tenants have no user accounts)
- **Root Cause:** The check-trial endpoint matches only against `tenants.contact_email`, but the spec says the login page should detect "trial tenant" before sign-in. If someone enters an email that is not the contact_email but would still fail login (no user account exists), they get a confusing generic error instead of the trial banner.
- **Note:** This is a design decision documented in the tech design ("match against contact_email"), so it may be intentional. But it creates a confusing UX for prospect employees who are not the designated contact.
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/auth/check-trial/route.ts` line 42
- **Priority:** Nice to have (consider in next iteration)

#### BUG-4: 7-day warning notification only triggers on exactly day 7
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Create a trial tenant that expires in 5 days
  2. Run the cron job
  3. Expected: The admin should receive a warning (5 days is <= 7 and > 0)
  4. Actual: No warning is sent because the cron job only checks `daysRemaining === 7` (strict equality)
- **Root Cause:** In `src/app/api/cron/trial-expiry-check/route.ts` line 76, the condition is `daysRemaining === 7` instead of `daysRemaining > 0 && daysRemaining <= 7`. The spec says "7 Tage vor trial_expires_at" which could mean exactly 7 days, but the intent seems to be "within 7 days of expiry". More importantly, if the cron job misses a day (e.g., Vercel cold start delay), the 7-day notification would never be sent.
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/cron/trial-expiry-check/route.ts` line 76
- **Priority:** Fix before deployment (change to `daysRemaining > 0 && daysRemaining <= 7` or at minimum also check days 1-6)

#### BUG-5: CSV generation failure kills entire trial email flow
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Trigger extraction for a trial tenant where `line_items` data causes an error during CSV generation (e.g., unexpected null values in nested properties)
  2. Expected: Email is sent without CSV attachment, with explanatory note
  3. Actual: The entire `after()` callback fails, no email is sent at all
- **Root Cause:** In `src/app/api/orders/[orderId]/extract/route.ts` lines 517-530, the CSV generation code is not wrapped in its own try/catch. The spec (Edge Case EC-7) explicitly requires: "Antwort-E-Mail wird trotzdem versendet, aber ohne CSV-Anhang; ein Hinweis in der E-Mail erklaert das Fehlen des Anhangs." The `sendTrialResultEmail` call on line 537 assumes `csvContent` is always valid.
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/extract/route.ts` lines 517-557
- **Priority:** Fix before deployment

#### BUG-6: Preview token differentiation enables token enumeration
- **Severity:** Low
- **Steps to Reproduce:**
  1. Send GET request to `/api/orders/preview/[random-64-char-hex]`
  2. Response: `{ status: "not_found" }`
  3. Send GET request to `/api/orders/preview/[real-but-expired-token]`
  4. Response: `{ status: "expired" }`
  5. An attacker can distinguish between tokens that never existed vs. tokens that did exist but expired
- **Root Cause:** The preview API returns different `status` values for "not found" vs. "expired" tokens. While the risk is low (tokens are 64-char hex, brute force is infeasible), defense-in-depth suggests returning the same response for both cases.
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/preview/[token]/route.ts` lines 58-73
- **Priority:** Nice to have

#### BUG-7: Invite button visible for trial tenants in admin UI
- **Severity:** Low
- **Steps to Reproduce:**
  1. Open the admin tenant management page
  2. Click on a trial tenant to open the edit sheet
  3. Switch to the "Benutzer" tab
  4. The "Einladen" button is visible and clickable
  5. Expected: The button should be hidden or disabled for trial tenants (API returns 403 anyway)
  6. Actual: Clicking "Einladen" opens the invite dialog; submitting it will get a 403 error from the API
- **Root Cause:** The TenantFormSheet does not check `status === 'trial'` to hide the invite button. The API correctly blocks the action, but the UI should indicate the restriction proactively.
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/admin/tenant-form-sheet.tsx` line 478
- **Priority:** Nice to have

### Cross-Browser Compatibility (Code Analysis)
- [x] No browser-specific APIs used (all standard Web APIs and React patterns)
- [x] `crypto.randomBytes()` is Node.js server-side only (not browser-dependent)
- [x] `Intl.NumberFormat` and `Date.toLocaleDateString` are widely supported
- [x] CSS uses Tailwind utility classes (cross-browser compatible)
- [x] Next.js Image component used for logo (optimized for all browsers)

### Summary
- **Acceptance Criteria:** 6/8 fully passed, 2 partial passes (AC-4 has BUG-1, AC-6 has BUG-2/3, AC-7 has BUG-4)
- **Edge Cases:** 6/7 passed, 1 failed (EC-7: CSV failure handling)
- **Bugs Found:** 7 total (0 critical, 1 high, 3 medium, 3 low)
- **Security:** Minor concerns (rate limiting on check-trial, token enumeration via response differentiation)
- **Build:** Passes cleanly
- **Production Ready:** NO -- BUG-1 (High) must be fixed first. BUG-4 and BUG-5 (Medium) should also be fixed before deployment.
- **Recommendation:** Fix BUG-1, BUG-4, and BUG-5 before deployment. BUG-2 should ideally be addressed as well. BUG-3, BUG-6, and BUG-7 are nice-to-have improvements.

