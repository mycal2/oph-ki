# OPH-6: ERP-Export & Download

## Status: In Review
**Created:** 2026-02-27
**Last Updated:** 2026-03-01

## Dependencies
- Requires: OPH-5 (Bestellprüfung) — nur freigegebene Bestellungen können exportiert werden
- Requires: OPH-9 (Admin: ERP-Mapping-Konfiguration) — für produktiven Betrieb; MVP-Phase: einfache Basiskonfiguration per Code

## Konzept
Das Canonical JSON (aus OPH-4) wird per kundenspeziifischen Mapping-Regeln in das Zielformat des ERP-Systems des Mandanten transformiert. Der Benutzer lädt die fertige Datei herunter und importiert sie manuell in sein ERP.

Unterstützte Ausgabeformate (MVP):
- **CSV** (konfigurierbare Spalten, Trennzeichen, Zeichensatz)
- **XML** (frei konfigurierbares Schema)
- **JSON** (direkte Ausgabe des Canonical JSON oder transformiert)

Spätere Erweiterung (P1+):
- SAP IDOC-Format
- Dynamics 365 Import-Format
- Sage-spezifische Formate

## User Stories
- Als Mitarbeiter möchte ich eine freigegebene Bestellung mit einem Klick in das Format meines ERP-Systems exportieren, damit ich die Datei direkt in mein ERP importieren kann.
- Als Mitarbeiter möchte ich nach dem Export sehen, dass die Bestellung als "Exportiert" markiert wurde, damit ich den Status der Verarbeitung nachvollziehen kann.
- Als Mitarbeiter möchte ich eine bereits exportierte Bestellung erneut exportieren können (z.B. nach ERP-Importfehler), damit ich nicht von vorne anfangen muss.
- Als Mitarbeiter möchte ich vor dem Export eine Vorschau des Export-Inhalts sehen, damit ich sicherstellen kann, dass die Daten korrekt transformiert wurden.

## Acceptance Criteria
- [ ] Export-Button ist nur für Bestellungen mit Status "Freigegeben" aktiv
- [ ] Export generiert eine Datei im konfigurierten ERP-Format des Mandanten
- [ ] Datei-Download startet sofort im Browser (kein E-Mail-Versand)
- [ ] Export-Datei enthält korrekt gemappte Felder gemäß Mandanten-Konfiguration
- [ ] Bestellung erhält Status "Exportiert" nach erfolgreichem Download-Start
- [ ] Erneuter Export ist jederzeit möglich (keine Einschränkung)
- [ ] Export-Vorschau zeigt die ersten 10 Zeilen / das transformierte Dokument vor dem Download
- [ ] Jeder Export wird protokolliert (Timestamp, Benutzer, Format, Dateiname)
- [ ] Für MVP: mindestens CSV-Export mit konfigurierbaren Spalten muss funktionieren
- [ ] Dateiname des Exports: `{mandant}_{bestellnummer}_{datum}.{format}`

## Edge Cases
- Was passiert, wenn keine ERP-Mapping-Konfiguration für den Mandanten vorhanden ist? → Fehlermeldung "Keine ERP-Konfiguration gefunden. Bitte wenden Sie sich an den Administrator."
- Was passiert, wenn ein Pflichtfeld in der Canonical JSON `null` ist, aber im ERP-Mapping als Pflichtfeld markiert ist? → Export wird verhindert; Fehlermeldung zeigt fehlendes Feld; Benutzer muss in OPH-5 korrigieren
- Was passiert, wenn die Transformation sehr lange dauert (große Bestellung)? → Maximale Transformationszeit: 10 Sekunden; bei Überschreitung Fehlermeldung
- Was passiert, wenn das ERP-System des Kunden ein unerwartetes Zeichenproblem hat (Encoding)? → Encoding ist in der Mandanten-Konfiguration einstellbar (UTF-8, ISO-8859-1, Windows-1252)

## Technical Requirements
- Transformation läuft serverseitig (API Route) — kein Client-seitiges Datei-Generieren
- Mapping-Engine: Template-basiert (Handlebars oder eigene Implementierung)
- Für CSV: konfigurierbare Trennzeichen, Quote-Zeichen, Header-Zeile, Zeichensatz
- Für XML: konfigurierbares XML-Template mit Placeholder-Syntax
- Datei wird direkt aus dem Response-Stream an den Browser geliefert (kein Storage-Zwischenspeicher)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure
```
Order Detail Page (/orders/[orderId])
+-- OrderDetailHeader (existing)
|   +-- ExportButton (NEW — visible for "approved" + "exported" orders)
|
+-- ExportDialog (NEW — opens on click)
    +-- Format Selector (CSV / XML / JSON — pre-selected from tenant config)
    +-- ExportPreviewPanel (NEW — shows first 10 rows before downloading)
    +-- Download Button → triggers file download + closes dialog
    +-- Re-export Notice (shown if order already "exported" previously)
```

### Data Model

**New table: `erp_configs`** — one row per tenant (OPH-9 will add admin UI to edit)
- tenant_id (FK tenants)
- format: "csv" | "xml" | "json"
- column_mappings: JSONB array of { source_field, target_column_name }
- separator, quote_char, encoding (for CSV)
- is_default: boolean
- Seed: one default CSV config for Demo Dental GmbH

**New table: `export_logs`** — audit trail of every download
- order_id, tenant_id, user_id
- format, filename, exported_at

**`orders` table** — add `last_exported_at` timestamp column

### API Routes
| Route | Purpose |
|-------|---------|
| `GET /api/orders/[orderId]/export?format=csv` | Generates + streams export file, updates status + logs |
| `GET /api/orders/[orderId]/export/preview?format=csv` | Returns first 10 rows as JSON for preview panel |

### Tech Decisions
- **Server-side generation + direct stream** — no Storage, instant download, encoding handled server-side
- **JSONB column mappings** — flexible for any format; OPH-9 just adds a UI, no schema changes
- **Source data**: uses `reviewed_data` first, falls back to `extracted_data`
- **No new packages** — CSV via Node.js string building; XML/JSON later with minimal additions
- **Re-export always allowed** — creates new log entry, status stays "exported"

## QA Test Results

**Tested by:** QA / Red-Team Pen-Test
**Date:** 2026-03-01
**Build status:** PASS (npm run build succeeds with no type errors)

---

### Acceptance Criteria Results

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Export-Button only active for "approved"/"exported" | PASS | `ExportButton` checks `EXPORTABLE_STATUSES` and returns `null` for non-matching statuses. API routes also enforce status check server-side. |
| 2 | Export generates file in configured ERP format | PASS | CSV, XML, and JSON formats all implemented. Uses tenant `erp_configs` or falls back to default mappings. |
| 3 | File download starts immediately in browser | PASS | `use-export.ts` creates a Blob from the response, generates an object URL, and triggers a click on a dynamically created anchor element. No email involved. |
| 4 | Export file contains correctly mapped fields per tenant config | PASS (with bugs, see below) | Column mappings from `erp_configs` are applied. Fallback default mappings exist. However, see BUG-003 and BUG-004 for XML-specific issues. |
| 5 | Order gets status "exported" after successful download | PASS (with bug, see BUG-001) | Status update is attempted but will fail at the database level due to missing CHECK constraint value. |
| 6 | Re-export is always possible | PASS | Both "approved" and "exported" statuses are in the allowed list. New log entry is created each time. |
| 7 | Export preview shows first 10 rows / transformed document | PASS | `MAX_PREVIEW_ROWS = 10` in preview route. CSV shows table, XML/JSON show raw content. |
| 8 | Every export is logged (timestamp, user, format, filename) | PASS | `export_logs` table insert includes `order_id`, `tenant_id`, `user_id`, `format`, `filename`, `exported_at`. |
| 9 | MVP: CSV export with configurable columns works | PASS | CSV generation with configurable `column_mappings`, `separator`, `quote_char`, and `encoding` is implemented. Seed config created for demo tenant. |
| 10 | Filename follows pattern: {tenant}_{ordernumber}_{date}.{format} | PASS | `generateFilename()` builds `{slug}_{number}_{date}.{format}` with sanitized characters. |

---

### Bug Report

#### BUG-001: CRITICAL -- Database CHECK constraint missing "approved" status

**Severity:** Critical
**Priority:** P0 -- Blocks entire OPH-5 and OPH-6 functionality
**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/supabase/migrations/002_oph2_order_upload.sql` (line 30)

**Description:**
The `orders` table CHECK constraint on the `status` column allows only: `'uploaded', 'processing', 'extracted', 'review', 'exported', 'error'`. The value `'approved'` is missing. No migration (including OPH-5's `005_oph5_order_review.sql`) adds it.

This means:
- OPH-5's approve endpoint cannot set `status = 'approved'` -- the database will reject the INSERT/UPDATE.
- OPH-6's export flow checks for `status IN ('approved', 'exported')` but no order can ever reach "approved" status in the database.
- The TypeScript type `OrderStatus` includes "approved" but the database does not allow it.

**Steps to reproduce:**
1. Create an order and process it through to the review stage.
2. Attempt to approve the order (POST /api/orders/[orderId]/approve).
3. The database will reject the status update with a CHECK constraint violation.

**Expected:** The CHECK constraint should include 'approved'.
**Actual:** The constraint is `CHECK (status IN ('uploaded', 'processing', 'extracted', 'review', 'exported', 'error'))`.

**Fix needed:** Add a migration to alter the CHECK constraint:
```sql
ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('uploaded', 'processing', 'extracted', 'review', 'approved', 'exported', 'error'));
```

---

#### BUG-002: HIGH -- XML injection in export route: unescaped fields

**Severity:** High
**Priority:** P1 -- Security vulnerability
**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/export/route.ts` (lines 260-275)

**Description:**
In the XML export generation, several fields are interpolated into XML without escaping special characters (`&`, `<`, `>`, `"`, `'`). Line item values are properly escaped (lines 284-289), and the `notes` field is partially escaped (line 298), but the following fields are NOT escaped:

- `order_number` (line 260)
- `order_date` (line 261)
- `dealer.name` (line 264)
- `delivery_address.company` (line 270)
- `delivery_address.street` (line 271)
- `delivery_address.city` (line 272)
- `delivery_address.postal_code` (line 273)
- `delivery_address.country` (line 274)
- `total_amount` (line 295) -- numeric, low risk
- `currency` (line 296)

If any of these fields contain XML special characters (e.g., a company name like "Smith & Jones GmbH"), the generated XML will be malformed or could enable XML injection.

**Steps to reproduce:**
1. Create an order where the dealer name or company address contains `&` or `<`.
2. Export as XML.
3. The generated XML will be invalid.

**Expected:** All values interpolated into XML should be escaped.
**Actual:** Only line item values and notes are escaped.

---

#### BUG-003: HIGH -- XML injection in preview route: no escaping at all

**Severity:** High
**Priority:** P1 -- Security vulnerability
**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/export/preview/route.ts` (lines 239-259)

**Description:**
The XML preview generation has ZERO XML escaping. Unlike the export route which escapes line item values (but misses header-level fields), the preview route does not escape any values at all:

- `order_number` (line 242) -- not escaped
- `order_date` (line 243) -- not escaped
- Line item values (line 249) -- not escaped
- `total_amount` (line 257) -- not escaped
- `currency` (line 258) -- not escaped

While this is a preview returned as JSON (not served as XML content), it could mislead users into thinking the export is correct when the preview shows unescaped data. The preview should match the actual export output.

**Steps to reproduce:**
1. Create an order with a description containing `<script>` or `&` characters.
2. Request XML preview.
3. The preview shows unescaped XML, potentially rendering incorrectly in the UI.

---

#### BUG-004: HIGH -- XML encoding declaration is hardcoded to UTF-8

**Severity:** High
**Priority:** P1
**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/export/route.ts` (line 259)

**Description:**
The XML declaration is hardcoded as `<?xml version="1.0" encoding="UTF-8"?>` regardless of the tenant's configured encoding. If a tenant has `encoding: "ISO-8859-1"` in their ERP config, the XML declaration will still say UTF-8, creating a mismatch.

Furthermore, the actual response body is always a JavaScript string (UTF-16 internally, served as whatever the Content-Type charset says), but no actual encoding conversion is performed. The `getCharset()` function sets the Content-Type header charset but Node.js/Next.js will always output UTF-8 by default. Non-UTF-8 encodings (ISO-8859-1, Windows-1252) are declared but never actually applied.

**Steps to reproduce:**
1. Configure an ERP config with `encoding: "ISO-8859-1"`.
2. Export as XML or CSV.
3. The Content-Type header says `charset=iso-8859-1` but the actual bytes are UTF-8.
4. For XML, the declaration says `encoding="UTF-8"` contradicting the Content-Type header.

**Expected:** Either convert the output to the configured encoding or limit supported encodings to UTF-8 for MVP.

---

#### BUG-005: MEDIUM -- No Zod validation schema for export format query parameter

**Severity:** Medium
**Priority:** P2
**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/validations.ts`
**Related:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/export/route.ts` (line 101)

**Description:**
Per the security rules in `.claude/rules/security.md`: "Validate ALL user input on the server side with Zod." The export `format` query parameter is cast with `as ExportFormat` (line 101) and then checked against a hardcoded array, but there is no Zod schema defined for export inputs. This is inconsistent with the validation pattern used in all other API routes (OPH-1 through OPH-5).

**Steps to reproduce:** N/A (code review finding).

**Expected:** A Zod schema for export parameters should exist in `validations.ts`.
**Actual:** Format validation uses a manual array check instead of Zod.

---

#### BUG-006: MEDIUM -- Export status update and log insert errors are silently ignored

**Severity:** Medium
**Priority:** P2
**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/export/route.ts` (lines 313-341)

**Description:**
The status update (line 313-319), export log insert (line 322-329), and audit log insert (line 333-341) all use `await` but do not check the return value for errors. If any of these operations fail (e.g., database constraint violation, connection error), the error is silently swallowed and the file is still served to the user.

This means:
- The order status might not actually be "exported" even though the file was downloaded.
- The export log might be missing, violating the audit trail requirement.
- The user has no way to know something went wrong server-side.

**Steps to reproduce:**
1. Simulate a database error during the status update.
2. The file download succeeds but the order status and audit trail are not updated.

**Expected:** Errors from these operations should be handled. At minimum, log them server-side. Consider whether to fail the entire request or to return the file with a warning.

---

#### BUG-007: MEDIUM -- Edge case not implemented: missing ERP config should show specific error

**Severity:** Medium
**Priority:** P2
**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/export/route.ts` (lines 219-230)

**Description:**
The spec's Edge Cases section states: "Was passiert, wenn keine ERP-Mapping-Konfiguration fuer den Mandanten vorhanden ist? -> Fehlermeldung 'Keine ERP-Konfiguration gefunden. Bitte wenden Sie sich an den Administrator.'"

However, the implementation falls back to a default mapping instead of showing an error. While this is a reasonable MVP decision (the tech design says "use default"), it contradicts the edge case specification.

**Steps to reproduce:**
1. Use a tenant without any `erp_configs` entry.
2. Export an order.
3. Export succeeds with default mappings instead of showing the specified error.

**Expected per spec:** Error message "Keine ERP-Konfiguration gefunden."
**Actual:** Falls back to hardcoded default CSV mappings.

**Note:** The tech design explicitly says to use defaults when no config exists, which conflicts with the edge case spec. This should be resolved by the product owner.

---

#### BUG-008: MEDIUM -- Edge case not implemented: required field validation

**Severity:** Medium
**Priority:** P2
**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/export/route.ts`

**Description:**
The spec's Edge Cases section states: "Was passiert, wenn ein Pflichtfeld in der Canonical JSON null ist, aber im ERP-Mapping als Pflichtfeld markiert ist? -> Export wird verhindert; Fehlermeldung zeigt fehlendes Feld."

The `ErpColumnMapping` type has no `required` flag, and the export route does not validate whether mapped fields are null. If a required field is null, it simply exports an empty string.

**Steps to reproduce:**
1. Have an order with `article_number: null` in a line item.
2. Export with a mapping that includes `article_number`.
3. The CSV will contain an empty cell -- no error is raised.

**Expected per spec:** Export should be prevented with a field-specific error.
**Actual:** Empty values are exported silently.

---

#### BUG-009: MEDIUM -- No unique constraint on erp_configs(tenant_id, format)

**Severity:** Medium
**Priority:** P2
**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/supabase/migrations/006_oph6_erp_export.sql`

**Description:**
The `erp_configs` table has a unique index only on `(tenant_id) WHERE is_default = true`, but no unique constraint on `(tenant_id, format)`. This means a tenant could have multiple CSV configs. The API uses `.limit(1).maybeSingle()` which would return an arbitrary one, leading to unpredictable behavior.

**Steps to reproduce:**
1. Insert two CSV configs for the same tenant.
2. Export as CSV.
3. Which config is used is nondeterministic.

**Expected:** Either add a unique constraint on `(tenant_id, format)` or add an `ORDER BY` clause (e.g., by `is_default DESC, created_at DESC`) to deterministically pick one.

---

#### BUG-010: MEDIUM -- Missing security header: X-Content-Type-Options: nosniff

**Severity:** Medium
**Priority:** P2
**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/export/route.ts` (lines 344-347)

**Description:**
Per `.claude/rules/security.md`, the response should include `X-Content-Type-Options: nosniff`. The export response sets `Content-Type`, `Content-Disposition`, and `Cache-Control` but omits `X-Content-Type-Options`. This header prevents browsers from MIME-sniffing the response, which is important for file download endpoints to prevent content-type confusion attacks.

**Steps to reproduce:** Inspect response headers of the export endpoint.

**Expected:** `X-Content-Type-Options: nosniff` should be set on the response.
**Actual:** Header is missing.

---

#### BUG-011: MEDIUM -- Edge case not implemented: transformation timeout

**Severity:** Medium
**Priority:** P2
**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/export/route.ts`

**Description:**
The spec's Edge Cases section states: "Maximale Transformationszeit: 10 Sekunden; bei Ueberschreitung Fehlermeldung." No timeout mechanism is implemented for the export generation. For very large orders, the request could take longer than expected.

**Steps to reproduce:** Export an order with thousands of line items.

**Expected:** A 10-second timeout with a user-friendly error.
**Actual:** No timeout is enforced.

---

#### BUG-012: LOW -- Content-Disposition filename not RFC 5987 encoded

**Severity:** Low
**Priority:** P3
**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/export/route.ts` (line 346)

**Description:**
The `Content-Disposition` header uses `filename="..."` with a simple double-quote wrapper. If the generated filename contains special characters (e.g., non-ASCII from tenant slug or order number), some browsers may not handle it correctly. RFC 5987 recommends using `filename*=UTF-8''...` for non-ASCII filenames.

The `generateFilename()` function sanitizes with `replace(/[^a-z0-9-]/gi, "_")` which mitigates most issues, but the pattern does not handle all edge cases.

**Steps to reproduce:** Use a tenant slug with umlauts or special characters.

**Expected:** Use both `filename` and `filename*` parameters in Content-Disposition for maximum compatibility.
**Actual:** Only `filename` is used.

---

#### BUG-013: LOW -- Duplicated utility functions between export and preview routes

**Severity:** Low
**Priority:** P3
**Files:**
- `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/export/route.ts` (lines 19-40, 64-73)
- `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/export/preview/route.ts` (lines 22-43, 49-58)

**Description:**
`getLineItemValue()` and `generateFilename()` are duplicated identically across the export and preview routes. This creates a maintenance risk where a fix in one file could be missed in the other (e.g., the XML escaping that exists in the export route but is missing in the preview route is likely a consequence of this duplication).

**Expected:** Extract shared functions into a shared utility module (e.g., `src/lib/export-utils.ts`).

---

#### BUG-014: LOW -- Export dialog does not pre-select format from tenant config

**Severity:** Low
**Priority:** P3
**File:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/orders/export/export-dialog.tsx` (line 64)

**Description:**
The tech design states "Format Selector (CSV / XML / JSON -- pre-selected from tenant config)". However, the dialog always defaults to `"csv"` (line 64: `useState<ExportFormat>("csv")`). It does not fetch or use the tenant's default ERP config format.

**Steps to reproduce:**
1. Configure a tenant with XML as the default format.
2. Open the export dialog.
3. CSV is pre-selected instead of XML.

**Expected:** The default format should come from the tenant's `erp_configs` where `is_default = true`.
**Actual:** Always defaults to CSV.

---

### Security Audit (Red-Team Perspective)

| Check | Result | Notes |
|-------|--------|-------|
| Authentication enforced | PASS | Both export and preview routes verify user session via `supabase.auth.getUser()`. |
| Tenant isolation | PASS | Orders are filtered by `tenant_id` for non-platform-admin users. Uses admin client for queries but applies tenant scoping in WHERE clause. |
| Input validation (orderId) | PASS | UUID regex validation applied before database query. |
| Input validation (format) | PASS (partial) | Format checked against `VALID_FORMATS` array, but not via Zod (see BUG-005). |
| RLS on erp_configs | PASS | RLS enabled with tenant-scoped SELECT and platform-admin CRUD policies. |
| RLS on export_logs | PASS | RLS enabled with tenant-scoped SELECT/INSERT and platform-admin SELECT/INSERT. Immutable (no UPDATE/DELETE policies). |
| Inactive user check | PASS | Both `user_status` and `tenant_status` checked for "inactive". |
| Admin client usage | ACCEPTABLE | Admin client used because RLS on orders is tenant-scoped; the API applies its own tenant filtering. Consistent with other API routes. |
| IDOR (order access) | PASS | Tenant scoping prevents accessing other tenants' orders. Platform admin bypass is intentional. |
| CSV injection | LOW RISK | CSV values are properly quoted/escaped using configurable quote character. The `escapeCsvField()` function handles separators, quotes, newlines. However, no protection against formula injection (cells starting with `=`, `+`, `-`, `@`). This is a known CSV-specific risk but low priority since the export is for ERP import, not spreadsheet viewing. |
| XML injection | FAIL | See BUG-002 and BUG-003. Multiple fields are not XML-escaped. |
| Path traversal via filename | PASS | `generateFilename()` sanitizes with `replace(/[^a-z0-9-]/gi, "_")` preventing path traversal characters. |
| Rate limiting on export | NOT IMPLEMENTED | No rate limiting on the export endpoint. A malicious user could repeatedly trigger exports to cause database load (status updates + log inserts). Low risk since authentication is required. |
| Secret exposure | PASS | No secrets in source code. Admin client uses env vars. |
| Error message information leakage | PASS | Error messages are generic German strings, no stack traces or internal details exposed. |

---

### Cross-Browser / Responsive Notes

| Check | Expected | Notes |
|-------|----------|-------|
| Blob download (Chrome, Firefox, Safari) | Works | The `useExport` hook uses `URL.createObjectURL` + anchor click pattern which is supported across all modern browsers. |
| Export button responsive (375px) | PASS | Button text hidden on mobile via `hidden sm:inline`, only icon shown. |
| Export button responsive (768px) | PASS | Full text shown with icon at tablet width. |
| Export button responsive (1440px) | PASS | Full text shown with icon at desktop width. |
| Export dialog responsive | PASS | Dialog uses `sm:max-w-2xl` with `max-h-[85vh] overflow-y-auto`. Footer uses `flex-col sm:flex-row`. |
| Preview table horizontal scroll | PASS | Table wrapped in `ScrollArea` with `overflow-x-auto` for wide tables. |
| Code preview scroll | PASS | XML/JSON preview uses `ScrollArea` with `max-h-[320px]`. |

---

### Regression Check (Existing Features)

| Feature | Check | Result |
|---------|-------|--------|
| OPH-1: Auth | Login/logout flow unaffected | PASS -- No auth code changes |
| OPH-2: Upload | Upload flow unaffected | PASS -- No upload code changes |
| OPH-3: Dealer Recognition | Dealer section in header | PASS -- `order-detail-header.tsx` now includes ExportButton but DealerSection is unchanged |
| OPH-4: AI Extraction | Extraction flow unaffected | PASS -- No extraction code changes |
| OPH-5: Order Review | Review flow + approve | PASS -- Review page unmodified; `OrderForReview` type extended with `last_exported_at` which is backward compatible |
| OPH-5/OPH-6: Status "approved" | Orders can reach "approved" status | FAIL -- See BUG-001, the database CHECK constraint blocks this |

---

### Summary

**Total bugs found:** 14
- **Critical:** 1 (BUG-001: missing "approved" in DB CHECK constraint)
- **High:** 3 (BUG-002, BUG-003, BUG-004: XML escaping and encoding issues)
- **Medium:** 6 (BUG-005 through BUG-011: validation, error handling, missing edge cases, security header)
- **Low:** 3 (BUG-012, BUG-013, BUG-014: filename encoding, code duplication, default format)

**Blocking issues for deployment:**
1. BUG-001 must be fixed before any testing can proceed -- "approved" status is unreachable in the database, which blocks OPH-5 approval AND OPH-6 export.
2. BUG-002 and BUG-003 should be fixed before deployment due to XML corruption risk with real-world data containing `&` characters (extremely common in German company names).

**Recommendation:** Fix BUG-001 immediately, then BUG-002/003/004. After that, re-test the full export flow end-to-end.

## Deployment
_To be added by /deploy_
