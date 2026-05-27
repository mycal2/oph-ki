# OPH-114: Chunked PDF Extraction for Large Orders

## Status: In Progress

## Created: 2026-05-27

## Background

Order `b4c3e550-4702-4d5a-b7bc-7a4ad56da522` on dev failed with:

> Extraktion abgebrochen: Antwort wurde bei 32768 Tokens abgeschnitten. Die Bestellung hat vermutlich zu viele Positionen für eine einzelne Extraktion.

The PDF was a 101 KB info-dense order with many line items. Claude's response generated the full JSON until hitting our `MAX_OUTPUT_TOKENS = 32768` cap and the code aborted gracefully.

OPH-23 already solved this for Excel files (`extractChunkedExcel` in `src/lib/claude-extraction.ts`). This feature extends the same idea to PDFs: split large PDFs into page-range chunks, extract each in parallel via Claude, merge the line items.

## Dependencies

- Requires: OPH-4 (KI-Datenextraktion mit Händler-Kontext)
- Related: OPH-23 (Chunked Extraction for Large Excel Files) — same idiom

## User Stories

1. **As a tenant user** uploading an order PDF with many items (a dental supplier sending a multi-page price list / large standing order), the extraction completes successfully instead of failing with a token-limit error.
2. **As a tenant admin**, I want the extraction to scale to PDFs of any reasonable size (10+ pages) without manual intervention.
3. **As a developer**, the chunked path mirrors OPH-23's Excel chunking so the codebase has one consistent pattern.

## Acceptance Criteria

### AC-1: PDF page count drives chunking decision

- After loading a PDF, count its pages.
- If pages ≤ `CHUNK_PAGE_THRESHOLD` (3): keep current single-call extraction path. **No behavioural change** for small PDFs.
- If pages > threshold: route through chunked extraction.

### AC-2: Chunking splits the PDF into page-range chunks

- New helper `splitPdfIntoPageChunks(buffer, pagesPerChunk): Promise<Buffer[]>`
- Uses `pdf-lib` to clone N-page slices into separate PDF documents.
- Default `pagesPerChunk = 2`: a 7-page PDF becomes chunks of [1-2, 3-4, 5-6, 7].
- Each chunk preserves the original page rendering (no text re-flow).

### AC-3: Each chunk runs as a separate Claude call in parallel

- Mirrors `extractChunkedExcel`: fire all chunks via `Promise.all`.
- Each chunk gets a labelled prompt: "This is chunk N of M from a large PDF order."
- `baseContentBlocks` (other files, dealer hints, email body) shared across chunks.

### AC-4: Results merge — chunk 0 provides header data, all contribute line items

- Order number, dealer, sender address, delivery address, billing address, totals, notes → from chunk 0 only.
- Line items: concatenated from all chunks, positions renumbered (`positionOffset` pattern).
- Confidence score: minimum across chunks (worst-case signalling).
- Token usage summed across chunks; `chunks_used` count recorded in `extraction_metadata`.

### AC-5: Single PDF in order (no degradation for mixed-file orders)

- Multi-file orders (PDF + EML, multiple PDFs) keep the current single-call path unless EXACTLY ONE PDF file present AND it exceeds the page threshold. Mixed-content chunking is out of scope.
- Rationale: orders with multiple PDFs are rare; the dominant case is one large PDF.

### AC-6: Graceful failure if chunking fails

- If `pdf-lib` can't parse the PDF (corrupted file, encrypted): fall back to single-call extraction (current behaviour).
- If a single chunk fails after retries: surface the same error as today, but include which chunk failed.

### AC-7: `extraction_metadata.chunks_used` populated for PDF chunks

- Same field OPH-23 used. UI can show "N Chunks" badge later if needed.

### AC-8: Token cost is acceptable

- Each chunk re-sends `baseContentBlocks` and the system prompt, so N chunks ≈ N× input tokens of a single call.
- For typical dental orders (5-10 pages → 3-5 chunks), additional input cost is ~$0.05-0.15. Acceptable trade-off.

## Edge Cases

- **PDF with 1 page**: single-call path, no change.
- **PDF with exactly 3 pages** (threshold boundary): single-call path.
- **PDF with 4 pages**: 2 chunks of 2 pages each.
- **PDF with odd page count** (e.g., 7): last chunk smaller. `splitPdfIntoPageChunks` returns whatever's left.
- **Multiple PDFs in same order**: not chunked. Logged warning + single-call path.
- **Encrypted/corrupted PDF**: pdf-lib throws; fall back to single-call extraction (same as today).
- **PDF + email body / dealer hints**: baseContentBlocks pattern from OPH-23 carries supplementary text into every chunk.
- **Stuck order from before this fix**: user clicks "Erneut extrahieren" on the order detail page → now routes through chunked path. No data migration needed.

## Out of Scope

- Mixed-content chunking (PDF + Excel in one order). Each file type independently handled.
- Re-extraction of historical failed orders. User has to manually re-trigger via existing "Erneut extrahieren" button.
- Adaptive chunk sizing (e.g. binary-search on which page count fits under the cap). Fixed 2 pages per chunk is good enough.
- UI badge for "chunks used". Spec field is populated; UI follow-up if needed.

## Tech Design

### New dependency

- `pdf-lib` (^1.17) — pure JS, no native bindings, works on Vercel serverless. ~600 KB unzipped.

### Constants

```ts
/** PDFs with more pages than this are extracted in chunks. */
const CHUNK_PAGE_THRESHOLD = 3;
/** Number of pages per chunk in the chunked PDF path. */
const PDF_CHUNK_PAGES = 2;
```

### New helper

```ts
async function splitPdfIntoPageChunks(buffer: Buffer, pagesPerChunk: number): Promise<Buffer[]> {
  const src = await PDFDocument.load(buffer);
  const totalPages = src.getPageCount();
  const chunks: Buffer[] = [];
  for (let start = 0; start < totalPages; start += pagesPerChunk) {
    const dst = await PDFDocument.create();
    const indices = Array.from({ length: Math.min(pagesPerChunk, totalPages - start) }, (_, i) => start + i);
    const pages = await dst.copyPages(src, indices);
    pages.forEach((p) => dst.addPage(p));
    chunks.push(Buffer.from(await dst.save()));
  }
  return chunks;
}
```

### Branching in main extract function

When processing the `"pdf"` case for a SINGLE-PDF order:
- Load PDF, count pages
- If pages > `CHUNK_PAGE_THRESHOLD` → call `extractChunkedPdf` (new function mirroring `extractChunkedExcel`)
- Else → existing single-call path

### `extractChunkedPdf` function

Mirror of `extractChunkedExcel` but takes `Buffer[]` of PDF chunks instead of CSV chunks. Each chunk goes into a `document` content block.

### Files changed

| File | Change |
|---|---|
| `package.json` | Add `pdf-lib` dependency |
| `src/lib/claude-extraction.ts` | Add `CHUNK_PAGE_THRESHOLD`, `PDF_CHUNK_PAGES`, `splitPdfIntoPageChunks`, `extractChunkedPdf`, branching in the PDF case |
| `features/OPH-114-chunked-pdf-extraction.md` | This spec |
| `features/INDEX.md` + `docs/OPH-PRD.md` | Register OPH-114 |
