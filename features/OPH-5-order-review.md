# OPH-5: Bestellprüfung & manuelle Korrektur

## Status: In Progress
**Created:** 2026-02-27
**Last Updated:** 2026-02-28

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
_To be added by /qa_

## Deployment
_To be added by /deploy_
