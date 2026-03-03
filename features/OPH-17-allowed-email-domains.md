# OPH-17: Allowed Email Domains for Sender Authorization

## Status: In Progress
**Created:** 2026-03-03
**Last Updated:** 2026-03-03

## Dependencies
- Requires: OPH-10 (E-Mail-Weiterleitungs-Ingestion) — replaces the current sender authorization logic
- Requires: OPH-16 (Trial-/Demo-Modus) — changes how trial tenant sender auth works
- Requires: OPH-8 (Admin: Mandanten-Management) — domain configuration added to the admin tenant form

## Konzept

Currently, the inbound email pipeline authorizes senders in two different ways:
- **Regular tenants**: sender email must belong to a user in the tenant's active team (fetched via `auth.admin.listUsers`)
- **Trial tenants**: sender email must exactly match the tenant's `contact_email`

Both approaches have problems: the user-list approach has a scalability bug (BUG-009: only first 1000 users returned), and the exact-email approach is too restrictive — a company may have employees with both `.de` and `.com` email addresses.

This feature replaces both authorization paths with a unified, domain-based model: a tenant configures a list of **allowed email domains** (e.g. `example.de`, `example.com`). Any email sent from a matching domain is accepted. The platform admin manages this list in the admin tenant panel.

---

## User Stories

- Als Platform-Admin möchte ich bei der Erstellung oder Bearbeitung eines Mandanten eine oder mehrere erlaubte E-Mail-Domains konfigurieren (z.B. `example.de`, `example.com`), damit Mitarbeiter dieses Unternehmens Bestellungen über alle ihre Firmen-Domains einschicken können.
- Als Platform-Admin möchte ich eine erlaubte Domain nachträglich entfernen oder weitere hinzufügen können, damit ich auf Domain-Wechsel oder Umstrukturierungen reagieren kann.
- Als Mitarbeiter eines Mandanten möchte ich Bestellungs-E-Mails von meiner `@firma.de` UND meiner `@firma.com` Adresse einschicken können, damit ich nicht auf eine bestimmte Absender-Adresse festgelegt bin.
- Als System möchte ich, dass eingehende E-Mails von nicht-konfigurierten Domains weiterhin in die Quarantäne wandern, damit unberechtigte Einsendungen sicher abgefangen werden.
- Als Platform-Admin möchte ich, dass bei einem neu angelegten Mandanten ohne konfigurierte Domains automatisch die Domain aus der `contact_email` als Standard verwendet wird, damit der Betrieb sofort ohne zusätzliche Konfiguration möglich ist.

---

## Acceptance Criteria

- [ ] **AC-1: Domain-Konfiguration im Admin-Panel**
  - Im Tenant-Formular (Erstellen + Bearbeiten) gibt es einen neuen Bereich "Erlaubte E-Mail-Domains"
  - Platform-Admin kann beliebig viele Domains hinzufügen (z.B. `example.de`, `example.com`)
  - Domains können einzeln entfernt werden
  - Validierung: Domain muss ein gültiges Format haben (keine Leerzeichen, kein `@`, z.B. `example.de`)
  - Maximal 10 Domains pro Mandant

- [ ] **AC-2: Domain-basierte Sender-Autorisierung**
  - Beim Eingang einer E-Mail wird die Domain des Absenders extrahiert (alles nach `@`)
  - E-Mails von erlaubten Domains → werden normal verarbeitet (Bestellung erstellt)
  - E-Mails von nicht-erlaubten Domains → landen weiterhin in der Quarantäne

- [ ] **AC-3: Fallback auf contact_email-Domain**
  - Hat ein Mandant keine Domains konfiguriert, wird automatisch die Domain aus `contact_email` als einzige erlaubte Domain verwendet
  - Dieser Fallback gilt für reguläre Mandanten und Trial-Mandanten gleichermaßen
  - Kein zusätzlicher Setup-Schritt nötig bei neu angelegten Mandanten

- [ ] **AC-4: Einheitliche Logik für Trial-Mandanten**
  - Trial-Mandanten verwenden dieselbe Domain-basierte Autorisierung
  - Die bisherige Logik (exakter Abgleich mit `contact_email`) wird entfernt
  - Trial-Mandanten profitieren ebenfalls vom Fallback (AC-3)

- [ ] **AC-5: Anzeige der konfigurierten Domains**
  - Die konfigurierten Domains werden im Tenant-Formular (Read-Only-Ansicht und Bearbeitungsformular) sichtbar angezeigt
  - Format: als Tags/Chips in der Tenant-Detailansicht

- [ ] **AC-6: Bestehende Mandanten unberührt**
  - Bestehende Mandanten ohne konfigurierte Domains laufen nahtlos auf den Fallback (AC-3) — kein manueller Migrations-Schritt nötig
  - Bestehende Quarantäne-Einträge bleiben unverändert

---

## Edge Cases

- **Keine Domains konfiguriert, keine contact_email?** → Alle E-Mails landen in Quarantäne (sicherer Fallback)
- **contact_email hat ungewöhnliches Format (kein `@`)?** → Fallback greift nicht; alle E-Mails in Quarantäne; Admin-Warnung im Tenant-Formular
- **Subdomain-Adressen (z.B. `sender@mail.example.de`)?** → Nur exakter Domain-Abgleich (kein Wildcard auf Parent-Domain); `mail.example.de` ≠ `example.de`; Admin muss beide eintragen, wenn nötig
- **Domain mit Großschreibung (z.B. `Example.DE`)?** → Case-insensitive Vergleich; `Example.DE` = `example.de`
- **Duplikate in der Domain-Liste?** → Validierung verhindert doppelte Einträge (case-insensitive)
- **Domain wird entfernt, während E-Mails in der Pipeline sind?** → Bereits erstellte Bestellungen bleiben unverändert; neue E-Mails von der entfernten Domain werden ab sofort quarantäniert

---

## Technical Requirements

- Domain-Liste gespeichert als `TEXT[]` (PostgreSQL Array) auf der `tenants` Tabelle: `allowed_email_domains`
- Domain-Extraktion: `sender_email.split("@")[1]?.toLowerCase()` — keine komplexe Regex nötig
- Vergleich: case-insensitive (`toLowerCase()` auf beiden Seiten)
- Neue Domains werden beim Speichern des Tenant-Formulars als Array überschrieben (kein separater Endpunkt für einzelne Domains)
- Bestehende Quarantäne-Logik bleibt erhalten — nur der Autorisierungscheck ändert sich

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview

This feature touches three layers: the database (one new column), the backend (two API routes + the inbound email webhook), and the UI (one existing form gets a new section). No new pages, no new packages. The existing `TagInput` component already handles the add/remove chip interaction — we just wire it to the domain list.

---

### Component Structure

Only one UI component changes — the existing tenant form sheet gains a new section in its "Profil" tab:

```
TenantFormSheet (existing — src/components/admin/tenant-form-sheet.tsx)
+-- Tab: Profil (existing)
|   +-- Name field (existing)
|   +-- Slug field (existing)
|   +-- Kontakt-E-Mail field (existing)
|   +-- ERP-Typ dropdown (existing)
|   +-- Status dropdown (existing)
|   +-- Trial-Info alert (existing, OPH-16)
|   +-- [NEW] "Erlaubte E-Mail-Domains" section
|       +-- Label + helper text
|       +-- TagInput (existing component — src/components/admin/tag-input.tsx)
|           +-- Domain chips (e.g. "example.de" × | "example.com" ×)
|           +-- Input field: type domain + Enter to add
|       +-- Fallback hint (shown when list is empty):
|           "Kein Eintrag: Domain aus Kontakt-E-Mail wird automatisch verwendet"
+-- Tab: Benutzer (existing, unchanged)
```

No new components or pages are needed.

---

### Data Model

**Existing table — one new column added:**

```
tenants table gets:
- allowed_email_domains  TEXT[]  DEFAULT '{}'
  A list of lowercase domain strings (e.g. ["example.de", "example.com"])
  Empty array = no explicit config → fallback to contact_email domain
  Maximum 10 entries enforced at the API level
```

**Authorization resolution logic (inbound email webhook):**
```
1. Load tenant's allowed_email_domains
2. If the list is empty → derive effective domain from contact_email (everything after @)
3. Extract sender domain from the incoming email's From address (everything after @, lowercased)
4. If sender domain is in the effective allowed list → authorize → create order
5. Otherwise → quarantine (same as before)
```

---

### API Changes

| Route | Method | Change |
|-------|--------|--------|
| `GET /api/admin/tenants/[id]` | GET | Return `allowed_email_domains` field in response |
| `POST /api/admin/tenants` | POST | Accept optional `allowed_email_domains` array in request body |
| `PATCH /api/admin/tenants/[id]` | PATCH | Accept `allowed_email_domains` array in request body; validate max 10, valid domain format |
| `POST /api/inbound/email` | POST | Replace user-list auth with domain check (see resolution logic above) |

**What is removed from the inbound email route:**
- The `auth.admin.listUsers({ perPage: 1000 })` call (BUG-009 fix)
- The trial-specific `contact_email` exact-match check

Both paths are replaced by the unified domain resolution logic.

---

### Validation Rules

Applied server-side in the API (Zod schema):
- Each domain: no `@` symbol, no spaces, contains at least one `.`, 3–253 characters
- List: maximum 10 domains per tenant
- Duplicates rejected (case-insensitive: `Example.DE` == `example.de`, stored lowercase)

The `TagInput` component also validates on the client before adding a chip, with a domain-specific error message ("Bitte nur die Domain eingeben, z.B. `example.de` — ohne @").

---

### Tech Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Storage format | `TEXT[]` PostgreSQL array | Native array support, simple to query with `= ANY(...)`, no join table needed for ≤10 items |
| Domain matching | `senderDomain = ANY(allowed_domains)` | Single DB comparison, case-insensitive normalization applied on write (store lowercase) |
| Fallback location | Server-side in inbound webhook | Fallback logic belongs on the server — client never needs to know about it |
| UI component | Reuse existing `TagInput` | Already built for dealer rules (known domains, subject patterns) — zero new code for the chip interaction |
| No separate endpoint | Domains saved with the tenant form | Domains are tenant configuration, not a standalone resource — keeping them in the same PUT/POST reduces API surface |

---

### Files Changed

| File | Type of change |
|------|----------------|
| `supabase/migrations/020_oph17_allowed_email_domains.sql` | New — add `allowed_email_domains TEXT[] DEFAULT '{}'` to `tenants` |
| `src/lib/types.ts` | Add `allowed_email_domains: string[]` to `Tenant` interface |
| `src/lib/validations.ts` | Add domain array validation to `createTenantSchema` and `updateTenantSchema` |
| `src/app/api/admin/tenants/route.ts` | Accept + store `allowed_email_domains` on create |
| `src/app/api/admin/tenants/[id]/route.ts` | Return + accept `allowed_email_domains` on GET/PATCH |
| `src/app/api/inbound/email/route.ts` | Replace auth logic with domain check + fallback |
| `src/components/admin/tenant-form-sheet.tsx` | Add domain section to Profile tab; load/save domains |

No new packages required.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
