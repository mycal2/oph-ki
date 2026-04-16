# OPH-69: Image Extraction from Inbound Emails

## Status: In Progress
**Created:** 2026-04-16
**Last Updated:** 2026-04-16

## Dependencies
- Requires: OPH-10 (E-Mail-Weiterleitungs-Ingestion) — the email ingestion pipeline this feature extends
- Requires: OPH-4 (KI-Datenextraktion) — the Claude extraction engine that will receive image content blocks
- Requires: OPH-21 (E-Mail-Text als Extraktionsquelle) — established the pattern of saving non-PDF email content as order files

## Problem Context

Some dealers and manufacturer sales staff photograph printed order forms with their phones or take screenshots of order lists (including practice delivery addresses) and send these images directly by email — without any PDF or Excel attachment. Currently the system discards all image files during ingestion: `image/jpeg` and `image/png` are not in the supported MIME type list and are silently dropped. These orders arrive as emails with no processable content and fail extraction entirely.

The complication is that emails contain many images that are **not** order content:
- Email signature logos and headshots
- Company letterhead branding
- Social media icons (Facebook, LinkedIn, XING, etc.)
- Tracking pixels (1×1 pixel transparent GIFs/PNGs)
- HTML email template decorations and spacer images
- Outlook inline images auto-named `image001.jpg`, `image002.jpg`

A naive approach of accepting all image attachments would send dozens of irrelevant images to Claude, increasing cost and degrading extraction quality.

## Research Findings (Basis for Ruleset)

### Signal 1: ContentID (Strongest — Inline vs. Attached)
In the MIME email standard, images embedded in HTML via CID references (`<img src="cid:...">`) carry a `Content-ID` header (exposed by Postmark as `ContentID`). These are **always** template/signature images — they exist to render the HTML email visually. Images explicitly **attached** by the sender have no ContentID. This is the single most reliable signal: ContentID present → noise; ContentID absent → potentially order content.

Currently the Postmark payload Zod schema does not capture `ContentID` — this must be added.

### Signal 2: File Size
| Type | Typical size |
|---|---|
| Tracking pixel (1×1 px) | ~68 bytes – 2 KB |
| Social media icon (32×32 px) | 1 – 10 KB |
| Email signature logo (300×80 px) | 8 – 40 KB |
| Small decorative element | 5 – 40 KB |
| Screenshot (1080p or similar) | 80 KB – 1.5 MB |
| Phone photo of an order form | 200 KB – 8 MB |

**Minimum threshold: 50 KB** eliminates all noise categories while preserving screenshots and phone photos.
**Exception**: If the email has no other order files (no PDF/Excel) and only 1–2 images pass the ContentID and MIME filters, accept images ≥ 10 KB to avoid missing low-resolution captures.
**Maximum threshold: 10 MB** per image (Claude's API limit is ~20 MB; we cap below that to control cost).

### Signal 3: MIME Type
| MIME type | Decision | Reason |
|---|---|---|
| `image/jpeg`, `image/jpg` | Accept | Phone photos and scanned forms |
| `image/png` | Accept | Screenshots, some scanning software output |
| `image/webp` | Accept | Modern app screenshots |
| `image/tiff` | Accept | Document scanning software |
| `image/bmp` | Accept | Windows screenshots |
| `image/gif` | Reject | Animated/decorative GIFs; never order form format |
| `image/svg+xml` | Reject | Vector format; always logos/icons, never photos |
| `image/x-icon`, `image/vnd.microsoft.icon` | Reject | Favicons only |

### Signal 4: Image Count Cap
If more than 5 images pass all other filters in a single email, take the 5 **largest by file size** (largest = most likely to be the full document). This prevents runaway API costs from unusual emails and limits Claude's context size.

## User Stories

- As a **tenant user receiving a phone-photo order**, I want the image to be processed automatically after email ingestion so that I don't have to manually re-upload the file from the web UI.
- As a **tenant user**, I want the extraction accuracy for image orders to be comparable to PDF orders, so that I can review and approve them with the same confidence.
- As a **platform admin**, I want irrelevant images (signatures, logos, icons) to be silently discarded during ingestion so that they never reach Claude and don't inflate costs.
- As a **tenant user**, I want to see the order photo in the file preview panel on the order review page so that I can verify the extracted data against the original image.
- As a **system**, I want image files that fail the relevance filter to generate an `ingestion_notes` warning (not a hard error) so that unexpected discards are traceable.

## Acceptance Criteria

### Ingestion (Email Pipeline)

- [ ] The Postmark payload Zod schema includes `ContentID?: string` on each Attachment object.
- [ ] `filterAttachments` (in `src/lib/postmark.ts`) applies the following relevance rules to image-type attachments, **in order**:
  1. **ContentID reject**: If `ContentID` is non-empty, discard silently (it is an inline HTML image).
  2. **MIME type reject**: If MIME type is `image/gif`, `image/svg+xml`, `image/x-icon`, or `image/vnd.microsoft.icon`, discard with a warning.
  3. **MIME type accept check**: If MIME type is not in the accepted image list (`image/jpeg`, `image/png`, `image/webp`, `image/tiff`, `image/bmp`) AND not in the existing accepted document types (PDF, Excel, etc.), discard with a warning (existing behaviour).
  4. **Size maximum**: If file size > 10 MB, discard with a warning.
  5. **Size minimum**: If file size < 50 KB AND the email contains at least one other order file (PDF/Excel), discard silently. If the email has **no** other order files, the minimum size threshold is lowered to 10 KB.
- [ ] Images that pass all filters are uploaded to Supabase Storage and saved as `order_files` records with their correct `mime_type` (e.g., `image/jpeg`), exactly as PDFs are today.
- [ ] Images that pass all filters and are attached (not inline) but exceed the 5-image cap: only the 5 largest by `ContentLength` are kept; the rest generate a warning in `ingestion_notes`.
- [ ] Discarded inline images (ContentID present) are silently ignored — they generate **no** warning in `ingestion_notes` (too noisy).
- [ ] Discarded non-inline images (failed MIME or size) generate a warning in `ingestion_notes`.

### Extraction (Claude API)

- [ ] `claude-extraction.ts` handles `image/jpeg`, `image/jpg`, `image/png`, `image/webp`, `image/tiff`, and `image/bmp` MIME types by adding them as `type: "image"` content blocks in the Claude API message (Claude's native vision support).
- [ ] The image content block uses `source.type: "base64"` and the correct `media_type` matching the file's MIME type.
- [ ] Image files appear in the extraction content alongside PDFs, Excel, and email body text — all in the same extraction call.
- [ ] The extraction system prompt does not require changes — Claude already handles mixed document+image inputs well, and the existing rules apply equally.

### Display

- [ ] Image files stored as `order_files` are already viewable via the existing file preview panel (OPH-27) without changes, since that feature renders by MIME type.
- [ ] The file count and primary filename on the orders list correctly reflect image files (existing behaviour — no changes needed).

### Out of Scope

- Web upload of image files (the existing web upload UI is for PDFs/Excel/EML — adding image upload is a separate feature decision).
- OCR pre-processing before sending to Claude (Claude's vision handles this natively).
- Image quality assessment beyond file size (Claude handles low-quality gracefully by returning low confidence scores).
- Extracting images from inside PDF files (existing PDF handling covers this via Claude's native PDF vision).

## Edge Cases

- **Email with only one small image (< 50 KB) and no other files**: Apply the relaxed 10 KB minimum threshold — this is likely the only order content available and discarding it would cause complete extraction failure.
- **Email with 10 inline signature images and 1 real order photo**: ContentID filter eliminates the 10 signature images; the 1 real photo (no ContentID) passes through.
- **Image arrives as `application/octet-stream` MIME type**: Already accepted by the existing filter (catch-all for unknown types). The Claude extraction handler must check the filename extension (`.jpg`, `.jpeg`, `.png`) to add it as an image block rather than a document block.
- **Image arrives as `image/jpeg` with 0 bytes**: ContentLength check (< 50 KB or < 10 KB) catches this.
- **TIFF file larger than 10 MB**: Discarded with a warning. Some scanning software produces very large TIFFs; the warning informs the user to re-send as JPEG.
- **Email with 8 images that all pass the filter**: Only the 5 largest are kept; the remaining 3 generate a warning: "3 weitere Bildanhänge übersprungen (max. 5 Bilder pro E-Mail)."
- **Extraction with only image files (no PDF/Excel)**: Claude processes the images directly and extracts order data from the visual content. The confidence score naturally reflects how legible the image is.
- **Blurry or low-resolution photo**: Claude returns a low `confidence_score`, triggering the standard review workflow (same as a low-confidence PDF extraction).

## Technical Requirements

- **No new database migrations** — `order_files` already stores `mime_type`; the image MIME types are new values but the column is `text`.
- **No new API endpoints** — the existing ingestion and extraction pipelines are extended.
- **Two files changed in the email pipeline**: `src/lib/postmark.ts` (schema + `filterAttachments`) and `src/lib/claude-extraction.ts` (image content block support).
- **Claude API cost**: Images are billed by pixel count. A typical phone photo (4 MP) costs ~\$0.005 per extraction call — comparable to a multi-page PDF. The 5-image cap and 50 KB minimum ensure only genuine order images are sent.
- **Postmark ContentID field**: The existing Zod schema uses `.passthrough()`, so the field is present in the runtime object. The schema must be explicitly updated to expose it to TypeScript for use in `filterAttachments`.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview

This is a **backend-only** feature. No UI components change — images are stored as `order_files` (existing table) and rendered by the existing file preview system (OPH-27). The work extends two processing stages of the existing email ingestion pipeline.

### Processing Flow

```
Inbound Email (Postmark webhook)
  │
  ├── Existing: filterAttachments()
  │     │
  │     ├── PDF, Excel, CSV         → pass through (unchanged)
  │     │
  │     └── Image files             ← NEW LOGIC
  │           │
  │           ├── Has ContentID?     → discard silently (inline/signature)
  │           ├── GIF/SVG/ICO?       → discard with warning
  │           ├── > 10 MB?           → discard with warning
  │           ├── < 50 KB?           → discard (or 10 KB if no other files)
  │           ├── > 5 images left?   → keep 5 largest, warn about rest
  │           └── Passes all?        → accept as order file
  │
  ├── Upload to Storage (existing — images flow through same path as PDFs)
  │
  └── Trigger extraction
        │
        ├── Existing: Claude extraction engine
        │     │
        │     ├── PDF files          → document content block (unchanged)
        │     ├── Excel files        → text content block (unchanged)
        │     ├── Email body         → text content block (unchanged)
        │     └── Image files        ← NEW: image content block (Claude vision)
        │
        └── Returns extracted JSON (same schema as always)
```

### What Gets Built

**Stage 1: Email Ingestion — `filterAttachments` upgrade**

The existing `filterAttachments` function in `src/lib/postmark.ts` currently has a simple allowlist of MIME types (PDF, Excel, CSV, text). It becomes a two-path filter:

- **Document path** (unchanged): PDF, Excel, CSV, text files pass through with existing size check.
- **Image path** (new): Images go through the layered relevance filter described in the spec: ContentID → MIME type → max size → min size → count cap.

The function signature changes slightly: it needs to know whether the email has non-image order files, so the filtering is done in two passes internally:
1. First pass: accept all document-type files (existing behaviour).
2. Second pass: run image relevance filter on remaining attachments, using "has document files" as context for the relaxed size threshold.

**Stage 2: Claude Extraction — Image content blocks**

The existing extraction engine in `src/lib/claude-extraction.ts` builds an array of content blocks to send to Claude. Currently it handles three types:
- PDF → `type: "document"` block
- Excel → parsed to text → `type: "text"` block  
- Text/email body → `type: "text"` block

A new handler adds:
- Image (JPEG/PNG/WEBP/TIFF/BMP) → `type: "image"` block using Claude's native vision input

This is the same approach Claude uses for reading PDFs — it can read images natively without OCR pre-processing. The system prompt doesn't need changes.

**Schema update: Postmark Zod schema**

The `Attachments` array schema in the Postmark payload Zod definition adds `ContentID` as an optional string field. This field is already present in Postmark's actual JSON responses (the current schema uses `.passthrough()` which lets unknown fields through, but TypeScript can't see them).

### Data Model (what's stored)

No new tables or columns. Images that pass the filter are stored in the existing `order_files` table:

```
order_files (existing):
  - id
  - order_id
  - tenant_id
  - original_filename    → e.g. "IMG_20260416_142301.jpg"
  - storage_path         → e.g. "tenant-uuid/order-uuid/IMG_20260416_142301.jpg"
  - file_size_bytes      → e.g. 1,245,678
  - mime_type            → e.g. "image/jpeg"   ← new value, column already supports any text
  - sha256_hash          → dedup hash
  - created_at
```

### Why This Approach

**ContentID as primary signal:** In the MIME email standard, inline images (signatures, logos) always have a Content-ID header. Explicitly attached images (what the user deliberately adds) do not. This single signal eliminates ~90% of noise with zero false positives. It's the same technique Gmail, Outlook, and every email client uses to distinguish "decorative" from "attached" images.

**50 KB minimum (with relaxed fallback):** The size distribution is bimodal — noise images cluster below 40 KB while genuine photos start around 200 KB. The 50 KB threshold sits in the natural gap. The fallback to 10 KB for image-only emails prevents losing low-res screenshots when they're the only content.

**5-image cap:** A deliberate cost control. Claude charges by pixel count for images. Five images per order is generous for real use cases (a multi-page order photographed page by page) while preventing edge cases from running up costs.

**No OCR pre-processing:** Claude's vision capability reads text from images natively. Adding a separate OCR step (like Tesseract) would add a dependency, increase latency, and likely produce worse results than Claude for handwritten or partially legible documents.

**No UI changes:** The existing file preview system (OPH-27) already renders files based on their MIME type. Image MIME types will naturally render as `<img>` elements. The orders list already counts files and shows filenames regardless of type.

### Files Changed

| File | Change |
|------|--------|
| `src/lib/postmark.ts` | Add `ContentID` to Zod schema; extend `filterAttachments` with image relevance filter |
| `src/lib/claude-extraction.ts` | Add image content block handler for Claude's vision API |

### No New Packages

Claude's SDK already supports image content blocks. No additional dependencies needed.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
