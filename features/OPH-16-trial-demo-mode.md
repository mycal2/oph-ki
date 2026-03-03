# OPH-16: Trial-/Demo-Modus für Interessenten

## Status: In Progress
**Created:** 2026-03-03
**Last Updated:** 2026-03-03

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

