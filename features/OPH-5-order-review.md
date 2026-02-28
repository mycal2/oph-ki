# OPH-5: Bestellprüfung & manuelle Korrektur

## Status: Deployed
**Created:** 2026-02-27
**Last Updated:** 2026-02-28
**Deployed:** 2026-02-28

## Dependencies
- Requires: OPH-4 (KI-Datenextraktion) — extrahierte Daten müssen vorliegen

## User Stories
- Als Mitarbeiter möchte ich die automatisch extrahierten Bestelldaten in einer übersichtlichen UI sehen und mit dem Original-Dokument vergleichen können, damit ich Fehler erkennen und korrigieren kann.
- Als Mitarbeiter möchte ich einzelne Felder der Bestellung direkt im Browser bearbeiten (Artikelnummer, Menge, Preis etc.), damit die Daten vor dem ERP-Export korrekt sind.
- Als Mitarbeiter möchte ich Bestellpositionen hinzufügen oder löschen, damit ich auch bei unvollständiger Extraktion eine vollständige Bestellung erstellen kann.
- Als Mitarbeiter möchte ich sehen, welche Felder vom KI-Modell mit geringer Konfidenz extrahiert wurden (visuelle Markierung), damit ich meine Prüfung auf kritische Stellen fokussieren kann.
- Als Mitarbeiter möchte ich eine Bestellung als "Geprüft und freigegeben" markieren, damit klar ist, dass die Daten manuell validiert wurden und exportiert werden können.
- Als Mitarbeiter möchte ich eine Bestellung ablehnen / erneut extrahieren lassen, wenn die Qualität unzureichend ist.

## Acceptance Criteria
- [ ] Review-UI zeigt Original-Dokument (Vorschau/PDF-Viewer) und extrahierte Daten nebeneinander
- [ ] Alle Canonical-JSON-Felder sind editierbar (inline editing in der Tabelle/Form)
- [ ] Felder mit niedrigem Konfidenz-Score sind visuell markiert (z.B. gelbe Hintergrundfarbe)
- [ ] Bestellpositionen können hinzugefügt, bearbeitet und gelöscht werden
- [ ] Änderungen werden automatisch zwischengespeichert (kein Datenverlust bei Browser-Refresh)
- [ ] "Bestellung freigeben" Button: setzt Status auf "Freigegeben" und aktiviert ERP-Export (OPH-6)
- [ ] "Erneut extrahieren" Button: startet KI-Extraktion neu (bisherige manuelle Änderungen werden nach Bestätigung verworfen)
- [ ] Alle Änderungen werden mit Zeitstempel und Benutzer protokolliert (Audit-Trail)
- [ ] Validierung: Pflichtfelder (mind. 1 Bestellposition mit Beschreibung und Menge) müssen gefüllt sein vor Freigabe
- [ ] Benutzer sieht den Händler (erkannt oder manuell gewählt) und kann ihn in dieser View korrigieren

## Edge Cases
- Was passiert, wenn zwei Mitarbeiter gleichzeitig dieselbe Bestellung bearbeiten? → Optimistic Locking: zweiter Bearbeiter erhält Warnung "Diese Bestellung wird bereits von [Name] bearbeitet"
- Was passiert, wenn der Benutzer den Browser schließt ohne zu speichern? → Auto-Save nach jeder Änderung (Debounce 2 Sekunden); keine Datenverluste
- Was passiert, wenn eine freigegebene Bestellung nachträglich geändert werden muss? → Status wird auf "In Korrektur" zurückgesetzt; erneute Freigabe erforderlich
- Was passiert, wenn das Original-Dokument nicht mehr verfügbar ist (gelöscht)? → Vorschau zeigt Fehlermeldung "Original nicht mehr verfügbar"; Bearbeitung der Daten bleibt möglich
- Was passiert, wenn alle Positionsfelder `null` sind (Extraktion komplett fehlgeschlagen)? → Benutzer kann alle Felder manuell ausfüllen; keine Blockierung

## Technical Requirements
- PDF-Vorschau: Einbettung via iframe oder PDF.js
- Auto-Save: debounced PATCH-Request an API nach jeder Änderung
- Optimistic Locking: `updated_at` Timestamp-Vergleich
- Audit-Log: `order_edits`-Tabelle (order_id, user_id, field, old_value, new_value, timestamp)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

```
/orders/[orderId] (existing)
+-- ExtractionResultPreview
    +-- "Zur Prüfung" button  ← UPDATED: links to review page

/orders/[orderId]/review  ← NEW ROUTE
+-- ReviewPageHeader
|   +-- Back button → /orders/[orderId]
|   +-- Order status badge
|   +-- Auto-save indicator ("Gespeichert" / "Speichern..." / "Fehler")
|   +-- Action buttons: "Freigeben" | "Erneut extrahieren" | "Zurück"
|
+-- Two-column layout (stacked on mobile, side-by-side on desktop)
|
+-- Left: DocumentPreviewPanel
|   +-- FileTabBar (if multiple files)
|   +-- PDF iframe embed (signed URL, refreshed on load)
|   +-- Fallback: download link for non-PDF files
|
+-- Right: OrderEditForm
    +-- HeaderSection
    |   +-- Order number (editable)
    |   +-- Order date (editable date picker)
    |   +-- Dealer (display + override link)
    +-- LineItemsTable
    |   +-- Each row: position, article #, description, quantity, unit, price, total
    |   +-- Low-confidence fields: yellow highlight banner (if confidence < 0.8)
    |   +-- Inline edit on click
    |   +-- Delete button per row
    |   +-- "Position hinzufügen" button at bottom
    +-- AddressSection (collapsible)
    |   +-- Delivery address fields
    |   +-- Billing address fields
    +-- TotalsSection
    |   +-- Total amount + currency (editable)
    +-- NotesField (textarea, editable)
```

### Data Model

**3 new columns on the `orders` table:**

| Column | What it stores |
|--------|----------------|
| `reviewed_data` | Human-edited order JSON — separate from `extracted_data`. Pre-populated from AI extraction when review starts. |
| `reviewed_at` | Timestamp of approval |
| `reviewed_by` | User ID who approved the order |

`reviewed_data` is kept separate from `extracted_data` (AI output) so we can compare what the AI extracted vs. what a human corrected — useful for auditing and future AI improvements.

**New table: `order_edits`** (audit trail)

| Column | What it stores |
|--------|----------------|
| `id` | Unique ID |
| `order_id` | Which order |
| `tenant_id` | For RLS isolation |
| `user_id` | Who made the change |
| `field_path` | Which field (e.g. `line_items[2].quantity`) |
| `old_value` | Before (JSONB) |
| `new_value` | After (JSONB) |
| `changed_at` | When |

### API Routes

| Route | Purpose |
|-------|---------|
| `PATCH /api/orders/[orderId]/review` | Auto-save edits + create audit log entries. Sends `updatedAt` for optimistic locking. |
| `POST /api/orders/[orderId]/approve` | Validates (min. 1 line item), sets `status → "review"`, records reviewer. |
| `GET /api/orders/[orderId]/preview-url` | Returns 1-hour signed URLs for each file (for PDF iframe). |

### Tech Decisions

- **PDF Preview:** Signed URL + iframe. No PDF.js (avoids ~2MB bundle weight). "In neuem Tab öffnen" fallback for browsers that block iframes.
- **Auto-Save:** 2-second debounce on every change → PATCH. Auto-save indicator shows status.
- **Optimistic Locking:** `orders.updated_at` used as version token. 409 returned if another user saved in the meantime.
- **Confidence Highlights:** Overall confidence < 0.8 → yellow banner on the edit form. No per-field scores (AI doesn't produce them yet).
- **No new packages:** All shadcn/ui form components already installed.

### Database Migration

One new migration (`005_oph5_order_review.sql`):
- Adds `reviewed_data`, `reviewed_at`, `reviewed_by` to `orders` table
- Creates `order_edits` table with RLS policies (tenant-scoped)

## QA Test Results

**Tested:** 2026-02-28
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Build Status:** PASS (Next.js 16.1.1 Turbopack build succeeds with no errors; 27 routes compiled including `/orders/[orderId]/review`, `/api/orders/[orderId]/review`, `/api/orders/[orderId]/approve`, `/api/orders/[orderId]/preview-url`)

---

### Acceptance Criteria Status

#### AC-1: Review UI shows original document (preview/PDF viewer) and extracted data side by side
- [x] Two-column layout via `grid grid-cols-1 lg:grid-cols-2 gap-6` in review-page-content.tsx line 338
- [x] Left column: `DocumentPreviewPanel` fetches signed URLs from `GET /api/orders/[orderId]/preview-url`
- [x] PDF files embedded via `<iframe>` with dynamic height `h-[500px] lg:h-[calc(100vh-280px)]` (document-preview-panel.tsx line 151-155)
- [x] Non-PDF files show download link fallback with "Vorschau fuer diesen Dateityp nicht verfuegbar" message (document-preview-panel.tsx lines 157-173)
- [x] "In neuem Tab" button available for all file types (document-preview-panel.tsx lines 111-126)
- [x] Multiple files supported via file tab bar (document-preview-panel.tsx lines 131-146)
- [x] Right column: `OrderEditForm` shows all editable fields
- [x] Signed URLs expire after 1 hour (SIGNED_URL_EXPIRY_SECONDS = 3600 in preview-url/route.ts line 10)
- [x] Empty files state handled: "Keine Dateien fuer die Vorschau verfuegbar" (document-preview-panel.tsx lines 84-99)
- [x] Error state handled: Alert + retry button (document-preview-panel.tsx lines 65-81)
- **PASS**

#### AC-2: All Canonical JSON fields are editable (inline editing)
- [x] Order number: Input field (order-edit-form.tsx lines 155-165)
- [x] Order date: date-type Input (order-edit-form.tsx lines 167-178)
- [x] Line items: article number, description, quantity, unit, unit price, total price, currency per row (order-edit-form.tsx lines 313-437)
- [x] Delivery address: company, street, city, postal code, country via collapsible section (order-edit-form.tsx lines 235-242)
- [x] Billing address: same fields via collapsible section (order-edit-form.tsx lines 244-251)
- [x] Total amount + currency: Input fields (order-edit-form.tsx lines 256-280)
- [x] Notes: Textarea (order-edit-form.tsx lines 286-297)
- [x] Numeric fields use `parseFloat` with comma-to-dot conversion (order-edit-form.tsx line 129)
- [x] All changes trigger `onChange` callback to parent for auto-save
- **PASS**

#### AC-3: Fields with low confidence score are visually marked (yellow background)
- [x] Overall confidence check: `isLowConfidence = confidence < 0.8` (order-edit-form.tsx line 66)
- [x] Low-confidence banner: Yellow-styled Alert with AlertTriangle icon showing confidence percentage (order-edit-form.tsx lines 140-149)
- [x] Banner text: "Niedrige Extraktionskonfidenz (XX%)" + "Die KI war sich bei der Extraktion unsicher. Bitte pruefen Sie alle Felder sorgfaeltig."
- [x] Banner uses distinct yellow color scheme for light/dark modes (border-yellow-500/50, bg-yellow-50, etc.)
- [ ] NOTE: Confidence is checked at the overall level only, not per-field. This matches the tech design: "No per-field scores (AI doesn't produce them yet)."
- [x] Empty description fields in line items get yellow border: `!item.description && "border-yellow-500/50"` (order-edit-form.tsx line 357)
- **PASS** (per tech design scope; per-field highlights deferred)

#### AC-4: Line items can be added, edited, and deleted
- [x] Add: "Position hinzufuegen" button calls `addLineItem()` (order-edit-form.tsx lines 190-198)
- [x] Add: New line items get next position number via `Math.max(...)` + 1 (order-edit-form.tsx lines 91-97)
- [x] Edit: All line item fields are directly editable Input components (order-edit-form.tsx lines 330-437)
- [x] Delete: Trash2 icon button per row calls `removeLineItem()` (order-edit-form.tsx lines 320-328)
- [x] Delete: Positions are re-numbered after removal (order-edit-form.tsx lines 100-110)
- [x] Empty state: When no line items exist, shows "Keine Bestellpositionen vorhanden" with add button (order-edit-form.tsx lines 201-214)
- **PASS**

#### AC-5: Changes are automatically saved (no data loss on browser refresh)
- [x] `useAutoSave` hook implements 2-second debounce (DEBOUNCE_MS = 2000 in use-auto-save.ts line 7)
- [x] Every `handleDataChange` call in review-page-content.tsx calls `scheduleSave(newData)` (line 129)
- [x] Auto-save sends `PATCH /api/orders/[orderId]/review` with `reviewedData` and `updatedAt` (use-auto-save.ts lines 60-66)
- [x] On success, `updatedAt` is updated from server response for next save (use-auto-save.ts lines 84-86)
- [x] `AutoSaveIndicator` shows status: "Speichern..." (blue spinner), "Gespeichert" (green checkmark), "Fehler" (red icon) (auto-save-indicator.tsx lines 18-53)
- [x] Status resets to "idle" after 3 seconds of "saved" (use-auto-save.ts lines 90-92)
- [x] Error state shows error message in tooltip (auto-save-indicator.tsx line 61)
- [x] Concurrency guard: `isSavingRef` prevents overlapping saves (use-auto-save.ts line 54)
- [x] `flush()` method saves immediately when navigating away (use-auto-save.ts lines 125-134)
- [x] Before approve, `flush(reviewData)` is called to ensure all pending changes are saved (review-page-content.tsx line 149)
- **PASS**

#### AC-6: "Bestellung freigeben" button sets status to "Freigegeben" and activates ERP export (OPH-6)
- [x] "Freigeben" button with CheckCircle icon in header (review-page-header.tsx lines 99-111)
- [x] Button disabled when `!canApprove || isApproving || isReExtracting || autoSaveStatus === "saving"` (review-page-header.tsx line 102)
- [x] `canApprove` validates at least 1 line item with description + quantity > 0 (review-page-content.tsx lines 135-139)
- [x] `handleApprove` flushes pending auto-save, then calls `POST /api/orders/[orderId]/approve` (review-page-content.tsx lines 142-176)
- [x] Approve API validates order is in "extracted" or "review" status (approve/route.ts lines 127-136)
- [x] Approve API validates reviewed_data has valid line items server-side (approve/route.ts lines 148-163)
- [x] Approve API sets `status: "review"`, `reviewed_at`, `reviewed_by` (approve/route.ts lines 166-178)
- [x] Approve API creates audit log entry for the status change (approve/route.ts lines 188-196)
- [x] On success, user is redirected to order detail page (review-page-content.tsx line 171)
- [ ] BUG: Approve sets status to "review" not "exported"/"approved". The AC says "Freigegeben" (released/approved). The spec says OPH-6 ERP export is a separate feature. However, the comment in the approve route says `status -> "review"` which is the same as "In Pruefung", not "Freigegeben". There is a semantic ambiguity: "review" status is used for both "being reviewed" and "review complete/approved". This needs clarification for OPH-6. (see BUG-1)
- **PARTIAL PASS** (functional; status naming ambiguity needs resolution before OPH-6)

#### AC-7: "Erneut extrahieren" button restarts AI extraction (manual changes discarded after confirmation)
- [x] "Erneut extrahieren" button with RefreshCw icon in header (review-page-header.tsx lines 85-98)
- [x] Button opens confirmation dialog first (review-page-content.tsx lines 347-375)
- [x] Dialog warns: "Alle manuellen Aenderungen werden verworfen und die KI-Extraktion wird neu gestartet. Diese Aktion kann nicht rueckgaengig gemacht werden."
- [x] "Abbrechen" and "Ja, erneut extrahieren" (destructive variant) buttons
- [x] On confirm, calls `POST /api/orders/[orderId]/extract` (review-page-content.tsx line 186)
- [x] On success, user is redirected to order detail page to see extraction progress (review-page-content.tsx line 197)
- [ ] BUG: The re-extract does NOT clear `reviewed_data`. When extraction completes, the review page will load `reviewed_data` (old manual edits) preferentially over the new `extracted_data` because of `orderData.reviewed_data ?? orderData.extracted_data` logic (review-page-content.tsx line 88). The user expects their old edits to be discarded but they will persist. (see BUG-2)
- **FAIL** (manual changes not actually discarded; BUG-2)

#### AC-8: All changes are logged with timestamp and user (audit trail)
- [x] `order_edits` table created with correct schema: id, order_id, tenant_id, user_id, field_path, old_value (JSONB), new_value (JSONB), changed_at (migration 005 lines 21-30)
- [x] Indexes on order_id, tenant_id, and changed_at DESC (migration 005 lines 33-35)
- [x] RLS enabled: tenant users can read/insert edits for own tenant; platform admins can read/insert all (migration 005 lines 41-87)
- [x] No UPDATE or DELETE policies: audit records are immutable (migration 005 line 89)
- [x] `PATCH /api/orders/[orderId]/review` builds audit entries via `buildAuditEntries()` comparing old and new reviewed_data (review/route.ts lines 134-142)
- [x] First save: logs entire reviewed_data as single "reviewed_data" entry (review/route.ts lines 203-213)
- [x] Subsequent saves: compares 8 top-level fields (order_number, order_date, total_amount, currency, notes, line_items, delivery_address, billing_address) and logs changes per field (review/route.ts lines 230-257)
- [x] Approval action also logged as status change (approve/route.ts lines 188-196)
- [x] Audit insert is non-blocking: failure logged but does not fail the save (review/route.ts lines 165-172)
- [ ] NOTE: Audit tracks top-level field changes, not per-cell line item changes (e.g., changing quantity in line item 3 logs the entire `order.line_items` array). This is documented as MVP simplification.
- **PASS** (per MVP scope; granular per-field tracking can be enhanced later)

#### AC-9: Validation: mandatory fields (min 1 line item with description and quantity) must be filled before approval
- [x] Client-side: `canApprove` checks `reviewData.order.line_items.some(item => item.description.trim().length > 0 && item.quantity > 0)` (review-page-content.tsx lines 135-139)
- [x] Client-side: "Freigeben" button disabled when `!canApprove` (review-page-header.tsx line 102)
- [x] Server-side: Approve API validates `hasValidLineItem` with same logic (approve/route.ts lines 148-153)
- [x] Server-side: Returns 400 with "Mindestens eine Bestellposition mit Beschreibung und Menge ist erforderlich." if validation fails (approve/route.ts lines 155-162)
- [x] Server-side: Also validates that reviewed_data or extracted_data exists (approve/route.ts lines 141-146)
- **PASS**

#### AC-10: User sees the dealer (recognized or manually selected) and can correct it in this view
- [x] `DealerSection` component rendered in review page (review-page-content.tsx lines 319-327)
- [x] Shows `DealerBadge` with name and confidence
- [x] "Korrigieren" button opens `DealerOverrideDialog`
- [x] Override result updates local state via `handleDealerChanged` (review-page-content.tsx lines 104-122)
- **PASS**

---

### Edge Cases Status

#### EC-1: Two employees editing the same order simultaneously (optimistic locking)
- [x] `PATCH /api/orders/[orderId]/review` uses `updatedAt` comparison (review/route.ts lines 116-124)
- [x] Returns 409 with "Diese Bestellung wurde in der Zwischenzeit von einem anderen Benutzer geaendert" if timestamps differ
- [x] `useAutoSave` hook detects 409 and calls `onConflict` callback (use-auto-save.ts lines 71-74)
- [x] `onConflict` sets error message in review-page-content.tsx (line 64)
- [x] `POST /api/orders/[orderId]/approve` also uses optimistic locking (approve/route.ts lines 115-124)
- [ ] NOTE: Spec says "zweiter Bearbeiter erhaelt Warnung 'Diese Bestellung wird bereits von [Name] bearbeitet'" -- actual behavior shows a generic conflict message without the other user's name. This is functionally acceptable but differs from the spec wording.
- **PARTIAL PASS** (locking works; no name shown for the concurrent editor)

#### EC-2: User closes browser without saving (auto-save after every change)
- [x] Auto-save debounce is 2 seconds, ensuring most changes are saved before browser close
- [x] `scheduleSave` is called on every `handleDataChange` (review-page-content.tsx line 129)
- [ ] NOTE: If user closes browser within 2 seconds of last change, that change is lost. `beforeunload` event is NOT implemented to flush pending saves. (see BUG-3)
- **PARTIAL PASS** (auto-save works; very last change within 2s window may be lost)

#### EC-3: Approved order needs to be changed later (status reset to "In Korrektur")
- [x] The review page allows editing orders in "review" status (status is included in `validStatuses` for approve: approve/route.ts line 127)
- [x] Auto-save works for orders in all statuses except "exported" (review/route.ts lines 127-131, review-page-content.tsx line 66)
- [ ] BUG: Spec says "Status wird auf 'In Korrektur' zurueckgesetzt". There is no "In Korrektur" status in the `OrderStatus` type. When a user re-edits an approved order, the auto-save sets status to "review" only if the current status is "extracted" (review/route.ts line 150). If the order is already "review" (approved), re-editing does NOT change the status. There is no way to distinguish between "approved" and "being edited" since both use "review" status. (see BUG-4)
- **PARTIAL PASS** (re-editing works; no distinct "In Korrektur" status)

#### EC-4: Original document no longer available (deleted)
- [x] `DocumentPreviewPanel` handles error state: shows Alert + retry button (document-preview-panel.tsx lines 65-81)
- [x] Preview URL endpoint skips files where signed URL creation fails (preview-url/route.ts lines 129-136)
- [x] Empty files state: "Keine Dateien fuer die Vorschau verfuegbar" (document-preview-panel.tsx lines 84-99)
- [x] Order edit form is independent of document preview -- data editing works even if preview fails
- **PASS**

#### EC-5: All line item fields are null (extraction completely failed)
- [x] Empty line items state shows "Keine Bestellpositionen vorhanden" with "Erste Position hinzufuegen" button (order-edit-form.tsx lines 201-214)
- [x] User can add line items manually from scratch
- [x] All fields accept manual input
- [x] Review page shows "Keine Extraktionsdaten" if no extracted_data AND no reviewed_data (review-page-content.tsx lines 276-300)
- **PASS**

---

### Security Audit Results

#### Authentication
- [x] `PATCH /api/orders/[orderId]/review`: calls `supabase.auth.getUser()`, returns 401 if unauthenticated (review/route.ts lines 25-36)
- [x] `POST /api/orders/[orderId]/approve`: calls `supabase.auth.getUser()`, returns 401 if unauthenticated (approve/route.ts lines 25-36)
- [x] `GET /api/orders/[orderId]/preview-url`: calls `supabase.auth.getUser()`, returns 401 if unauthenticated (preview-url/route.ts lines 25-37)
- [x] All three endpoints check `user_status === "inactive"` and `tenant_status === "inactive"`, returning 403
- [x] All three endpoints verify `tenant_id` exists in metadata (403 if missing)
- [x] Review page under `(protected)` layout -- middleware blocks unauthenticated users
- **PASS**

#### Authorization (Tenant Isolation)
- [x] `PATCH /api/orders/[orderId]/review`: scopes order fetch by `tenant_id` from JWT (review/route.ts lines 102-104)
- [x] `POST /api/orders/[orderId]/approve`: scopes order fetch by `tenant_id` from JWT (approve/route.ts lines 102-104)
- [x] `GET /api/orders/[orderId]/preview-url`: scopes order fetch by `tenant_id` from JWT (preview-url/route.ts lines 82-84)
- [x] Platform admins can access all orders (isPlatformAdmin bypass)
- [x] `tenant_id` from JWT `app_metadata` -- cannot be client-spoofed
- [x] Audit entries include `tenant_id` for RLS isolation
- [x] `order_edits` RLS: tenant users see/insert only own tenant's edits; platform admins see/insert all
- [x] `order_edits` has no UPDATE or DELETE policies -- immutable audit trail
- **PASS**

#### Input Validation (Server-Side -- Zod)
- [x] `reviewSaveSchema` validates full `reviewedData` structure including nested `order`, `line_items`, `extraction_metadata` (validations.ts lines 158-174)
- [x] `canonicalLineItemSchema` validates position (int >= 1), description (min 1), quantity (>= 0) (validations.ts lines 130-139)
- [x] `canonicalAddressSchema` validates all 5 address fields as nullable strings (validations.ts lines 121-127)
- [x] `reviewApproveSchema` validates `updatedAt` as optional string (validations.ts lines 177-180)
- [x] `orderId` validated as UUID via regex (review/route.ts line 66, approve/route.ts line 66, preview-url/route.ts line 68)
- [x] JSON parse errors caught with 400 (review/route.ts line 77, approve/route.ts line 77)
- [ ] BUG: `reviewSaveSchema` requires `description: z.string().min(1)` on line items (validations.ts line 133), but the edit form allows empty description fields (it just shows yellow border). If a user clears the description and the auto-save fires, the Zod validation will reject the save with an error. This creates a scenario where the user's edits cannot be auto-saved while they are typing. (see BUG-5)
- **PARTIAL PASS** (Zod schema too strict for intermediate auto-save states)

#### XSS
- [x] All user input rendered via JSX auto-escaping
- [x] No `dangerouslySetInnerHTML` in any review component
- [x] PDF iframe uses `src={activeFile.signedUrl}` from server -- no user-controlled URL injection
- **PASS**

#### IDOR (Insecure Direct Object Reference)
- [x] Order ID validated as UUID
- [x] Order fetch scoped by tenant_id from JWT
- [x] User cannot access other tenants' orders via URL manipulation
- [x] Signed URLs generated server-side with tenant verification before URL creation
- **PASS**

#### Rate Limiting
- [ ] BUG: No rate limiting on `PATCH /api/orders/[orderId]/review`, `POST /api/orders/[orderId]/approve`, or `GET /api/orders/[orderId]/preview-url`. The auto-save fires every 2 seconds during active editing. A malicious client could bypass the debounce and flood the review endpoint. All endpoints require authentication, which limits risk. (see BUG-6)
- **PARTIAL PASS** (low risk; all require auth)

#### SQL Injection
- [x] All queries use Supabase client with parameterized inputs
- [x] No raw SQL queries
- **PASS**

#### Exposed Secrets
- [x] No hardcoded secrets in OPH-5 code
- [x] `adminClient` used only server-side
- [x] Signed URLs are time-limited (1 hour)
- **PASS**

#### Signed URL Security
- [x] Preview URLs expire after 1 hour (preview-url/route.ts line 10)
- [x] URLs generated via `adminClient.storage.createSignedUrl` -- server-side only
- [x] Order ownership verified before generating signed URLs
- [ ] NOTE: Signed URLs, once generated, can be shared. The 1-hour expiry mitigates this risk.
- **PASS**

#### Exported Order Protection
- [x] Review API rejects edits to exported orders: returns 400 with "Exportierte Bestellungen koennen nicht mehr bearbeitet werden" (review/route.ts lines 127-131)
- [x] Auto-save disabled when `order.status === "exported"` (review-page-content.tsx line 66)
- [x] Approve API only accepts "extracted" or "review" status orders (approve/route.ts lines 127-136)
- **PASS**

---

### Cross-Browser Testing (Code Review)

#### Chrome (Desktop 1440px)
- [x] All shadcn/ui components, iframe PDF embed, fetch API -- all supported
- [x] `grid-cols-2` layout renders correctly
- **Expected: PASS**

#### Firefox (Desktop 1440px)
- [x] All Radix UI primitives and Collapsible work
- [x] PDF iframe embed supported
- [x] Date input type supported
- **Expected: PASS**

#### Safari (Desktop 1440px)
- [x] PDF iframe embed supported
- [x] Date input type supported (Safari style differs but functional)
- [x] Collapsible animations supported
- [ ] NOTE: Safari may have different PDF viewer behavior within iframes (e.g., no zoom controls). The "In neuem Tab" fallback mitigates this.
- **Expected: PASS**

---

### Responsive Testing (Code Review)

#### Mobile (375px)
- [x] Two-column layout stacks to single column: `grid-cols-1 lg:grid-cols-2` (review-page-content.tsx line 338)
- [x] Header stacks vertically: `flex-col sm:flex-row` (review-page-header.tsx line 75)
- [x] Action buttons wrap: `flex-wrap` (review-page-header.tsx line 84)
- [x] Line item fields use `grid-cols-2 sm:grid-cols-4` and `grid-cols-2 sm:grid-cols-5` (order-edit-form.tsx lines 331, 363)
- [x] Address fields use `grid-cols-1 sm:grid-cols-2` (order-edit-form.tsx line 486)
- [x] Dialog responsive: `sm:max-w-md` (review-page-content.tsx line 348)
- [x] Dialog footer stacks: `flex-col sm:flex-row` (review-page-content.tsx line 356)
- [x] File tabs truncate names: `truncate max-w-[100px]` (document-preview-panel.tsx line 142)
- [x] PDF iframe has minimum height: `min-h-[400px]` (document-preview-panel.tsx line 153)
- [x] Mobile hamburger menu available via Sheet component (top-navigation.tsx)
- **Expected: PASS**

#### Tablet (768px)
- [x] Line item fields expand to 4/5 columns at `sm:` breakpoint
- [x] Header and action buttons on same row at `sm:` breakpoint
- [x] Address collapsible uses 2 columns at `sm:` breakpoint
- **Expected: PASS**

#### Desktop (1440px)
- [x] Two-column layout: document preview left, edit form right
- [x] PDF iframe height: `lg:h-[calc(100vh-280px)]` for maximum use of screen space
- [x] All fields visible without scrolling within card
- **Expected: PASS**

---

### Regression Testing

#### OPH-1: Multi-Tenant Auth (Status: Deployed)
- [x] Navigation: unchanged, mobile menu works
- [x] Login, password reset, team management: unchanged
- [x] Middleware: unchanged
- [x] RLS on OPH-1 tables: unchanged
- [x] Security headers: unchanged
- **PASS**

#### OPH-2: Order Upload (Status: Deployed)
- [x] Upload flow: unchanged
- [x] Upload presign and confirm routes: unchanged
- [x] File dropzone and upload UI: unchanged
- **PASS**

#### OPH-3: Dealer Recognition (Status: Deployed)
- [x] Dealer recognition at upload: unchanged
- [x] `DealerSection` and `DealerOverrideDialog` reused in review page without modification
- [x] `GET /api/dealers` and `PATCH /api/orders/[orderId]/dealer`: unchanged
- **PASS**

#### OPH-4: AI Extraction (Status: Deployed)
- [x] `GET /api/orders/[orderId]` extended with `reviewed_data`, `reviewed_at`, `reviewed_by` -- non-breaking (existing `OrderWithDealer` consumers receive additional fields they can ignore)
- [x] `ExtractionResultPreview` extended with "Zur Pruefung" link to `/orders/[orderId]/review` -- non-breaking addition
- [x] `OrderDetailContent` receives `OrderForReview` cast from API but displays as `OrderWithDealer` -- compatible
- [x] Extract route: unchanged
- [x] EML parser, Claude extraction: unchanged
- [x] `types.ts` extended with OPH-5 types -- no changes to existing types
- [x] `validations.ts` extended with OPH-5 schemas -- no changes to existing schemas
- **PASS**

---

### Bugs Found

#### BUG-1: Approve status "review" is semantically ambiguous
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Navigate to an order with status "extracted"
  2. Open the review page and start editing
  3. Auto-save fires: status changes to "review" (meaning "in review/editing")
  4. Click "Freigeben" (approve)
  5. Approve API also sets status to "review"
  6. Expected: After approval, status should be distinct from "editing" (e.g., "approved" or "released")
  7. Actual: Both "editing" and "approved" map to the same "review" status. The `reviewed_at` and `reviewed_by` fields distinguish them, but the status itself does not. OPH-6 (ERP Export) will need to differentiate between "still editing" and "approved for export" -- currently impossible via status alone.
- **Files:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/approve/route.ts` (line 170), `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/review/route.ts` (line 150), `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/types.ts` (line 69)
- **Recommended fix:** Add an "approved" status to `OrderStatus` type and update the approve endpoint to use it. Or use a separate boolean `is_approved` column. This is required before OPH-6 can be implemented.
- **Priority:** Fix before OPH-6

#### BUG-2: Re-extract does not clear reviewed_data (manual changes persist)
- **Severity:** High
- **Steps to Reproduce:**
  1. Upload a file, wait for extraction to complete
  2. Go to review page, make manual edits (these are auto-saved to `reviewed_data`)
  3. Click "Erneut extrahieren" and confirm
  4. Wait for new extraction to complete
  5. Go back to review page
  6. Expected: Review form shows fresh extraction data (manual changes discarded)
  7. Actual: Review form shows OLD reviewed_data because `const initialData = orderData.reviewed_data ?? orderData.extracted_data` (review-page-content.tsx line 88) picks `reviewed_data` first. The extract route does NOT clear `reviewed_data` (extract/route.ts lines 261-268 only updates `extracted_data` and `extraction_status`).
- **Files:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/extract/route.ts` (lines 261-268), `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/orders/review/review-page-content.tsx` (line 88)
- **Recommended fix:** In the extract route, when setting `extraction_status: "processing"`, also set `reviewed_data: null` to clear previous manual edits. Alternatively, clear it when extraction succeeds at lines 261-268.
- **Priority:** Fix before deployment

#### BUG-3: No beforeunload handler to flush pending auto-save
- **Severity:** Low
- **Steps to Reproduce:**
  1. Make a change to any field in the review form
  2. Immediately close the browser tab (within 2 seconds)
  3. Expected: Change is saved (debounce flushed on unload)
  4. Actual: Change is lost because the 2-second debounce timer has not fired yet
- **Files:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/orders/review/review-page-content.tsx`, `/Users/michaelmollath/projects/ai-coding-starter-kit/src/hooks/use-auto-save.ts`
- **Recommended fix:** Add `useEffect` with `beforeunload` event listener that calls `flush()` with current data from ref.
- **Priority:** Fix in next sprint

#### BUG-4: No distinct "In Korrektur" status for re-editing approved orders
- **Severity:** Low
- **Steps to Reproduce:**
  1. Approve an order (status becomes "review")
  2. Navigate back to the review page and start editing again
  3. Auto-save fires, but status remains "review"
  4. Expected per spec: Status should reset to "In Korrektur" (distinct from approved)
  5. Actual: No status change occurs. There is no "In Korrektur" status.
- **Files:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/types.ts` (line 69), `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/review/route.ts` (line 150)
- **Note:** This is related to BUG-1 but distinct. BUG-1 is about approve vs. editing. BUG-4 is about re-editing after approval.
- **Priority:** Nice to have (combine with BUG-1 fix)

#### BUG-5: Zod schema rejects empty description during auto-save
- **Severity:** Medium
- **Steps to Reproduce:**
  1. On the review page, clear the description field of a line item (select all + delete)
  2. Auto-save triggers after 2 seconds
  3. Expected: Auto-save succeeds (empty description is an intermediate editing state)
  4. Actual: `canonicalLineItemSchema` requires `description: z.string().min(1)` (validations.ts line 133). The server returns a 400 validation error. The auto-save indicator shows "Fehler". The user's data is NOT saved even though they are still typing.
  5. Similarly, clearing the quantity to empty would result in `parseNum("")` returning `null`, but the schema requires `z.number()`.
- **Files:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/lib/validations.ts` (line 133-134)
- **Recommended fix:** Either (a) relax the Zod schema for review saves to allow empty descriptions and zero quantities, moving the strict validation to the approve endpoint only, or (b) add client-side validation that prevents auto-save when data is in an invalid intermediate state.
- **Priority:** Fix before deployment

#### BUG-6: No rate limiting on OPH-5 API endpoints
- **Severity:** Low
- **Steps to Reproduce:**
  1. A malicious client could call `PATCH /api/orders/[orderId]/review` rapidly without debounce
  2. Expected: Rate limiting prevents abuse
  3. Actual: No rate limiting. Authentication is required, limiting the attack surface.
- **Files:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/review/route.ts`, `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/approve/route.ts`, `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/preview-url/route.ts`
- **Priority:** Nice to have

#### BUG-7: Review PATCH uses adminClient bypassing RLS
- **Severity:** Low
- **Steps to Reproduce:**
  1. Review the `PATCH /api/orders/[orderId]/review` endpoint
  2. It uses `adminClient` (service role) for all database operations (review/route.ts line 94)
  3. Expected: Regular Supabase client with RLS for defense-in-depth
  4. Actual: RLS is bypassed. The tenant scoping is done application-side via `.eq("tenant_id", tenantId)`. This is functionally correct but loses the defense-in-depth benefit of RLS.
- **Note:** Same pattern is used in approve and preview-url routes. This is consistent with existing API routes (OPH-2, OPH-3, OPH-4) which all use adminClient.
- **Files:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/review/route.ts` (line 94)
- **Priority:** Nice to have

#### BUG-8: Approve API does not record reviewer name in response
- **Severity:** Low
- **Steps to Reproduce:**
  1. Approve an order via `POST /api/orders/[orderId]/approve`
  2. Response includes `reviewedBy` (user ID) but not the reviewer's name
  3. Expected: Response includes reviewer name for immediate UI display
  4. Actual: `ReviewApproveResponse` only has `reviewedBy: string` (user ID). The client navigates away to the detail page after approval, so the reviewer name is fetched on the next page load. No immediate UX impact.
- **Files:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/app/api/orders/[orderId]/approve/route.ts` (lines 198-206)
- **Priority:** Nice to have

#### BUG-9: DealerSection in review page uses stale updatedAt after override
- **Severity:** Low
- **Steps to Reproduce:**
  1. On the review page, click "Korrigieren" to override the dealer
  2. The dealer override PATCH updates the order's `updated_at`
  3. `handleDealerChanged` sets `updatedAt` to `result.overriddenAt` (review-page-content.tsx line 119)
  4. Expected: `updatedAt` should be the new `order.updated_at` from the server
  5. Actual: `overriddenAt` is the timestamp of the override action, which is NOT the same as `order.updated_at`. The next auto-save will use the wrong `updatedAt`, potentially causing a spurious 409 conflict.
- **Files:** `/Users/michaelmollath/projects/ai-coding-starter-kit/src/components/orders/review/review-page-content.tsx` (line 119)
- **Recommended fix:** The dealer override response should include the order's `updated_at`, or the review page should re-fetch the order after a dealer override.
- **Priority:** Fix in next sprint

---

### Summary

- **Build Status:** PASS (27 routes compiled, no errors)
- **Acceptance Criteria:** 8/10 passed, 1 partial pass (AC-6: status ambiguity), 1 fail (AC-7: re-extract does not discard changes)
- **Edge Cases:** 3/5 passed, 2 partial pass (EC-1: no user name in conflict; EC-2: last 2s of edits may be lost)
- **Total Bugs Found:** 9
  - **Critical (0):** None
  - **High (1):** BUG-2 (re-extract does not clear reviewed_data)
  - **Medium (2):** BUG-1 (status ambiguity), BUG-5 (Zod rejects intermediate auto-save)
  - **Low (6):** BUG-3 (no beforeunload flush), BUG-4 (no "In Korrektur" status), BUG-6 (no rate limiting), BUG-7 (adminClient bypasses RLS), BUG-8 (no reviewer name in response), BUG-9 (stale updatedAt after dealer override)
- **Security Audit:** PASS
  - Authentication: PASS
  - Authorization / Tenant Isolation: PASS
  - Input Validation (Zod): PARTIAL PASS (too strict for auto-save; BUG-5)
  - XSS: PASS
  - IDOR: PASS
  - SQL Injection: PASS
  - Exported Order Protection: PASS
  - Signed URL Security: PASS
  - Rate Limiting: PARTIAL PASS (low risk)
  - Secrets: PASS
- **Regression:** PASS -- No regression on OPH-1, OPH-2, OPH-3, or OPH-4
- **Production Ready:** **NO**
  - **Must fix before deployment:**
    1. **BUG-2 (High):** Re-extract must clear `reviewed_data` so manual changes are actually discarded
    2. **BUG-5 (Medium):** Zod schema must allow intermediate states during auto-save (empty descriptions)
  - **Should fix before OPH-6:**
    3. **BUG-1 (Medium):** Add distinct "approved" status to differentiate from "in review"
  - **Fix in next sprint:**
    4. BUG-9 (stale updatedAt after dealer override)
    5. BUG-3 (beforeunload flush)
  - **Backlog:** BUG-4, BUG-6, BUG-7, BUG-8

## Deployment
_To be added by /deploy_
