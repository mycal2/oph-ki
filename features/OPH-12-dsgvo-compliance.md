# OPH-12: DSGVO-Compliance & Datenaufbewahrung

## Status: In Progress
**Created:** 2026-02-27
**Last Updated:** 2026-02-27

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) — Datenschutz beginnt bei der Identität

## Kontext
Bestellungen enthalten personenbezogene Daten (Namen und Adressen von Endkunden der Händler). Als Plattform-Betreiber sind wir Auftragsverarbeiter (AV) für die Dentalhersteller (Verantwortliche). DSGVO-Konformität ist keine Option, sondern Pflicht.

## User Stories
- Als Mandant möchte ich sicherstellen, dass meine Bestelldaten nur so lange gespeichert werden, wie es für die Verarbeitung notwendig ist, damit wir unsere DSGVO-Pflichten als Verantwortliche erfüllen.
- Als Mandanten-Admin möchte ich eine Datenaufbewahrungsrichtlinie für meinen Mandanten konfigurieren (z.B. automatische Löschung nach 90 Tagen), damit alte Bestelldaten nicht unnötig gespeichert bleiben.
- Als Mitarbeiter möchte ich eine einzelne Bestellung und ihre Original-Dateien auf Anfrage löschen können (Recht auf Löschung des Händler-Endkunden), damit wir Auskunfts- und Löschanfragen nachkommen können.
- Als Platform-Admin möchte ich einen vollständigen Audit-Log aller Datenzugriffe und -änderungen einsehen können, damit wir bei Datenschutzvorfällen Rechenschaft ablegen können.
- Als Platform-Betreiber möchte ich einen Auftragsverarbeitungsvertrag (AVV) im System verfügbar haben, damit die rechtliche Grundlage für die Datenverarbeitung dokumentiert ist.

## Acceptance Criteria
- [ ] Alle Daten werden ausschließlich auf EU-Servern gespeichert (Supabase EU-Region: eu-central-1 Frankfurt)
- [ ] Konfigurierbare Datenaufbewahrungsdauer pro Mandant (Standard: 90 Tage; min: 30 Tage; max: 365 Tage)
- [ ] Automatischer Lösch-Job: läuft täglich, löscht Bestellungen (inkl. Dateien in Storage und canonical JSON) nach Ablauf der Aufbewahrungsdauer
- [ ] Manuelle Löschung einzelner Bestellungen durch Mandanten-Admin möglich (inkl. aller zugehörigen Dateien)
- [ ] Nach Löschung: keine Wiederherstellungsmöglichkeit (Hard-Delete, nicht Soft-Delete für personenbezogene Daten)
- [ ] Audit-Log: alle Datenzugriffe (Lesen, Ändern, Löschen) werden protokolliert (Benutzer, Timestamp, Aktion, Objekt-ID)
- [ ] Audit-Log ist unveränderlich (Append-only, kein DELETE auf Audit-Einträge)
- [ ] Datenschutzerklärung und AVV-Link im Benutzerbereich
- [ ] Export der eigenen Daten (Benutzer kann alle seine Bestelldaten als ZIP herunterladen — "Recht auf Datenportabilität")
- [ ] Bei Mandanten-Löschung (OPH-8): vollständige Datenlöschung innerhalb 30 Tagen

## Edge Cases
- Was passiert, wenn eine Bestellung exportiert wurde, aber die Aufbewahrungsdauer abläuft? → Automatische Löschung findet trotzdem statt; Mandant wird per E-Mail 14 Tage vorher gewarnt
- Was passiert, wenn ein Benutzer einen Audit-Log-Eintrag löschen möchte? → Technisch nicht möglich (Append-only-Tabelle ohne DELETE-RLS)
- Was passiert, wenn eine Bestellung eine aktive Verarbeitung hat (Status "In Extraktion"), wenn die Löschanfrage kommt? → Manuelles Löschen nicht möglich während aktiver Verarbeitung; nach Abschluss möglich

## Technical Requirements
- EU-Region: Supabase-Projekt in `eu-central-1` (Frankfurt)
- Automatischer Lösch-Job: Supabase Cron (pg_cron) oder separater Cron-Service
- Audit-Log: separate Tabelle `audit_log` mit RLS: Lesen nur für `platform_admin` und eigener `tenant_id`; kein DELETE für niemanden
- Storage-Löschung: Supabase Storage API zum Löschen von Bucket-Objekten
- Lösch-Quittierung: E-Mail-Bestätigung nach vollständiger Datenlöschung

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview
OPH-12 has four distinct deliverables: (1) a configurable retention policy per tenant, (2) an automated nightly deletion job, (3) manual on-demand order deletion, and (4) a data export for portability. All four are backend-heavy with light UI surfaces.

---

### A) Component Structure

**New Page: Settings > Datenschutz** (tenant-admin only)
```
DataProtectionPage (/settings/data-protection)
+-- PageHeader ("Datenschutz & Datenaufbewahrung")
+-- RetentionPolicyCard
|   +-- Description ("Bestellungen werden nach X Tagen automatisch geloescht")
|   +-- NumberInput (30-365 Tage, Standard: 90)
|   +-- SaveButton
+-- DataExportCard
|   +-- Description ("Alle Ihre Bestelldaten als JSON-Datei herunterladen")
|   +-- ExportButton -> triggers download of /api/orders/export-all
+-- LegalLinksCard
    +-- Datenschutzerklaerung (link)
    +-- Auftragsverarbeitungsvertrag / AVV (link)
```

**Order Deletion (added to existing order screens)**
```
OrderDetailHeader (existing)
+-- [NEW] DeleteOrderButton (tenant-admin only, appears when status is final)

OrdersListRow (existing)
+-- [NEW] "Loeschen" option in actions dropdown (tenant-admin only)

DeleteOrderDialog (new, shadcn AlertDialog)
+-- Warning: "Diese Aktion ist nicht rueckgaengig zu machen."
+-- Shows: file count to be deleted
+-- CancelButton
+-- ConfirmDeleteButton (destructive red)
```

---

### B) Data Model

**Existing `tenants` table — add one column:**
```
data_retention_days:
  - Type: whole number
  - Default: 90
  - Allowed range: 30 to 365
  - Meaning: orders older than this many days are automatically deleted
```

**New `data_deletion_log` table (append-only audit trail):**
```
Each deletion record contains:
- Unique ID
- Tenant ID (who owned the order)
- Order ID (the deleted order, kept for audit even after order is gone)
- Order creation date (when the order was originally received)
- File count (how many files were deleted)
- Deleted by (user ID if manual; null if automatic cron)
- Deletion type: "manual" or "automatic"
- Deleted at timestamp

Security: tenant users can read their own entries;
platform_admin sees all. Nobody can delete log entries (enforced by database rules).
```

---

### C) Tech Decisions

**Hard delete, not soft delete**
GDPR explicitly requires actual erasure of personal data. When an order is deleted, we remove: (1) the original uploaded files from Supabase Storage, (2) the extracted JSON data, (3) the order database record. The deletion log entry is the only thing that remains — it contains no personal data.

**Automated deletion via existing cron infrastructure**
The project already has two cron jobs. We add a third: `/api/cron/data-retention`. It runs nightly, reads each tenant's `data_retention_days` setting, and hard-deletes all eligible orders. Secured with the same `CRON_SECRET` bearer token pattern.

**Only "final" orders are automatically deleted**
Orders currently being processed are skipped — deleting mid-extraction would cause errors. Only orders with a final status (`approved`, `exported`, `error`) are eligible. Exported orders are deleted too, as the export file is already in the customer's hands.

**Data export as JSON, not ZIP**
A JSON file containing all order data fully satisfies the GDPR right to data portability. No third-party library needed.

**Retention setting stored on the tenant record**
Each tenant independently configures their own retention period. Platform admins can also view/override it via the admin tenant form.

---

### D) New Files / APIs

| What | Where |
|---|---|
| DB migration | `supabase/migrations/011_oph12_dsgvo.sql` |
| Retention settings API | `GET/PATCH /api/settings/data-retention` |
| Order hard-delete API | `DELETE /api/orders/[orderId]` |
| Data export API | `GET /api/orders/export-all` |
| Nightly cron job | `GET /api/cron/data-retention` |
| Settings page | `src/app/(protected)/settings/data-protection/page.tsx` |
| Delete confirmation dialog | `src/components/orders/delete-order-dialog.tsx` |
| Types | `DeletionType`, `DataDeletionLogEntry` in `src/lib/types.ts` |

---

### E) Dependencies
No new packages needed — everything uses existing Supabase, Next.js, and shadcn/ui primitives.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
