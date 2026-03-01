# OPH-7: Admin: Händler-Regelwerk-Verwaltung

## Status: Deployed
**Created:** 2026-02-27
**Last Updated:** 2026-03-01

## Dependencies
- Requires: OPH-3 (Händler-Erkennung) — Admin verwaltet die Erkennungsregeln, die OPH-3 nutzt
- Requires: OPH-1 (Auth) — nur Platform-Admins haben Zugang

## Konzept
Platform-Admins verwalten den globalen Katalog aller Händler-Profile. Diese Profile sind die Grundlage für die automatische Händler-Erkennung (OPH-3) und liefern Kontextinformationen für die KI-Extraktion (OPH-4). Da ein Händler-Format für alle Mandanten gilt, wird Konfigurationsaufwand dramatisch reduziert.

## User Stories
- Als Platform-Admin möchte ich neue Händler-Profile anlegen (Name, Erkennungsregeln, Format-Typ), damit neue Händler automatisch erkannt werden können.
- Als Platform-Admin möchte ich bestehende Händler-Profile bearbeiten und Erkennungsregeln verfeinern, damit die Erkennungsrate kontinuierlich verbessert wird.
- Als Platform-Admin möchte ich für jeden Händler Extraktions-Hints hinterlegen (z.B. "Artikelnummer steht in der zweiten Spalte der Tabelle"), damit Claude präzisere Ergebnisse liefert.
- Als Platform-Admin möchte ich eine Händler-Erkennung mit einer Test-Datei simulieren, damit ich neue Regeln validieren kann, bevor sie live gehen.
- Als Platform-Admin möchte ich sehen, welche Bestellungen für jeden Händler verarbeitet wurden und wie hoch die durchschnittliche Extraktionsgenauigkeit war.

## Acceptance Criteria
- [ ] Admin-Bereich ist nur für Benutzer mit Rolle `platform_admin` zugänglich
- [ ] CRUD für Händler-Profile: Name, Beschreibung, Status (aktiv/inaktiv)
- [ ] Pro Händler: konfigurierbare Erkennungsregeln: E-Mail-Domains, Absender-Adressen (Wildcards), Betreff-Pattern (Regex), Dateiname-Pattern
- [ ] Pro Händler: Extraktions-Hints (Freitext-Felder, die in den Claude-Prompt einfließen)
- [ ] Pro Händler: Format-Typ (Email-Text, PDF-Tabelle, Excel-Template, Gemischt)
- [ ] Test-Funktion: Admin lädt eine Beispieldatei hoch → System zeigt, welcher Händler erkannt worden wäre und mit welchem Konfidenz-Score
- [ ] Händler-Profile werden sofort nach Speichern in der Produktion wirksam (kein Deploy-Zyklus)
- [ ] Audit-Log: Alle Änderungen an Händler-Profilen werden mit Admin-User und Timestamp protokolliert
- [ ] Händler-Liste zeigt: Name, Anzahl verarbeiteter Bestellungen (total), Datum letzter Bestellung, Status

## Edge Cases
- Was passiert, wenn ein Händler-Profil deaktiviert wird, während noch Bestellungen in Verarbeitung sind? → Laufende Verarbeitungen werden noch mit dem alten Profil abgeschlossen; neue Uploads erkennen den Händler nicht mehr
- Was passiert, wenn zwei Händler-Profile dieselbe Erkennungsregel haben? → System warnt beim Speichern ("Regelkonflikt mit Händler X"); Admin muss auflösen
- Was passiert, wenn ein Händler-Profil gelöscht wird? → Soft-Delete (historische Bestellungen behalten die Zuordnung); keine Datenverluste

## Technical Requirements
- Nur `platform_admin`-Rolle kann `dealers`-Tabelle schreiben (RLS)
- Regex-Validierung der Pattern-Felder im Frontend und Backend
- Extraktions-Hints werden in KI-Prompt interpoliert (sicher: kein Prompt-Injection möglich)
- Händler-Profile werden gecacht (TTL: 5 Minuten) für Performance

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview
Platform-Admins get a dedicated admin section to manage the global dealer catalogue. The `dealers` table already exists with all recognition rule fields and the correct RLS policies. This feature adds the management UI, two small schema additions, and a set of admin-only API routes.

---

### Component Structure

```
Admin Dealers Page  (/admin/dealers)  — platform_admin only
+-- PageHeader ("Händler-Profile", + "Neuer Händler" button)
+-- DealerAdminTable
|   +-- Row: Name | Format | Stadt | Bestellungen | Letzte Bestellung | Status | Aktionen
|   +-- Aktionen: [Bearbeiten] [Aktivieren / Deaktivieren]
|   +-- Loading skeleton / empty state
+-- DealerFormSheet  (slides in from right — create OR edit)
|   +-- Tab: Profil
|   |   +-- Name (required)
|   |   +-- Beschreibung (optional)
|   |   +-- Format-Typ (E-Mail Text | PDF-Tabelle | Excel | Gemischt)
|   |   +-- Adresse (Strasse, PLZ, Stadt, Land)
|   |   +-- Status toggle (Aktiv / Inaktiv)
|   +-- Tab: Erkennungsregeln
|   |   +-- E-Mail-Domains (tag input)
|   |   +-- Absender-Adressen (tag input, wildcards allowed)
|   |   +-- Betreff-Pattern (tag input, regex validated on entry)
|   |   +-- Dateiname-Pattern (tag input, regex validated on entry)
|   |   +-- Regelkonflikt-Warnung (if a rule exists in another dealer)
|   +-- Tab: Extraktions-Hints
|   |   +-- Freitext textarea (fed into Claude prompt as context)
|   |   +-- Character count + help text
|   +-- Tab: Audit-Log  (edit mode only)
|       +-- Table: Datum | Admin | Aktion | Geänderte Felder
+-- DealerTestDialog  (modal)
    +-- File dropzone (email / PDF / Excel)
    +-- [Test starten] button
    +-- Result: "Erkannter Händler: Henry Schein GmbH (Konfidenz: 87%)"
    +-- Or: "Kein Händler erkannt"
```

---

### Data Model

**Additions to `dealers` table:**
- `description TEXT` — free-text description of the dealer (new)
- `format_type` — extended with `'mixed'` option (in addition to existing email_text, pdf_table, excel)

*(All recognition rule arrays and address fields already exist)*

**New table: `dealer_audit_log`**
Each entry records:
- Which dealer was changed
- Which platform admin made the change (user ID + email)
- Action type: created | updated | deactivated | reactivated
- Snapshot of changed fields (before and after values as JSON)
- Timestamp

---

### API Routes (New — all require platform_admin role)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/dealers` | All dealers (incl. inactive) with order counts + last order date |
| POST | `/api/admin/dealers` | Create a new dealer profile |
| GET | `/api/admin/dealers/[id]` | Full dealer detail |
| PATCH | `/api/admin/dealers/[id]` | Update dealer (writes audit entry) |
| DELETE | `/api/admin/dealers/[id]` | Soft-delete (sets active = false) |
| GET | `/api/admin/dealers/[id]/audit` | Audit log for a specific dealer |
| POST | `/api/admin/dealers/test-recognition` | Run a file through recognition, return match + confidence |

---

### Tech Decisions

1. **Slide-out Sheet for create/edit** — Admin can keep the dealer list visible while editing; faster than full page navigation. Consistent with modern admin UIs.

2. **Tag inputs for array fields** — Recognition rules are string arrays. A tag input (type → Enter to add, × to remove) prevents comma/newline typos and makes the array nature of the data visually clear.

3. **Real-time regex validation** — Subject and filename patterns are validated against `new RegExp(value)` immediately on entry. Invalid regex is rejected before the tag is added.

4. **Conflict detection on save** — The API checks if any of the submitted domains/addresses/patterns already exist in another active dealer before persisting. Returns a warning (not a hard block) with the conflicting dealer name. The frontend shows this as a dismissible alert.

5. **Audit log written at API level** — On PATCH/DELETE, the API reads the current row, computes a diff, and writes to `dealer_audit_log`. Simpler and more debuggable than database triggers.

6. **Test recognition reuses existing logic** — The test endpoint runs the same matching algorithm as OPH-3/OPH-4 against the uploaded file content. No file is persisted. Returns dealer name + confidence score, or "no match".

7. **Order counts in a single query** — The list endpoint aggregates `COUNT(*)` and `MAX(created_at)` from the orders table per dealer in one SQL query — no N+1 problem.

8. **Navigation: platform_admin only section** — A new "Admin" group appears in the sidebar/top-nav only when `useCurrentUserRole()` returns `platform_admin`. Regular users never see it.

---

### Navigation Addition

```
Settings:  Team | Händler-Zuordnungen
Admin:     Händler-Profile    ← NEW (platform_admin only)
```

---

### No New npm Packages

All required UI components are already installed:
- `Sheet` — slide-out panel
- `Tabs` — tabbed form sections
- `Badge` + `Input` — tag inputs (composed manually)
- `Dialog` — test recognition modal
- `Table` — dealer list and audit log

## QA Test Results

### Round 1 (Initial)

**Tested:** 2026-03-01
**Tester:** QA Engineer (AI)
**Build Status:** Compiled successfully
**Bugs Found:** 11 (0 Critical, 0 High, 6 Medium, 5 Low)
**Result:** NOT READY -- 4 Medium bugs required fixing before deployment

---

### Round 2 (Re-test after bug fixes)

**Tested:** 2026-03-01
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Build Status:** Compiled successfully, no TypeScript errors

---

### Bug Fix Verification

#### BUG-001 (was Medium): Frontend tag input does not validate regex on entry
- **Status: FIXED**
- `TagInput` component now accepts a `validateRegex` prop (default `false`)
- When `validateRegex` is true, `addTag()` calls `new RegExp(trimmed)` and shows inline error message "Ungueltiges Regex-Pattern: ..." on failure
- `DealerFormSheet` passes `validateRegex` to the subject_patterns and filename_patterns TagInput instances
- Domains and sender addresses correctly do NOT get regex validation
- **Verification:** Code at `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/admin/tag-input.tsx` lines 36-43

#### BUG-002 (was Low): Wildcard matching for sender addresses not implemented
- **Status: FIXED**
- New `matchesSenderAddress()` function in both `dealer-recognition.ts` and `test-recognition/route.ts`
- Supports `*@domain.com` wildcard format (matches any sender at that domain)
- Exact address matching preserved for non-wildcard entries
- **Verification:** Code at `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/dealer-recognition.ts` lines 158-165
- **Note:** Only `*@domain` prefix wildcard is supported, not arbitrary glob patterns like `orders-*@domain.com`. This is an acceptable limitation for MVP.

#### BUG-003 (was Medium): Subject/filename patterns matched as substring, not regex
- **Status: FIXED**
- `containsPattern()` renamed to `matchesPattern()` in both files
- Now uses `new RegExp(pattern, "i").test(text)` for matching
- Falls back to `text.toLowerCase().includes(pattern.toLowerCase())` if regex is invalid
- Applied consistently in production engine (`dealer-recognition.ts`) and test endpoint (`test-recognition/route.ts`)
- **Verification:** Code at `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/dealer-recognition.ts` lines 146-152

#### BUG-007 (was Medium): Prompt injection risk via extraction_hints
- **Status: PARTIALLY FIXED**
- `sanitizeHints` transform added to Zod schema in `validations.ts` (lines 274-278)
- Strips `<system>`, `</system>`, `<instruction>`, `</instruction>`, and `<|...|>` tags
- Applied via `.transform(sanitizeHints)` on the `extractionHintsField` schema used by both create and update
- **Remaining concern:** Only XML-style tags are stripped. Plain-text prompt injection like "Ignore all previous instructions" is not caught. This is acceptable for MVP since only platform_admins write hints.
- **Verification:** Code at `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/validations.ts` lines 270-286

#### BUG-008 (was Low): No rate limiting on admin API endpoints
- **Status: FIXED**
- `checkAdminRateLimit()` function added to `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/admin-auth.ts` (lines 64-92)
- In-memory rate limiter: 60 requests per minute per user ID
- Returns 429 "Zu viele Anfragen" when limit exceeded
- Applied to POST `/api/admin/dealers`, PATCH `/api/admin/dealers/[id]`, and DELETE `/api/admin/dealers/[id]`
- **Note:** GET endpoints are not rate-limited (read-only). The in-memory map is per-process, which works for single-instance deployments but resets on serverless cold starts. Acceptable for MVP.

#### BUG-009 (was Medium): No file size limit on test-recognition upload
- **Status: FIXED**
- `MAX_TEST_FILE_SIZE = 10 * 1024 * 1024` (10 MB) constant defined
- File size check added immediately after form data parsing, before any content reading
- Returns 400 "Datei ist zu gross. Maximum: 10 MB." for oversized files
- **Verification:** Code at `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/dealers/test-recognition/route.ts` lines 7 and 38-43

#### BUG-010 (was Medium): GET /api/admin/dealers fallback fetches ALL orders without pagination
- **Status: FIXED**
- GET handler restructured: first tries RPC `get_dealer_order_stats`, falls back to limited query
- Fallback query now uses `.limit(10000)` and selects only `dealer_id` (not `created_at`)
- JavaScript aggregation simplified to just count per dealer (no date tracking in fallback)
- RPC is still missing from the migration but the fallback is now bounded
- **Remaining concern:** The `last_order_at` field will always be `null` in fallback mode since only `dealer_id` is selected. This is acceptable -- the RPC function should be created for full stats.
- **Verification:** Code at `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/dealers/route.ts` lines 34-65

#### BUG-011 (was Low): Audit log INSERT failure is silently ignored
- **Status: FIXED**
- All three audit log writes (POST create, PATCH update, DELETE deactivate) now capture the insert result
- On error, `console.error("Failed to write dealer audit log:", auditError.message)` is logged
- The primary operation (create/update/delete) still succeeds -- audit failure is non-blocking
- **Verification:** Code at `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/dealers/route.ts` lines 155-166 and `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/dealers/[id]/route.ts` lines 163-173 and 243-253

---

### Acceptance Criteria Status (Updated)

#### AC-1: Admin-Bereich nur fuer platform_admin zugaenglich
- [x] Middleware enforces `/admin/*` routes are platform_admin only (redirects non-admins to `/dashboard`)
- [x] Page-level guard renders "Zugriff verweigert" for non-admins
- [x] All 7 API routes call `requirePlatformAdmin()` (auth.getUser + app_metadata.role check)
- [x] Navigation link only visible when `isPlatformAdmin` is true
- [x] Inactive users blocked at middleware and API level

**Result: PASS**

#### AC-2: CRUD fuer Haendler-Profile (Name, Beschreibung, Status)
- [x] Create, Read, Update, Delete (soft-delete) all functional with Zod validation
- [x] Frontend form supports create and edit modes
- [x] UUID validation prevents path traversal

**Result: PASS**

#### AC-3: Konfigurierbare Erkennungsregeln (Domains, Adressen, Betreff-Pattern, Dateiname-Pattern)
- [x] Tag input component with Enter/Backspace support
- [x] Four rule types supported
- [x] Backend Zod schema validates arrays (max 50 items, max 500 chars)
- [x] Subject/filename patterns validated as valid regex on both frontend (TagInput validateRegex) and backend (regexPatternArray)
- [x] Sender addresses support `*@domain` wildcards in recognition engine
- [x] Patterns now matched using proper regex in both test and production engines

**Result: PASS (BUG-001, BUG-002, BUG-003 all fixed)**

#### AC-4: Extraktions-Hints (Freitext-Felder)
- [x] Textarea with 5000 char limit, character counter, and help text
- [x] Backend validation with Zod + sanitization of XML-style injection tags

**Result: PASS**

#### AC-5: Format-Typ (Email-Text, PDF-Tabelle, Excel, Gemischt)
- [x] Select dropdown with 4 options, backend enum validation, migration constraint

**Result: PASS**

#### AC-6: Test-Funktion (Beispieldatei hochladen, Erkennung simulieren)
- [x] Dialog with file input, multipart upload, result display
- [x] No file persistence
- [x] Confidence badge with color coding
- [x] Pattern matching now uses regex (consistent with validation)
- [x] File size limited to 10 MB

**Result: PASS (BUG-003, BUG-009 fixed)**

#### AC-7: Haendler-Profile sofort nach Speichern wirksam
- [x] Direct database writes, no caching layer, immediate effect

**Result: PASS (spec self-contradiction noted -- caching deferred)**

#### AC-8: Audit-Log
- [x] Complete audit trail with diff computation
- [x] Error handling for audit write failures (logged, non-blocking)
- [x] UI display with action badges and changed fields

**Result: PASS (BUG-011 fixed)**

#### AC-9: Haendler-Liste zeigt Name, Bestellungen, letztes Datum, Status
- [x] Table shows all required columns including explicit Status column header
- [x] Status badges: Aktiv (green) / Inaktiv (outline)
- [x] Order counts with bounded fallback query
- [x] Toggle for inactive dealers, search filter

**Result: PASS (BUG-005 was fixed -- Status column is now a separate column, BUG-010 fixed)**

---

### Edge Cases Status (Unchanged from Round 1)

All 3 documented edge cases: **PASS**
All 4 additional edge cases: **PASS** (EC-7 concurrent editing: known limitation, acceptable)

---

### Cross-Browser Testing (Code Review) -- Unchanged

**Result: PASS** -- All standard shadcn/ui components and web APIs

---

### Responsive Testing (Code Review) -- Unchanged

**Result: PASS** -- Mobile (375px), Tablet (768px), Desktop (1440px) all properly handled

---

### Security Audit Results (Updated)

#### Authentication & Authorization
- [x] All API endpoints verify auth via `requirePlatformAdmin()` (server-side `getUser()` validation)
- [x] Role check uses `app_metadata.role` (server-set, not user-modifiable)
- [x] Middleware + page-level + API-level: three-layer protection
- [x] Admin client only created after successful auth
- [x] Inactive user check blocks deactivated admins
- [x] Rate limiting: 60 req/min per user on mutating endpoints (POST, PATCH, DELETE)

#### Input Validation
- [x] All inputs validated with Zod on server side
- [x] String length limits, array size limits, UUID validation
- [x] Regex patterns validated syntactically
- [x] Extraction hints sanitized against XML-style injection tags

#### Injection Attacks
- [x] SQL injection: Supabase parameterized queries -- not vulnerable
- [x] XSS: React auto-escapes -- not vulnerable
- [x] Prompt injection: Basic tag stripping applied to hints (defense in depth)
- [ ] REMAINING: ReDoS vulnerability (see below, BUG-006 still open)

#### Data Leakage
- [x] Service role key server-side only
- [x] No raw DB errors in responses
- [x] Audit log RLS: platform_admin read only

#### File Upload Security
- [x] Test files not persisted
- [x] 10 MB file size limit enforced server-side

#### Security Headers
- [x] All required headers present (X-Frame-Options, HSTS, Content-Type-Options, Referrer-Policy, Permissions-Policy)

#### RLS Policies
- [x] dealer_audit_log: SELECT for platform_admin, INSERT via service role
- [x] dealers: SELECT for authenticated, write ops for platform_admin

---

### Remaining Open Bugs

#### BUG-004 (Low): Dealer profile caching not implemented (spec contradiction)
- **Status: OPEN -- ACCEPTED**
- The spec contradicts itself: "sofort nach Speichern wirksam" vs "gecacht (TTL: 5 Minuten)". Current implementation correctly prioritizes immediate effect. No action needed for MVP.
- **Priority:** Clarify spec; implement caching when performance requires it

#### BUG-005 (Low): Status column display
- **Status: FIXED** -- Status is now shown as a separate column with header "Status" and badges "Aktiv"/"Inaktiv" (visible from sm breakpoint up). On mobile (below sm), it is hidden along with Format column.
- **Verification:** Code at `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/admin/dealer-admin-table.tsx` line 134 and lines 169-178

#### BUG-006 (Medium): ReDoS vulnerability via regex pattern injection
- **Status: OPEN -- NOW EXPLOITABLE**
- With BUG-003 fixed, patterns are now actually compiled and executed as regex via `new RegExp(pattern, "i").test(text)`. A catastrophic backtracking pattern like `(a+)+$` submitted by an admin will now cause server hangs during recognition.
- **Mitigation:** Only platform_admins can set patterns (limited trust boundary). The `matchesPattern()` fallback to substring on regex error does not protect against valid-but-slow patterns.
- **Recommendation:** Add either (a) a regex execution timeout wrapper, or (b) a pattern complexity check at validation time (reject patterns with nested quantifiers)
- **Priority:** Should fix before deployment -- severity upgraded from "latent" to "active"

#### NEW BUG-012: Fallback order stats lack last_order_at date
- **Severity:** Low
- **Steps to Reproduce:**
  1. When the RPC `get_dealer_order_stats` is unavailable (common until migration creates it)
  2. The fallback query only selects `dealer_id` (no `created_at`)
  3. `last_order_at` is always `null` in fallback mode
  4. Expected: "Letzte Bestellung" column shows the actual date
  5. Actual: Shows "--" for all dealers in fallback mode
- **Impact:** Minor data gap in admin table. The RPC function should be created to provide full stats.
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/dealers/route.ts` lines 47-64
- **Priority:** Nice to have (create the RPC function in a follow-up migration)

#### NEW BUG-013: Rate limiter does not apply to GET endpoints or test-recognition
- **Severity:** Low
- **Steps to Reproduce:**
  1. `checkAdminRateLimit()` is only called in POST, PATCH, DELETE handlers
  2. GET `/api/admin/dealers` and GET `/api/admin/dealers/[id]` are unrestricted
  3. POST `/api/admin/dealers/test-recognition` is also unrestricted
  4. A compromised admin could hammer these read endpoints or the test-recognition endpoint
- **Impact:** Low -- read endpoints are lightweight. The test-recognition endpoint processes files (CPU-bound) and would benefit from rate limiting.
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/dealers/test-recognition/route.ts` -- no rate limit check
- **Priority:** Nice to have

#### NEW BUG-014: In-memory rate limiter leaks memory over time
- **Severity:** Low
- **Steps to Reproduce:**
  1. `rateLimitMap` is a `Map<string, ...>` that grows with each unique user ID
  2. Expired entries are overwritten when the same user makes a new request, but entries for users who never return are never cleaned up
  3. In a long-running server, this map grows unboundedly
- **Impact:** Negligible for MVP (few admin users). In serverless environments (Vercel), functions are short-lived so the map resets frequently.
- **File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/admin-auth.ts` line 67
- **Priority:** Nice to have (add periodic cleanup or use TTL-based Map)

#### NEW BUG-015: Conflict check in [id]/route.ts duplicated from route.ts
- **Severity:** Low
- **Steps to Reproduce:**
  1. The `checkRuleConflicts()` function is defined twice: once in `route.ts` (lines 185-269) and once in `[id]/route.ts` (lines 268-327)
  2. Both implementations are identical
  3. If one is updated without the other, behavior diverges
- **Impact:** Code maintainability issue. No functional bug currently.
- **File:** Both files in `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/admin/dealers/`
- **Priority:** Nice to have (extract to shared module)

---

### Regression Testing (Updated)

#### OPH-1 (Multi-Tenant Auth)
- [x] Login flow unaffected
- [x] Role-based access control still enforced
- [x] Team management routes still protected

#### OPH-2 (Order Upload)
- [x] Upload flow unaffected

#### OPH-3 (Dealer Recognition)
- [x] Production recognition logic updated: `containsPattern` -> `matchesPattern` (uses regex). **This is a behavioral change** -- existing patterns that relied on substring matching may behave differently with regex. However, the fallback to substring for invalid regex ensures no breakage for non-regex patterns.
- [x] `matchesSenderAddress` supports wildcards -- additive, no breaking change
- [x] Dealer table schema unchanged from Round 1 (description column, mixed format type)

**Regression Note:** The change from substring to regex matching in `dealer-recognition.ts` affects ALL existing orders processed through OPH-3. Patterns like `Bestellung` (plain text) still match via regex (treated as literal). Patterns with special regex characters like `.` or `()` that were previously treated as literals will now be interpreted as regex metacharacters. This could cause unexpected matches or missed matches for existing dealers. **Recommend reviewing existing dealer patterns before deployment.**

#### OPH-5 (Order Review)
- [x] Review flow unaffected

#### OPH-6 (ERP Export)
- [x] Export flow unaffected

#### OPH-14 (Dealer Data Transformations)
- [x] Dealer mappings page and API unaffected

**Regression Result: CONDITIONAL PASS -- review existing dealer patterns for regex compatibility**

---

### Summary

- **Acceptance Criteria:** 9/9 fully passed (all bug fixes verified)
- **Edge Cases:** 3/3 documented + 4 additional -- all passed
- **Round 1 Bugs:** 8 of 11 fixed, 1 accepted (BUG-004), 1 now resolved (BUG-005), 1 still open and upgraded (BUG-006)
- **New Bugs Found:** 4 (BUG-012 through BUG-015), all Low severity
- **Open Bugs Total:** 5
  - 0 Critical
  - 0 High
  - 1 Medium (BUG-006 -- ReDoS, now exploitable after BUG-003 fix)
  - 4 Low (BUG-004, BUG-012, BUG-013, BUG-014, BUG-015)
- **Security:** ReDoS is the only remaining active security concern
- **Regression:** Behavioral change in OPH-3 pattern matching requires review of existing dealer patterns
- **Build:** Compiles successfully with no TypeScript errors

**Production Ready: CONDITIONAL YES**

The feature can be deployed if:
1. **BUG-006 (ReDoS)** is either (a) accepted as a known risk (only platform_admins can create patterns, limited blast radius) or (b) mitigated with a regex timeout/complexity check
2. **Existing dealer patterns are reviewed** for regex compatibility (the substring-to-regex change in OPH-3 production code could alter recognition behavior)

All other open bugs are Low severity and can be addressed in subsequent sprints.

### Round 3 (Re-test: BUG-006 ReDoS fix, BUG-012 RPC, BUG-015 dedup, remaining low bugs)

**Tested:** 2026-03-01
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Build Status:** Compiled successfully, no TypeScript errors (`npm run build` clean)

---

### Bug Fix Verification (Round 3)

#### BUG-006 (was Medium): ReDoS vulnerability via regex pattern injection
- **Status: PARTIALLY FIXED -- residual bypass exists**
- New `safe-regex.ts` module introduced with two functions:
  - `isRegexSafe(pattern)`: rejects patterns >500 chars and patterns matching `/\([^)]*[+*][^)]*\)[+*?{]/` (nested quantifier detection)
  - `safeMatchesPattern(text, pattern)`: calls `isRegexSafe()` first; if unsafe, falls back to substring matching instead of executing regex
- Both `dealer-recognition.ts` (production OPH-3 engine) and `test-recognition/route.ts` now use `safeMatchesPattern` instead of raw `new RegExp()`
- **Correctly catches:** `(a+)+$`, `(.*)+`, `(.+)*`, `([a-z]+){2,}`, `(x*)?`, `(a+b)+`, `(a|b+)+`
- **Verification:** Code at `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/safe-regex.ts`
- **REMAINING ISSUE:** The nested quantifier regex `/\([^)]*[+*][^)]*\)[+*?{]/` uses `[^)]*` which stops at the first `)`. This means patterns with nested groups bypass the check. See NEW BUG-016 below.

#### BUG-012 (was Low): Fallback order stats lack last_order_at date
- **Status: FIXED**
- New migration `013_dealer_order_stats_rpc.sql` creates the `get_dealer_order_stats()` RPC function
- RPC returns `dealer_id`, `order_count` (as BIGINT), `last_order_at` (as TIMESTAMPTZ) via `GROUP BY dealer_id`
- Function uses `SECURITY DEFINER` and `STABLE` annotations for correct execution context
- GET `/api/admin/dealers` route already tries RPC first (line 37) -- with this migration applied, the primary path provides full stats including `last_order_at`
- Fallback code (lines 46-64) remains as safety net for environments where migration has not run
- **Verification:** Migration at `/Users/michaelmollath/projects/ai-coding-starter-kit/supabase/migrations/013_dealer_order_stats_rpc.sql`

#### BUG-015 (was Low): Conflict check duplicated between route.ts and [id]/route.ts
- **Status: FIXED**
- New shared module `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/dealer-rule-conflicts.ts` contains the single `checkRuleConflicts()` function
- Both `route.ts` (POST) and `[id]/route.ts` (PATCH) import from `@/lib/dealer-rule-conflicts`
- No local `checkRuleConflicts` function definition remains in either route file
- The shared function accepts `excludeDealerId: string | null` to skip self-conflict on updates
- **Verification:** `grep -r "function checkRuleConflicts" src/` returns only one result in `dealer-rule-conflicts.ts`

---

### Remaining Open Bugs Status (Round 3 Review)

#### BUG-004 (Low): Dealer profile caching not implemented
- **Status: OPEN -- ACCEPTED (unchanged)**
- Spec contradiction remains. Current implementation correctly prioritizes immediate effect.

#### BUG-005 (Low): Status column display
- **Status: FIXED (verified in Round 2, unchanged)**

#### BUG-006 (Medium -> Low): ReDoS vulnerability
- **Status: PARTIALLY FIXED -- downgraded to Low**
- The `safe-regex.ts` module catches the most common ReDoS patterns (single-level nested quantifiers)
- However, bypass patterns with nested groups remain (see BUG-016)
- **Downgrade rationale:** The fix catches the most commonly encountered ReDoS patterns. Remaining bypasses require deliberate nested-group construction, further narrowing the already limited attack surface (platform_admins only).

#### BUG-012 (Low): Fallback order stats lack last_order_at
- **Status: FIXED** -- RPC migration created

#### BUG-013 (Low): Rate limiter does not apply to GET or test-recognition
- **Status: OPEN (unchanged)**
- Rate limiting still only on POST, PATCH, DELETE
- test-recognition endpoint (CPU-bound file processing) still unprotected

#### BUG-014 (Low): In-memory rate limiter leaks memory
- **Status: OPEN (unchanged)**
- No cleanup mechanism for stale entries
- Negligible impact for MVP

#### BUG-015 (Low): Conflict check duplicated
- **Status: FIXED** -- Extracted to shared module

---

### New Bug Found in Round 3

#### NEW BUG-016 (Medium): ReDoS bypass via nested parenthesized groups in safe-regex.ts
- **Severity:** Medium
- **Steps to Reproduce:**
  1. As platform_admin, create or edit a dealer profile
  2. In the "Betreff-Muster" or "Dateinamen-Muster" tag input, enter a pattern with nested groups: `((a+))+$`
  3. The frontend TagInput accepts it (only validates syntax, not safety)
  4. The backend Zod `regexPatternArray` accepts it (only validates syntax)
  5. The pattern is stored in the database
  6. When any order is processed via OPH-3 dealer recognition, or when the test-recognition endpoint is used, `safeMatchesPattern()` is called
  7. `isRegexSafe()` does NOT catch the pattern because the regex `/\([^)]*[+*][^)]*\)[+*?{]/` uses `[^)]*` which matches up to the first `)` -- but in `((a+))+$`, the inner `)` satisfies this, and the outer group+quantifier `)+$` is not checked by the regex
  8. The pattern is executed via `new RegExp(pattern, "i").test(text)`, causing catastrophic backtracking
- **Proof of Exploitation (verified via Node.js):**
  - `((a+))+$` with input `"a".repeat(25) + "X"` takes ~1,800 ms
  - `((a+))+$` with input `"a".repeat(30) + "X"` takes ~8,600 ms (exponential growth)
  - Additional bypass patterns confirmed: `((?:a+))+$`, `(?:(a+))+$`, `((a+)(b+))+$`, `(a+|(b+))+$`
- **Root Cause:** The regex `/\([^)]*[+*][^)]*\)[+*?{]/` in `isRegexSafe()` only inspects the innermost group level. It cannot detect quantifiers on outer groups when the inner group already closes the `[^)]*` match.
- **Impact:** Server hang during dealer recognition. A malicious or careless platform_admin can cause a denial of service on order processing.
- **Mitigation:** Attack surface is limited to platform_admins only. Recognition is an async background process, so it would not block the main request path for order uploads.
- **Recommendation:** Either (a) use a recursive/multi-pass nested group check, (b) use the `safe-regex` npm package which handles this, or (c) add a regex execution timeout via `setTimeout`/`AbortController` pattern.
- **Files affected:**
  - `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/safe-regex.ts` line 22 (insufficient regex)
  - `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/validations.ts` lines 289-298 (Zod schema does not use `isRegexSafe`)
  - `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/admin/tag-input.tsx` lines 36-43 (frontend does not use `isRegexSafe`)
- **Priority:** Should fix -- but can be deployed with documented risk since only platform_admins can create patterns

---

### Security Audit Update (Round 3)

#### ReDoS Mitigation Assessment
- [x] `safe-regex.ts` module provides defense-in-depth for common ReDoS patterns
- [x] Both production (`dealer-recognition.ts`) and test (`test-recognition/route.ts`) engines use `safeMatchesPattern`
- [ ] REMAINING: Nested-group bypass (BUG-016) allows certain ReDoS patterns through
- [ ] REMAINING: Neither backend Zod validation nor frontend TagInput call `isRegexSafe` -- dangerous patterns are accepted at input time and only caught (partially) at execution time
- **Recommendation for full fix:** Add `isRegexSafe()` check to both the Zod `regexPatternArray` and the frontend `TagInput` `validateRegex` logic, AND fix the nested-group bypass in the regex itself

#### RPC Security (New -- migration 013)
- [x] `get_dealer_order_stats()` uses `SECURITY DEFINER` -- executes with the function owner's privileges, not the caller's
- [x] Function is `STABLE` (no side effects, read-only)
- [x] Called via `adminClient.rpc()` from admin-only endpoint
- **Note:** `SECURITY DEFINER` means any authenticated user who can call `rpc('get_dealer_order_stats')` gets access to all dealer order stats. This is acceptable because: (a) the API route guards access with `requirePlatformAdmin()`, and (b) the RLS on the `orders` table would normally restrict row access, but the DEFINER context bypasses it. The function should ideally have an RLS check or be restricted to admin role at the database level. This is a minor concern for MVP since the API layer provides the access control.

---

### Regression Testing (Round 3)

#### OPH-3 (Dealer Recognition) -- Updated
- [x] Production engine now uses `safeMatchesPattern` from `safe-regex.ts` instead of raw `matchesPattern`
- [x] Common ReDoS patterns (e.g., `(a+)+$`) are safely caught and fall back to substring matching
- [x] Non-regex patterns (plain literals like `Bestellung`) still work correctly via regex (treated as literal)
- [x] No import errors or missing module references

#### All Other Features (OPH-1, OPH-2, OPH-4, OPH-5, OPH-6, OPH-14)
- [x] Unaffected by Round 3 changes (safe-regex module, RPC migration, conflict extraction are all additive)

**Regression Result: PASS**

---

### Summary (Round 3)

- **Acceptance Criteria:** 9/9 PASS (unchanged from Round 2)
- **Edge Cases:** 7/7 PASS (unchanged from Round 2)
- **Bugs Fixed in Round 3:** 3 of 5 open bugs addressed
  - BUG-006: Partially fixed (common patterns caught, bypass exists -> BUG-016)
  - BUG-012: FIXED (RPC migration created)
  - BUG-015: FIXED (extracted to shared module)
- **New Bug Found:** 1 (BUG-016, Medium -- ReDoS bypass via nested groups)
- **Open Bugs Total:** 5
  - 0 Critical
  - 0 High
  - 1 Medium (BUG-016 -- ReDoS nested-group bypass)
  - 4 Low (BUG-004 accepted, BUG-006 downgraded to Low, BUG-013, BUG-014)
- **Build:** Compiles successfully with no TypeScript errors
- **Security:** ReDoS mitigation significantly improved but not complete; nested-group bypass remains exploitable only by platform_admins

**Production Ready: CONDITIONAL YES**

The feature can be deployed if:
1. **BUG-016 (ReDoS bypass)** is accepted as a known risk -- only platform_admins can inject patterns, and the most common ReDoS vectors are now blocked. Alternatively, fix the nested-group detection before deployment.
2. **Existing dealer patterns are reviewed** for regex compatibility (the substring-to-regex change in OPH-3 production code could alter recognition behavior -- noted in Round 2, still applies).

All other open bugs are Low severity and can be addressed in subsequent sprints.

## Deployment

**Deployed:** 2026-03-01
**Production URL:** https://ai-coding-starter-kit-dusky.vercel.app/admin/dealers
**Status:** Live

### Deployment Notes
- Migration `013_dealer_order_stats_rpc.sql` applied to Supabase before deployment (creates `get_dealer_order_stats()` RPC)
- BUG-016 (ReDoS nested-group bypass) was fixed after QA Round 3 with a proper character-by-character group parser in `safe-regex.ts` — all 5 bypass patterns now rejected
- Existing dealer patterns should be reviewed for regex compatibility (OPH-3 pattern matching changed from substring to regex in this feature)

### Open Low-Severity Bugs (deferred to future sprints)
- BUG-004: Caching not implemented (spec contradiction — intentional for MVP)
- BUG-013: Rate limiting not on GET/test-recognition endpoints
- BUG-014: In-memory rate limiter has no cleanup mechanism (negligible on Vercel serverless)
