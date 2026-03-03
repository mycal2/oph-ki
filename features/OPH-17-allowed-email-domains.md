# OPH-17: Allowed Email Domains for Sender Authorization

## Status: Deployed
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

**Tested:** 2026-03-03
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)

### Build & Lint

- [x] `npm run build` completes successfully -- no TypeScript or compilation errors
- [x] All modified files pass type checking
- [x] No new unresolved dependencies introduced

### Acceptance Criteria Status

#### AC-1: Domain-Konfiguration im Admin-Panel
- [x] New "Erlaubte E-Mail-Domains" section present in the tenant form sheet (Profile tab) for both create and edit modes (`tenant-form-sheet.tsx` lines 474-487)
- [x] Platform-Admin can add multiple domains via TagInput (Enter key to add, displayed as chips)
- [x] Domains can be individually removed via the X button on each chip
- [x] Server-side validation enforces domain format: no `@`, no spaces, must contain `.`, 3-253 characters (`validations.ts` lines 372-382)
- [x] Maximum 10 domains enforced server-side (`validations.ts` line 387) and client-side (TagInput `maxItems={10}`)
- [ ] BUG: No client-side domain format validation in TagInput (see BUG-1)

#### AC-2: Domain-basierte Sender-Autorisierung
- [x] Sender domain extracted from email address (everything after `@`) in inbound email webhook (`route.ts` line 166)
- [x] Emails from allowed domains are processed normally (order created)
- [x] Emails from non-allowed domains go to quarantine
- [x] Domain comparison is case-insensitive (both sides lowercased at comparison time, line 157 and 166)

#### AC-3: Fallback auf contact_email-Domain
- [x] When `allowed_email_domains` is empty, domain is derived from `contact_email` (`route.ts` lines 159-162)
- [x] Fallback applies to regular tenants and trial tenants equally (unified code path)
- [x] No additional setup needed for new tenants -- empty array triggers fallback
- [x] When no contact_email domain can be derived (no `@`), `effectiveDomains` is empty and all emails are quarantined (safe default)

#### AC-4: Einheitliche Logik fuer Trial-Mandanten
- [x] Trial tenants use the same domain-based authorization as regular tenants (lines 148-167, single code path)
- [x] Previous exact `contact_email` match logic for trial tenants is removed (verified via git diff)
- [x] Trial tenants benefit from the contact_email domain fallback (AC-3)

#### AC-5: Anzeige der konfigurierten Domains
- [x] Domains shown as Tags/Chips in the edit form via TagInput component
- [x] Domains loaded from server when opening an existing tenant (`populateForm` line 183)
- [x] Fallback hint displayed when list is empty: "Kein Eintrag: Domain aus Kontakt-E-Mail wird automatisch verwendet"
- [ ] BUG: No read-only display of domains in tenant list table (see BUG-2)

#### AC-6: Bestehende Mandanten unberuehrt
- [x] Migration adds column with `DEFAULT '{}'` -- existing tenants get empty array (`020_oph17_allowed_email_domains.sql`)
- [x] Empty array triggers contact_email fallback -- existing behavior preserved
- [x] Existing quarantine entries are not modified by the migration
- [x] API returns `allowed_email_domains ?? []` defensive fallback for null values

### Edge Cases Status

#### EC-1: Keine Domains konfiguriert, keine contact_email
- [x] `effectiveDomains` resolves to empty array; `isAuthorized` is false; email goes to quarantine (line 167: `effectiveDomains.length > 0 && ...`)

#### EC-2: contact_email hat ungewoehnliches Format (kein @)
- [x] `contactEmail.split("@")[1]` returns `undefined`; `?.toLowerCase()` produces `undefined`; fallback domain is empty; all emails quarantined
- [ ] BUG: No admin warning shown in tenant form when contact_email has no valid domain (see BUG-3)

#### EC-3: Subdomain-Adressen (mail.example.de)
- [x] Exact domain matching only -- `mail.example.de` does NOT match `example.de` (line 167: `effectiveDomains.includes(senderDomain)`)

#### EC-4: Domain mit Grossschreibung (Example.DE)
- [x] Inbound webhook lowercases both sides before comparison (lines 157, 166) -- correct
- [ ] BUG: Server-side Zod validation rejects uppercase domains because regex runs BEFORE the toLowerCase transform (see BUG-4)

#### EC-5: Duplikate in der Domain-Liste
- [x] Server-side Zod transform deduplicates case-insensitively (`validations.ts` lines 388-398)
- [x] Client-side TagInput prevents exact duplicates (line 33: `if (value.includes(trimmed)) return`)
- [ ] BUG: TagInput duplicate check is case-sensitive, so "example.de" and "Example.DE" would both be added client-side (see BUG-5)

#### EC-6: Domain wird entfernt waehrend E-Mails in der Pipeline sind
- [x] Existing orders remain unchanged -- domain check only runs at inbound time
- [x] New emails from removed domain are quarantined immediately after save

### Security Audit Results

- [x] Authentication: All admin tenant endpoints require `platform_admin` role via `requirePlatformAdmin()`
- [x] Authorization: Non-admin users cannot access tenant CRUD endpoints (403 response)
- [x] Rate limiting: Admin endpoints have rate limiting via `checkAdminRateLimit()` (POST, PATCH)
- [x] Input validation: Server-side Zod validation for all domain inputs (format, length, max count)
- [x] SQL injection: Supabase parameterized queries used throughout -- no raw SQL
- [x] XSS: Domain values are rendered as text content in Badge components, not as HTML
- [x] Webhook security: Inbound email webhook protected by POSTMARK_INBOUND_WEBHOOK_TOKEN query parameter
- [x] RLS: Tenants table has RLS enabled with platform_admin-only policies (migration 001)
- [x] BUG-009 fix: The old `auth.admin.listUsers({ perPage: 1000 })` call is removed, eliminating the scalability bug
- [x] No secrets exposed: No env vars or tokens leaked in responses
- [ ] BUG: Domain regex allows consecutive dots (`a..b` passes), which could be used to store malformed data (see BUG-6)

#### Red Team: Specific Attack Vectors Tested

1. **Bypass sender authorization by manipulating allowed_email_domains**: Only platform_admin can modify. Protected by auth check. PASS.
2. **Inject malicious domain values**: Regex restricts to `[a-z0-9.-]` only. No `@`, no spaces, no special chars. PASS.
3. **Overflow domain array**: Server enforces max 10. Client enforces max 10 via TagInput. PASS.
4. **Send email from spoofed domain**: Domain check works on the From header as parsed by Postmark. This is inherent to email (DMARC/SPF should be configured at the DNS level, outside app scope). Acceptable risk. NOTED.
5. **Access other tenant's domain config**: RLS + platform_admin check. No cross-tenant access possible. PASS.
6. **Denial of service via rapid domain updates**: Rate limiting at 60 req/min per user. PASS.

### Bugs Found

#### BUG-1: No client-side domain format validation in TagInput
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Go to Admin > Mandanten-Verwaltung
  2. Open a tenant or create a new one
  3. In "Erlaubte E-Mail-Domains", type `@example.de` and press Enter
  4. Expected: Client rejects the input with an error message (as specified in tech design: "Bitte nur die Domain eingeben, z.B. example.de -- ohne @")
  5. Actual: The invalid domain is added as a chip. The error only surfaces when the form is submitted and server-side validation rejects it.
- **Impact:** Poor UX. The tech design explicitly specifies client-side validation with a domain-specific error message, but it was not implemented. The TagInput component has no `validateDomain` prop -- only `validateRegex`.
- **Priority:** Fix before deployment

#### BUG-2: No read-only display of domains in tenant list table
- **Severity:** Low
- **Steps to Reproduce:**
  1. Go to Admin > Mandanten-Verwaltung
  2. Look at the tenant list table
  3. Expected: Configured domains are visible somewhere in the tenant list or detail view (AC-5 says "Read-Only-Ansicht")
  4. Actual: Domains are only visible inside the edit form sheet. The tenant admin table (`tenant-admin-table.tsx`) does not display the `allowed_email_domains` field despite it being included in the API response.
- **Impact:** Admin cannot quickly see which tenants have domain restrictions configured without opening each tenant individually.
- **Priority:** Nice to have

#### BUG-3: No admin warning for contact_email without valid domain
- **Severity:** Low
- **Steps to Reproduce:**
  1. Edge case spec says: "contact_email hat ungewoehnliches Format (kein @) -> Admin-Warnung im Tenant-Formular"
  2. Create or edit a tenant with a contact_email that has no `@` (if possible to bypass email validation) or has an unusual domain
  3. Leave allowed_email_domains empty
  4. Expected: A warning is shown in the form indicating the fallback will not work
  5. Actual: No such warning exists in the form. The fallback hint only says "Domain aus Kontakt-E-Mail wird automatisch verwendet" without checking if the contact_email is valid.
- **Impact:** Minimal in practice since `contact_email` is validated as a proper email address by Zod. The edge case is essentially prevented by the email validation. However, the spec explicitly calls for a warning.
- **Priority:** Nice to have

#### BUG-4: Server-side Zod validation rejects uppercase domains
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Send a PATCH request to `/api/admin/tenants/[id]` with body: `{"allowed_email_domains": ["Example.DE"]}`
  2. Expected: Domain is accepted, normalized to lowercase, and stored as `example.de` (spec says case-insensitive)
  3. Actual: Validation fails with "Ungueltige Domain" because the regex `/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/` only matches lowercase characters, and it runs BEFORE the `allowedEmailDomainsField` transform that lowercases entries.
- **Root Cause:** In the Zod pipeline, `emailDomainField` (which contains the regex check) is validated on each array element BEFORE the `allowedEmailDomainsField.transform()` runs `.toLowerCase()`. The regex should either accept uppercase characters or the individual field should apply `.transform(d => d.toLowerCase())` before the regex.
- **Impact:** If a user types an uppercase domain in the TagInput, it will be sent as-is to the server and rejected. Although the TagInput does not force lowercase, most domain inputs will naturally be lowercase. Still, this contradicts the spec's case-insensitive requirement.
- **Priority:** Fix before deployment

#### BUG-5: TagInput duplicate check is case-sensitive
- **Severity:** Low
- **Steps to Reproduce:**
  1. Open a tenant form
  2. Type `example.de` and press Enter (chip added)
  3. Type `Example.DE` and press Enter
  4. Expected: Duplicate is rejected (case-insensitive dedup per spec)
  5. Actual: Both entries are added as separate chips because TagInput uses `value.includes(trimmed)` which is case-sensitive
- **Impact:** Low, because server-side validation deduplicates. But UX shows confusing duplicate entries before submission.
- **Priority:** Nice to have (server catches it)

#### BUG-6: Domain regex allows consecutive dots
- **Severity:** Low
- **Steps to Reproduce:**
  1. Submit a domain like `a..b` via the API
  2. Expected: Rejected as invalid domain format
  3. Actual: Passes regex validation because `[a-z0-9.-]*` allows consecutive dots
- **Impact:** Minimal -- this would not match any real sender domain. But it allows storing technically malformed domain data.
- **Priority:** Nice to have

### Cross-Browser Testing Notes

Since this feature is entirely within an admin panel using existing shadcn/ui components (TagInput, Badge, Input), cross-browser compatibility is inherited from the existing component library:
- **Chrome:** TagInput, Badge, Sheet components are already tested and deployed for OPH-7 (dealer rules use the same TagInput). Expected PASS.
- **Firefox:** Same component stack. Expected PASS.
- **Safari:** Same component stack. Expected PASS.

### Responsive Testing Notes

The TagInput and form layout use Tailwind's flex-wrap for tags and standard form spacing:
- **375px (Mobile):** The Sheet component already handles mobile via `w-full sm:max-w-xl`. Tags wrap naturally. Expected PASS.
- **768px (Tablet):** No special breakpoints needed for the domain section. Expected PASS.
- **1440px (Desktop):** Standard sheet width. Expected PASS.

Note: Full manual browser/responsive testing requires a running dev server with Supabase connection and platform_admin credentials. The above assessments are based on code review of the component structure.

### Regression Testing

- [x] OPH-10 (Email Ingestion): The inbound email route still handles all existing flows (duplicate check, attachment processing, extraction trigger, confirmation email). Only the sender authorization section was modified.
- [x] OPH-16 (Trial Mode): Trial tenant handling preserved. Preview token generation, trial-specific order fields, and confirmation email skip all remain intact.
- [x] OPH-8 (Tenant Management): Tenant CRUD operations unchanged apart from the new `allowed_email_domains` field. Slug immutability, status toggling, user management all preserved.
- [x] Build succeeds with all changes, indicating no type regressions.

### Summary

- **Acceptance Criteria:** 5/6 passed (AC-1 through AC-4 and AC-6 pass; AC-5 partially passes -- edit form shows domains but no list-level read-only display)
- **Edge Cases:** 4/6 fully handled; 2 have minor gaps (EC-2 missing admin warning, EC-4 uppercase domain rejected)
- **Bugs Found:** 6 total (0 critical, 0 high, 2 medium, 4 low)
- **Security:** PASS -- no security vulnerabilities found. Auth, authorization, rate limiting, input validation, and RLS all properly implemented.
- **Production Ready:** YES (conditionally) -- No critical or high bugs. The 2 medium bugs (BUG-1 client-side validation, BUG-4 uppercase rejection) should be fixed before deployment for spec compliance, but neither blocks core functionality.
- **Recommendation:** Fix BUG-1 and BUG-4 before deployment. The remaining low-severity bugs can be addressed in a follow-up sprint.

## Deployment

**Deployed:** 2026-03-03
**Commit:** fb9b8e3

### Pre-Deployment Checklist
- [x] `npm run build` passes — no TypeScript or compilation errors
- [x] All 6 QA bugs fixed (BUG-1 through BUG-6)
- [x] No Critical or High severity bugs
- [x] Database migration `020_oph17_allowed_email_domains.sql` applied to production Supabase
- [x] No new environment variables required
- [x] No secrets committed to git
- [x] All code committed and pushed to remote

### What Was Deployed
- Unified domain-based sender authorization replacing the old dual-path approach
- `allowed_email_domains TEXT[]` column on `tenants` table
- Admin tenant form updated with domain tag input and warnings
- Domain list shown in tenant admin table
- BUG-009 (scalability) fixed: `auth.admin.listUsers` removed from inbound email path
