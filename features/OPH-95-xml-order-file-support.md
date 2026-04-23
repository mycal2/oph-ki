# OPH-95: XML Order File Support (Ingestion, Extraction & Table Preview)

## Status: In Progress
**Created:** 2026-04-23
**Last Updated:** 2026-04-23

## Dependencies
- Requires: OPH-2 (Bestellungs-Upload) — extends accepted file types
- Requires: OPH-4 (KI-Datenextraktion) — extends extraction pipeline
- Requires: OPH-10 (E-Mail-Weiterleitungs-Ingestion) — extends email attachment handling

## Background

Dealers increasingly send orders as XML files attached to emails, following the PEPPOL UBL Order format (urn:oasis:names:specification:ubl:schema:xsd:Order-2). The example file is a standard European e-procurement XML with structured order lines. Each line item contains a buyer item ID (dealer article number), a seller item ID (manufacturer article number), product name, quantity, unit price, and line total. Header fields include order number, issue date, buyer company, and delivery address.

## User Stories

- As a tenant user, I want to upload `.xml` order files via the web UI so that I can process XML-based orders alongside PDF and Excel files.
- As a tenant user, I want inbound emails with `.xml` attachments to be automatically ingested so that XML orders received by email are processed without manual intervention.
- As a tenant user, I want the AI extraction to correctly identify line items, article numbers, and order metadata from XML files so that I don't have to manually re-enter the data.
- As a tenant user reviewing an order, I want to see the XML order displayed as a structured table so that I can read and verify the order contents without understanding XML syntax.
- As a tenant user, I want the XML table to show the same fields I recognize from other order formats (article number, description, quantity, price) so that my review workflow is consistent.

## Acceptance Criteria

### Upload & Ingestion
- [ ] `.xml` files are accepted in the web upload dropzone (alongside `.eml`, `.pdf`, `.xlsx`, `.xls`, `.csv`)
- [ ] `.xml` attachments in inbound emails are recognized and stored as order files
- [ ] The upload UI shows `.xml` in the accepted file types label
- [ ] XML files up to 25 MB are accepted (same limit as other file types)

### Extraction
- [ ] The extraction pipeline processes XML files and populates the canonical order fields:
  - `order_number` from the XML `<ID>` element
  - `order_date` from `<IssueDate>`
  - `sender.company_name` from `BuyerCustomerParty/PartyLegalEntity/RegistrationName`
  - Per line item: `article_number` (SellersItemIdentification), `dealer_article_number` (BuyersItemIdentification), `description` (Item/Name), `quantity`, `unit_price` (Price/PriceAmount), `total_price` (LineExtensionAmount)
- [ ] Extraction result is accurate without requiring dealer-specific hints for standard PEPPOL UBL XML
- [ ] Delivery address fields are extracted from `ns3:Delivery/ns3:DeliveryLocation/ns3:Address` where present

### XML Table Preview
- [ ] In the Dokument-Vorschau panel on the order review page, XML files are shown as a formatted table (not raw XML markup)
- [ ] The table has columns: Pos., Artikel-Nr (Hersteller), Händler-Art.-Nr, Beschreibung, Menge, Einzelpreis, Gesamtpreis
- [ ] An order header section above the table shows: Bestellnummer, Bestelldatum, Käufer
- [ ] The preview gracefully handles XML files that are not PEPPOL UBL (shows a fallback message: "XML-Format wird nicht als Tabellenvorschau unterstützt")

## Edge Cases

- **Non-PEPPOL XML**: An XML file with a different schema (e.g., custom dealer XML) — fallback to AI extraction from the raw XML text; preview shows unsupported format message
- **Malformed XML**: Invalid XML syntax — extraction fails gracefully with an error message; the file is still stored and downloadable
- **XML with encoding issues**: The example contains encoding artifacts (e.g., `GesÃ¤llgatan` instead of `Gesällgatan`) — extraction uses raw text as-is; no silent correction
- **Multiple XML attachments**: If an email contains multiple `.xml` files — each is stored as a separate order file and displayed as separate tabs in the preview
- **Large XML**: XML with hundreds of line items (e.g., 200+ rows) — table renders with scrolling, no truncation of line items
- **XML without delivery address**: `ns3:Delivery` element absent — delivery address fields remain empty, extraction does not fail

## Technical Requirements
- Security: XML parsing must not be vulnerable to XXE (XML External Entity) attacks — external entity resolution must be disabled
- The XML MIME type `application/xml` and `text/xml` must be accepted in addition to the `.xml` extension check

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview

This feature touches four thin layers of the existing pipeline. No new API routes are needed — we extend what's already there. The pattern mirrors how Excel preview (OPH-71) was added: a new sub-component in the preview panel, plus a small MIME type allowlist expansion in two places.

---

### A) Component Structure

```
Document Preview Panel (existing — document-preview-panel.tsx)
+-- File tab bar (existing — shows each order file as a clickable tab)
+-- PdfFilePreview (existing)
+-- SpreadsheetFilePreview (existing — Excel/CSV as table)
+-- TextFilePreview (existing — email body text)
+-- XmlFilePreview (NEW)
|   +-- Order header card
|   |   +-- Bestellnummer, Bestelldatum, Käufer (from XML header fields)
|   +-- Line items table (scrollable)
|   |   +-- Columns: Pos. | Artikel-Nr (Hersteller) | Händler-Art.-Nr | Beschreibung | Menge | Einzelpreis | Gesamtpreis
|   +-- Unsupported format fallback
|       +-- "XML-Format wird nicht als Tabellenvorschau unterstützt"
|       +-- Download button (fallback for non-PEPPOL XML)
+-- Generic download fallback (existing — for all other file types)

File Dropzone (existing — file-dropzone.tsx)
+-- ACCEPTED types string: ".eml,.pdf,.xlsx,.xls,.csv" → add ".xml"  (1-line change)
```

---

### B) Data Model

No database changes. XML files use the exact same storage pattern as every other file type:

```
order_files table (unchanged):
- id
- order_id
- original_filename  (e.g. "purchaseorder_6b9fb7e3.xml")
- storage_path       (e.g. "tenant-id/order-id/purchaseorder_6b9fb7e3.xml")
- mime_type          (e.g. "application/xml" or "text/xml")
- file_size_bytes
- sha256_hash

No new columns or tables needed.
```

---

### C) Tech Decisions

**1. XML preview: browser-native DOMParser (no npm package)**

The `XmlFilePreview` component follows the same pattern as `SpreadsheetFilePreview`:
- Fetch the signed URL → get the XML text
- Parse it in the browser using the built-in `DOMParser` API (available in all modern browsers)
- Walk the PEPPOL UBL namespace structure to extract order header + line items
- Render as a styled table

Why DOMParser, not a library? The browser already includes a robust, spec-compliant XML parser. No bundle size cost. The PEPPOL UBL structure is well-defined, so walking it with `querySelector` / `getElementsByTagNameNS` is straightforward. Non-PEPPOL XML (unrecognized schema) shows the fallback message.

**2. XML extraction: deterministic parsing for PEPPOL, AI fallback for everything else**

When the extraction pipeline encounters an XML file, it checks whether the file is PEPPOL UBL (`CustomizationID` contains `peppol.eu`). If yes, it parses the XML directly on the server to produce the canonical order JSON — no AI required. This gives 100% reliable field mapping for the known format.

For any other XML schema, the raw XML text is passed to Claude as-is, the same way Excel cell data is passed as text today. Claude can usually infer structure from readable XML, and the result can be corrected on the review page.

Why deterministic for PEPPOL? The PEPPOL UBL format is a formal standard with fixed XPath locations for every field. AI adds no value here and introduces non-determinism. Deterministic parsing is faster, cheaper (no Claude API call needed for these orders), and always correct.

**3. Server-side XML parsing: `fast-xml-parser` (XXE-safe)**

Node.js has no built-in DOM parser. The `fast-xml-parser` npm package is the standard choice: it is XXE-safe by design (no external entity resolution), handles large files well, and is already widely used in the Next.js ecosystem.

Why not `xmldom` or the native `xml2js`? `fast-xml-parser` has no XXE vulnerability surface (it never fetches external resources), has excellent TypeScript types, and handles namespaced XML cleanly.

**4. MIME type allowlist: two small additions**

Two places currently hardcode the list of supported file types:
- `src/lib/postmark.ts` → `SUPPORTED_DOCUMENT_MIME_TYPES` (email ingestion filter): add `application/xml` and `text/xml`
- `src/app/api/orders/[orderId]/preview-url/route.ts` → `isInlineViewable` check: add `application/xml` and `text/xml` (so signed URLs are generated without the `download` flag, allowing inline rendering)

---

### D) Files to Modify / Create

| File | Change type | What changes |
|------|-------------|-------------|
| `src/components/orders/file-dropzone.tsx` | Modify | Add `.xml` to the `ACCEPTED` string and the label text |
| `src/lib/postmark.ts` | Modify | Add `application/xml` and `text/xml` to `SUPPORTED_DOCUMENT_MIME_TYPES` |
| `src/app/api/orders/[orderId]/preview-url/route.ts` | Modify | Add `application/xml` / `text/xml` / `.xml` extension to inline-viewable check |
| `src/components/orders/review/document-preview-panel.tsx` | Modify | Add `isXmlFile()` helper and new `XmlFilePreview` sub-component; wire into the render switch |
| `src/lib/claude-extraction.ts` | Modify | Detect PEPPOL UBL XML → deterministic parsing path; other XML → pass raw text to Claude |

---

### E) Dependencies

| Package | Purpose |
|---------|---------|
| `fast-xml-parser` | Server-side XXE-safe XML parsing for deterministic PEPPOL UBL extraction |

No additional frontend dependencies (DOMParser is built-in).

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
