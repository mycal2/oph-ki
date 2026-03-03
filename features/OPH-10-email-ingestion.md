# OPH-10: E-Mail-Weiterleitungs-Ingestion

## Status: In Progress
**Created:** 2026-02-27
**Last Updated:** 2026-03-02

## Dependencies
- Requires: OPH-4 (KI-Datenextraktion) — E-Mail-Inhalte werden gleich verarbeitet wie Web-Uploads
- Requires: OPH-1 (Multi-Tenant Auth) — Weiterleitungs-Adressen sind mandantenspezifisch

## Konzept
Jeder Mandant erhält eine dedizierte Weiterleitungs-E-Mail-Adresse (z.B. `kunde123@orders.platform.de`). Mitarbeiter leiten Bestellungs-E-Mails direkt aus ihrem E-Mail-Programm weiter — kein manuelles Hochladen nötig. Das System empfängt die E-Mail, speichert alle Anhänge und startet automatisch die Verarbeitungspipeline.

## User Stories
- Als Mitarbeiter möchte ich eine Bestellungs-E-Mail aus meinem E-Mail-Programm (Outlook, Gmail) mit einem Klick an eine spezielle Adresse weiterleiten, damit die Bestellung ohne manuellen Upload-Schritt automatisch verarbeitet wird.
- Als Mitarbeiter möchte ich nach der Weiterleitung eine automatische Bestätigungs-E-Mail erhalten, damit ich weiß, dass die Bestellung empfangen und in Verarbeitung ist.
- Als Mandanten-Admin möchte ich die dedizierte Weiterleitungs-E-Mail-Adresse meines Unternehmens in den Einstellungen sehen, damit ich sie meinen Mitarbeitern kommunizieren kann.
- Als System möchte ich E-Mails von unbekannten Absendern (außerhalb des Mandanten) ablehnen oder in eine Quarantäne-Queue legen, damit keine unautorisierten Bestellungen ins System gelangen.

## Acceptance Criteria
- [ ] Jeder Mandant hat eine eindeutige Weiterleitungs-E-Mail-Adresse (generiert bei Mandanten-Erstellung)
- [ ] Eingehende E-Mails werden vollständig verarbeitet: E-Mail-Header (Von, An, Betreff, Datum), Text-Body (Plain-Text + HTML), alle Anhänge (.pdf, .xlsx, .xls, .csv)
- [ ] Automatische Bestätigungs-E-Mail an den Weiterleiter mit Link zur Bestellung in der Platform
- [ ] E-Mails von nicht-autorisierten Absendern (nicht in der Mitarbeiter-Liste des Mandanten) → Quarantäne-Queue; Mandanten-Admin wird benachrichtigt
- [ ] Verarbeiteter E-Mail-Inhalt wird gleich behandelt wie ein Web-Upload (gleiche Extraktions-Pipeline ab OPH-3)
- [ ] Maximale Anhang-Größe: 25 MB pro Datei (gleich wie Web-Upload)
- [ ] Empfangs-Bestätigung wird innerhalb von 30 Sekunden nach Eingang versendet
- [ ] Original-E-Mail wird als .eml-Datei in Supabase Storage archiviert

## Edge Cases
- Was passiert, wenn eine E-Mail keine Anhänge hat (nur Text-Body)? → Wird trotzdem verarbeitet; Extraktion aus dem Text-Body
- Was passiert, wenn ein Anhang ein nicht-unterstütztes Format hat (z.B. .docx)? → Nicht-unterstützte Anhänge werden übersprungen; Warnung in der Bestellübersicht; unterstützte Anhänge werden normal verarbeitet
- Was passiert, wenn dieselbe E-Mail zweimal weitergeleitet wird? → Duplikat-Erkennung via Message-ID-Header; zweite Weiterleitung wird als Duplikat markiert; Benutzer erhält Hinweis
- Was passiert, wenn das E-Mail-Ingest-System ausfällt? → E-Mails bleiben auf dem Mail-Server; Retry nach Systemwiederherstellung (falls Mail-Provider Queue unterstützt)
- Was passiert, wenn eine E-Mail sehr groß ist (viele Anhänge, > 50 MB gesamt)? → Ablehnung mit Bounce-Nachricht "E-Mail zu groß"

## Technical Requirements
- E-Mail-Ingest: Integration mit Inbound-E-Mail-Service (z.B. Postmark Inbound, Sendgrid Inbound Parse, oder AWS SES)
- Webhook von E-Mail-Provider → Next.js API Route → Verarbeitungspipeline
- Message-ID-Hashing für Duplikat-Erkennung
- Quarantäne-Queue: Tabelle `email_quarantine` mit Admin-Review-UI
- Weiterleitungs-Adresse: `{tenant_slug}@inbound.{platform-domain}`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Email Provider: Postmark Inbound
Postmark receives emails sent to `{tenant_slug}@inbound.{domain}`, parses them fully (headers, body, attachments as Base64), and delivers the result as a single JSON payload to our webhook. No polling needed. Postmark signs every webhook request with an HMAC token so we can verify it is genuine.

### How the Email Flow Works (Step by Step)

```
Employee's Email Client
        |
        | forwards to acme@inbound.orders-platform.de
        ▼
Postmark Inbound (parses email, extracts attachments)
        |
        | POST JSON webhook to URL with secret token
        ▼
POST /api/inbound/email?token=SECRET  ←── No user login; secured by URL token
        |
        ├─ 1. Verify webhook token → reject if invalid
        ├─ 2. Look up tenant by "To" address slug
        ├─ 3. Check for duplicate (same Message-ID already processed)
        ├─ 4. Check sender authorization (is sender in tenant's team?)
        │        └─ If NOT authorized → save to email_quarantine table
        │                              → notify tenant admin
        │                              → return 200 OK to Postmark (don't retry)
        ├─ 5. Upload attachments + archived .eml to Supabase Storage
        ├─ 6. Create order record (status: "pending", source: "email_inbound")
        ├─ 7. Trigger dealer recognition + AI extraction pipeline (same as web upload)
        └─ 8. Send confirmation email to sender via Postmark API
```

### Component Structure

```
Settings Page (/settings)
+-- Eingangs-E-Mail Card (new tab)
    +-- Inbound address display (copy-to-clipboard button)
    +-- Setup instructions (how to forward, which file types work)
    +-- Link to email client setup guides

Admin Pages
+-- /admin/email-quarantine (new page)
    +-- Quarantine Table
    |   +-- Email row (sender, subject, received_at, tenant)
    |   +-- "Freigeben" button → creates order from quarantined email
    |   +-- "Ablehnen" button → marks as rejected
    +-- Empty State (no quarantined emails)
```

### Data Model

**Existing tables — new columns:**

`tenants` table gets:
- `inbound_email_address` — auto-generated as `{slug}@inbound.{domain}` (set when tenant is created or on first email received)

`orders` table gets:
- `source` — "web_upload" or "email_inbound" (for filtering and display)
- `message_id` — the email's Message-ID header (for duplicate detection)
- `sender_email` — the forwarding employee's email address

**New table: `email_quarantine`**
```
Each quarantined email stores:
- Unique ID
- Tenant (which company's inbound address was targeted)
- Sender email and name
- Subject line
- Message-ID (for deduplication)
- Received timestamp
- Storage path (the raw .eml file in Supabase Storage)
- Review status: "pending" | "approved" | "rejected"
- Reviewed by (admin user ID), reviewed at
- Action taken (if approved, the resulting order ID)
```

### API Routes

| Route | Method | Who calls it | Purpose |
|-------|--------|-------------|---------|
| `/api/inbound/email` | POST | Postmark webhook | Receives inbound email payload |
| `/api/settings/inbound-email` | GET | Tenant user (Settings page) | Returns tenant's inbound address |
| `/api/admin/email-quarantine` | GET | Admin | Lists all quarantined emails |
| `/api/admin/email-quarantine/[id]` | PATCH | Admin | Approve or reject a quarantined email |
| `/api/admin/email-quarantine/[id]/reprocess` | POST | Admin | Re-run pipeline on approved email → create order |

### Security

- **Webhook authentication**: Postmark does not support HMAC signatures. Instead, the webhook URL includes a secret token as a query parameter (`?token=SECRET`). The endpoint rejects any request without a valid token. Generate with `openssl rand -base64 32`.
- **No user session required**: The webhook endpoint is intentionally public but secured by the shared secret token. This is the standard pattern for Postmark inbound webhooks.
- **Sender allowlist**: Only users in the tenant's active team may trigger order creation. Others land in quarantine — platform admin reviews before orders are created.
- **Size limits**: Payloads > 25 MB per attachment are rejected before file upload.
- **Duplicate guard**: Message-ID checked against existing orders + quarantine before any processing.

### Tech Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Email provider | Postmark Inbound | Simplest setup, reliable delivery, great docs, EU-compatible |
| Parsing | Already built (`eml-parser.ts`) | `mailparser` library already in project |
| Confirmation email | Postmark API (existing sending) | Same service, no extra dependency |
| Archive format | .eml file in Supabase Storage | Exactly like web-uploaded .eml files — consistent |
| Duplicate detection | Message-ID header | Industry standard, unique per email globally |

### New Environment Variables

```
POSTMARK_INBOUND_WEBHOOK_TOKEN=   # Your own secret (openssl rand -base64 32)
POSTMARK_SERVER_API_TOKEN=        # Server API Token from Postmark dashboard
INBOUND_EMAIL_DOMAIN=             # e.g. inbound.your-domain.com
```

### Dependencies to Install

- `postmark` — Postmark Node.js client for sending confirmation emails

### DNS Setup Required (one-time, outside codebase)

- Add MX record for subdomain `inbound.your-domain.com` pointing to Postmark's inbound servers
- Verify domain in Postmark Dashboard
- Set webhook URL to `https://your-app.vercel.app/api/inbound/email?token=YOUR_TOKEN`

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
