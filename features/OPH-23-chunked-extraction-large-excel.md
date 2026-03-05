# OPH-23: Chunked Extraction for Large Excel Files

## Status: Deployed
**Created:** 2026-03-05
**Last Updated:** 2026-03-05

## Dependencies
- Requires: OPH-4 (KI-Datenextraktion) — extraction pipeline already implemented
- Requires: OPH-2 (Excel upload support) — Excel files already supported

## Problem Statement

Excel orders with many line items (e.g. 800 rows) fail extraction with:
```
Expected ',' or ']' after array element in JSON at position 22555
```

Root cause: `max_tokens: 8192` in Claude API call truncates the JSON output after ~120 line items. Remaining ~680 items are lost, producing invalid JSON that cannot be parsed.

---

## User Stories

- As a tenant employee, I want to upload large Excel orders (800+ rows) and have all line items extracted correctly, so that I don't have to manually split files before uploading.
- As a tenant employee, I want to see in the extraction result how many chunks were used, so I understand that a large file was processed in parts.

---

## Acceptance Criteria

- [ ] Excel files with >200 data rows are split into chunks and extracted via multiple Claude calls
- [ ] All line items from all chunks are merged into a single extraction result with sequential positions
- [ ] Small Excel files (<= 200 rows) continue to work exactly as before (single call)
- [ ] The extraction metadata shows `chunks_used` count when chunking was used
- [ ] The extraction preview UI shows an "X Chunks" badge when chunks > 1
- [ ] Vercel function timeout is protected (maxDuration = 300s)
- [ ] No data is lost between chunks (header info from first chunk, line items from all chunks)

---

## Edge Cases

- **Multi-sheet Excel**: All sheets combined into one CSV before chunking — all rows counted together
- **Re-extraction**: Works the same way — chunked path re-triggers automatically for large files
- **Dealer column mappings**: Base content blocks (including dealer context) are passed to every chunk
- **Empty/trailing rows**: Filtered out before chunking — only non-empty rows counted
- **Exactly 200 rows**: Uses single-call path (threshold is strictly >200)

---

## Technical Requirements

- `CHUNK_ROW_THRESHOLD = 200` rows per chunk
- `MAX_OUTPUT_TOKENS = 16384` (increased from 8192)
- `maxDuration = 300` on extract route (5 minutes for 4+ sequential Claude calls)
- No API changes, no database schema changes
- Non-Excel files (PDF, EML, CSV, TXT) unaffected

---

## Tech Design

### Approach: Split → Extract → Merge

1. **Detect**: After converting Excel to CSV, count non-empty data rows (excluding header)
2. **Split** (`splitCsvIntoChunks`): Slice data rows into arrays of 200; keep header row separate
3. **Extract** (`extractChunkedExcel`): For each chunk, prepend header row + call Claude; collect results with retry logic
4. **Merge**: First chunk provides order header (number, date, sender, etc.); all chunks contribute line items; positions renumbered sequentially; tokens summed; confidence = minimum across chunks

### Files Modified

| File | Change |
|------|--------|
| `src/lib/claude-extraction.ts` | `CHUNK_ROW_THRESHOLD`, `MAX_OUTPUT_TOKENS`, `splitCsvIntoChunks()`, `extractChunkedExcel()`, modified Excel case |
| `src/app/api/orders/[orderId]/extract/route.ts` | `export const maxDuration = 300` |
| `src/lib/types.ts` | `chunks_used?: number` in `ExtractionMetadata` |
| `src/components/orders/extraction-result-preview.tsx` | "X Chunks" badge in metadata footer |

---

## QA Test Results

_Not formally run — this is a backend bug fix with no new UI flows. Verified via build passing and logic review._

## Deployment

- **Deployed:** 2026-03-05
- **Commit:** `45073c7`
- **Tag:** `v1.23.0-OPH-23`
- **Vercel:** auto-deployed via push to `main`
- **No database migration required**
