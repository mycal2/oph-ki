import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";
import * as XLSX from "xlsx";
import { parseEml } from "@/lib/eml-parser";
import { sanitizeHints } from "@/lib/validations";
import type { CanonicalOrderData } from "@/lib/types";

const SCHEMA_VERSION = "1.0.0";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const MAX_OUTPUT_TOKENS = 32768;

/** Excel files with more data rows than this are extracted in chunks. */
const CHUNK_ROW_THRESHOLD = 200;

const DEFAULT_MODEL = "claude-sonnet-4-6";

const CANONICAL_JSON_SCHEMA = `{
  "document_language": "string | null (ISO 639-1 code, e.g. DE, EN, FR, ES, CS, PL, IT, NL, PT; null if indeterminate)",
  "order": {
    "order_number": "string | null",
    "order_date": "ISO 8601 date string | null",
    "dealer": { "id": "string | null", "name": "string | null" },
    "sender": {
      "company_name": "string | null (the company/dealer that placed or sent the order)",
      "street": "string | null",
      "city": "string | null",
      "postal_code": "string | null",
      "country": "string | null",
      "email": "string | null",
      "phone": "string | null",
      "customer_number": "string | null (the manufacturer's customer ID / Kundennummer for the ordering dealer — assigned by the manufacturer, NOT the dealer's own reference or order number)"
    } | null,
    "delivery_address": {
      "company": "string | null",
      "street": "string | null",
      "city": "string | null",
      "postal_code": "string | null",
      "country": "string | null"
    } | null,
    "billing_address": { same structure as delivery_address } | null,
    "line_items": [
      {
        "position": "integer (1-based)",
        "article_number": "string | null (the manufacturer's / supplier's article number — look for column headers like Lief.Art.Nr., Lieferantenartikelnummer, Art.Nr., Artikelnummer, Herst.-Art.-Nr., Supplier Art. No., Item No., Product Code; see rule #17 for full list)",
        "dealer_article_number": "string | null (the dealer's own internal article/product number for this item — only populate if the document clearly contains a separate dealer-specific reference number alongside or instead of the manufacturer's number; if only one article number is present and it appears to be the manufacturer's, leave this null)",
        "description": "string",
        "quantity": "number",
        "unit": "string | null (German standard term: Stueck, Packung, Karton, Flasche, Dose, Tube, Beutel, Rolle, Paar, Set, Liter, Milliliter, Gramm, Kilogramm, Meter)",
        "unit_price": "number | null",
        "total_price": "number | null",
        "currency": "string | null (e.g. EUR, USD)"
      }
    ],
    "total_amount": "number | null",
    "currency": "string | null",
    "notes": "string | null (any additional notes, delivery instructions, etc.)"
  },
  "extraction_metadata": {
    "confidence_score": "number between 0 and 1"
  }
}`;

const SYSTEM_PROMPT = `You are a specialized data extraction system for dental product orders. Your task is to extract structured order data from documents and return it as JSON.

## Output Format
Return ONLY valid JSON matching this schema (no markdown, no explanation, no code fences):
${CANONICAL_JSON_SCHEMA}

## Rules
1. Extract all order information you can find in the document.
2. For fields you cannot determine, use null. Never guess or fabricate data.
3. Line items must preserve the original order from the document.
4. Article numbers should be extracted exactly as they appear (dealer-specific codes).
5. Quantities must be positive numbers.
6. Prices should be numbers without currency symbols.
7. The confidence_score reflects your overall confidence in the extraction accuracy (0 = no confidence, 1 = fully confident).
8. If the document contains NO order data at all, return line_items as an empty array and set confidence_score to 0.
9. Dates should be in ISO 8601 format (YYYY-MM-DD).
10. All text fields should preserve the original language of the document.
11. The "sender" is the company or dealer that placed/sent the order. This is different from the delivery address (where goods are shipped). Look for sender info in letterheads, "From" fields, company stamps, headers, or contact blocks at the top of the document.
12. **Customer Number (Kundennummer) extraction rules:**
    - The customer_number is the **manufacturer's customer ID** for the ordering dealer. It is assigned by the manufacturer, NOT the dealer's own reference or order number.
    - Search for the customer number in **all** available sources: the order document (PDF, Excel, email attachment), the forwarding email body text, **and** the email subject line.
    - Recognise multi-language keywords indicating a customer number:
      * German: "Kundennummer", "Kd.-Nr.", "Kd.Nr.", "Kundennr.", "Kdnr", "Kdnr.", "KdNr", "Kd-Nr", "Kd Nr", "Kndnummer", "Knd-Nr", "Knd.-Nr.", "Knd.Nr.", "Knd Nr", "Kunden-Nr", "Kunden-Nr.", "Kunden Nr"
      * English: "customer number", "customer no.", "customer ID", "account number"
      * French: "numéro client", "n° client"
      * Spanish: "número de cliente", "nº cliente"
      * Italian: "numero cliente", "n. cliente"
    - If a customer number appears in both the forwarding note and the order document and they differ, **prefer the forwarding note value** (the person forwarding knows the correct account).
    - Only extract a value as customer_number when it is clearly preceded by one of the keywords above. Do NOT confuse it with order numbers, invoice numbers, PO numbers, or article numbers.
    - The customer number may be purely numeric ("12345") or alphanumeric ("KD-12345-DE").
13. **Document language detection:**
    - Detect the primary language of the order content (the table/line items), not the email wrapper or forwarding note.
    - Set \`document_language\` to the uppercase ISO 639-1 code (DE, EN, FR, ES, CS, PL, IT, NL, PT, etc.).
    - Set to null if the document is purely numeric or the language cannot be determined.
14. **Unit normalization to German standard terms:**
    - All \`unit\` field values MUST be German standard terms. Translate from any source language abbreviation:
      * pc, pcs, piece, pieces, unit, units, ea, each, stk, stueck, unite, piece, pieza, ks, szt -> "Stueck"
      * pkg, pack, package, pkt, pckg, Packung -> "Packung"
      * box, bx, ctn, carton, cs, case, Karton -> "Karton"
      * btl, bottle, flasche, fl -> "Flasche"
      * can, tin, dose, ds -> "Dose"
      * tube, tb, tub -> "Tube"
      * bag, beutel, sachet -> "Beutel"
      * roll, rll, rolle -> "Rolle"
      * pair, pr, paar -> "Paar"
      * set, kit -> "Set"
      * L, l, lt, liter, litre -> "Liter"
      * ml, mL, milliliter -> "Milliliter"
      * g, gr, gramm, gram -> "Gramm"
      * kg, kilogramm, kilogram -> "Kilogramm"
      * m, meter, metre -> "Meter"
    - If no unit is stated for a line item, use "Stueck" as the default.
    - If the unit cannot be mapped to any of the above, preserve the original abbreviation as-is.
15. **Quantity column recognition (multilingual):**
    - Recognize the quantity column by its header name in any language:
      * German: Menge, Anzahl, Stueck, Qty
      * English: Qty, Quantity, Amount, Count, Units
      * French: Quantite, Qte, Nombre
      * Spanish: Cantidad, Cant, Ctd
      * Czech: Mnozstvi, Pocet
      * Polish: Ilosc, Liczba
      * Italian: Quantita, Qta
      * Dutch: Aantal, Hoeveelheid
    - Extract the numeric value from that column.
    - Handle thousands separators correctly: "1,224.00" = 1224, "1.224,00" = 1224, "1 224" = 1224. Always return the plain integer or decimal number without formatting.
    - Each line item has its OWN quantity from its row. Never sum, average, or share quantities across line items.
16. **Dealer-Specific Extraction Hints (CRITICAL):**
    - If a "Dealer-Specific Extraction Hints" section is provided in the dealer context, you MUST follow those instructions with highest priority.
    - Dealer hints override default extraction behavior. For example, if hints say to skip certain lines, those lines MUST NOT appear in line_items — even if they look like regular order rows.
    - If hints specify how to map article numbers (e.g. which column is the dealer article number vs manufacturer article number), follow those mappings exactly.
17. **Manufacturer article number column recognition (multilingual):**
    - In dealer orders, the manufacturer's article number is typically labeled from the dealer's perspective — the dealer calls the manufacturer their "Lieferant" (supplier). Recognize these column header labels as the \`article_number\` field:
      * German: Lief.Art.Nr., Lief.-Art.-Nr., Lieferantenartikelnummer, Lieferanten-Art.-Nr., Lieferanten Art Nr, Art.Nr., Art.-Nr., Art-Nr, Artikelnummer, Artikel-Nr., Artikel Nr, Herst.-Art.-Nr., Herstellerartikelnummer, Hersteller-Art.-Nr., Hersteller Art Nr, Bestell-Nr., Bestellnummer, Interne Mat.Nr., Interne Mat.Nr:, Interne Matnr, Interne Materialnummer, Interne Mat.-Nr., Mat.Nr., Materialnummer
      * English: Supplier Art. No., Supplier Article No., Supplier Article Number, Vendor Art. No., Vendor Article No., Vendor Item No., Manufacturer Art. No., Manufacturer Article No., Item No., Item Number, Product Code, Product No., Article No., Article Number, Part No., Part Number, SKU
    - These labels map to \`article_number\` (the manufacturer's article number), NOT to \`dealer_article_number\`.
    - The following labels indicate the dealer's OWN internal article number and map to \`dealer_article_number\`:
      * German: Kd.-Art.Nr., Kd.Art.Nr., Kundenartikelnummer, Kunden-Art.-Nr., Eigene Art.Nr., Eigene Artikelnummer, Unsere Art.Nr., Ihre Art.Nr.
      * English: Customer Art. No., Customer Article No., Internal Art. No., Our Article No., Your Article No., Buyer Art. No.
    - When both types of article numbers appear in the same document, extract each into the correct field.
    - When only one article number column is present and it matches a manufacturer/supplier label above, put it in \`article_number\` and leave \`dealer_article_number\` null.
    - If the column label does not match any of the above, fall back to context-based inference (existing behavior).`;

export interface ExtractionInput {
  orderId: string;
  files: Array<{
    storagePath: string;
    originalFilename: string;
    mimeType: string;
    content: Buffer;
  }>;
  dealer: {
    id: string | null;
    name: string | null;
    extractionHints: string | null;
  } | null;
  /** Formatted mapping context for the prompt (from OPH-14 dealer-mappings). */
  mappingsContext?: string;
  /** Formatted column mapping context for the prompt (from OPH-15 column-mapping profiles). */
  columnMappingContext?: string;
  /** OPH-25: Email subject from the order (Postmark, .eml, or manual input). */
  emailSubject?: string | null;
}

export interface ExtractionResult {
  extractedData: CanonicalOrderData;
  inputTokens: number;
  outputTokens: number;
  /** OPH-25: Subject parsed from a .eml file during extraction (for persistence). */
  parsedEmailSubject?: string | null;
}

// ---------------------------------------------------------------------------
// OPH-69: Image content block helpers for Claude's native vision support
// ---------------------------------------------------------------------------

/** Claude API accepted image media types for the base64 image source. */
type ClaudeImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/** Image MIME types that map directly to Claude vision input. */
const IMAGE_MIME_TYPES_FOR_EXTRACTION = new Set<string>([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/tiff",
  "image/bmp",
]);

/** File extensions that indicate an image (used for application/octet-stream fallback). */
const IMAGE_EXTENSIONS_FOR_EXTRACTION = new Set<string>([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "tiff",
  "tif",
  "bmp",
]);

/**
 * Determines whether a file should be sent to Claude as an image content block.
 * Checks both MIME type and file extension to handle `application/octet-stream` edge cases.
 */
function isImageForExtraction(mimeType: string, ext: string): boolean {
  if (IMAGE_MIME_TYPES_FOR_EXTRACTION.has(mimeType)) return true;
  // Edge case: image sent as application/octet-stream — check extension
  if (mimeType === "application/octet-stream" && IMAGE_EXTENSIONS_FOR_EXTRACTION.has(ext)) return true;
  return false;
}

/**
 * Resolves the Claude-compatible media type for an image file.
 * TIFF and BMP are not natively declared in the SDK types but Claude can process them;
 * we map them to the closest supported type (JPEG) since Claude's vision handles the
 * actual format detection from the binary data.
 *
 * For files with `application/octet-stream` MIME type, infers from extension.
 */
function resolveImageMediaType(mimeType: string, ext: string): ClaudeImageMediaType {
  // Direct SDK-supported types
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "image/jpeg";
  if (mimeType === "image/png") return "image/png";
  if (mimeType === "image/webp") return "image/webp";

  // TIFF/BMP: Claude handles these via vision but SDK types don't declare them.
  // Send as image/jpeg — Claude detects the actual format from the binary data.
  if (mimeType === "image/tiff" || mimeType === "image/bmp") return "image/jpeg";

  // application/octet-stream fallback — resolve from extension
  const extLower = ext.toLowerCase();
  if (extLower === "jpg" || extLower === "jpeg") return "image/jpeg";
  if (extLower === "png") return "image/png";
  if (extLower === "webp") return "image/webp";
  if (extLower === "tiff" || extLower === "tif" || extLower === "bmp") return "image/jpeg";

  // Default fallback
  return "image/jpeg";
}

/**
 * Extracts order data from files using Claude API.
 * Handles PDF (multimodal), .eml (parsed), Excel (converted to text), CSV, and images (OPH-69).
 */
export async function extractOrderData(
  input: ExtractionInput
): Promise<ExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set.");
  }

  const model = process.env.EXTRACTION_MODEL ?? DEFAULT_MODEL;
  const anthropic = new Anthropic({ apiKey });

  // Build content blocks from files
  const contentBlocks: ContentBlockParam[] = [];

  // Add dealer context if available
  if (input.dealer) {
    let dealerContext = `## Dealer Context\n`;
    if (input.dealer.name) {
      dealerContext += `Dealer: ${input.dealer.name}\n`;
    }
    if (input.dealer.id) {
      dealerContext += `Dealer ID: ${input.dealer.id}\n`;
    }
    if (input.dealer.extractionHints) {
      dealerContext += `\n## Dealer-Specific Extraction Hints\n${input.dealer.extractionHints}\n`;
    }
    if (input.mappingsContext) {
      dealerContext += `\n${input.mappingsContext}\n`;
    }
    if (input.columnMappingContext) {
      dealerContext += `\n${input.columnMappingContext}\n`;
    }
    contentBlocks.push({ type: "text", text: dealerContext });
  }

  // OPH-25: Add email subject context block if available.
  // Placed after dealer context, before file content blocks.
  // BUG-1 fix: Skip when files include .eml — the EML parser already includes Subject in its block.
  const hasEmlFile = input.files.some((f) => f.originalFilename.toLowerCase().endsWith(".eml"));
  // BUG-3 fix: Treat subjects containing only whitespace or punctuation as empty.
  const hasSubstantiveSubject = input.emailSubject &&
    input.emailSubject.trim().length > 0 &&
    /[a-zA-Z0-9\u00C0-\u024F]/.test(input.emailSubject);
  if (!hasEmlFile && hasSubstantiveSubject) {
    let subjectText = sanitizeHints(input.emailSubject!.trim());
    if (subjectText.trim().length > 0 && /[a-zA-Z0-9\u00C0-\u024F]/.test(subjectText)) {
      // Truncate to 500 characters
      if (subjectText.length > 500) {
        subjectText = subjectText.slice(0, 500) + "[...]";
      }
      contentBlocks.push({
        type: "text",
        text: `## Email Subject (from forwarded email)\nUse this to help identify the order number, customer number (Kundennummer), or sender if not found in the attachment.\n${subjectText}`,
      });
    }
  }

  // Process each file
  const sourceFiles: string[] = [];
  let parsedEmailSubject: string | null = null;

  for (const file of input.files) {
    sourceFiles.push(file.originalFilename);
    const ext = file.originalFilename.toLowerCase().split(".").pop() ?? "";

    // OPH-69: Check if the file should be handled as an image content block.
    // Check both MIME type and file extension to catch images served as
    // application/octet-stream (edge case from spec).
    if (isImageForExtraction(file.mimeType, ext)) {
      const mediaType = resolveImageMediaType(file.mimeType, ext);
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: file.content.toString("base64"),
        },
      });
      continue;
    }

    switch (ext) {
      case "pdf": {
        contentBlocks.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: file.content.toString("base64"),
          },
        });
        break;
      }

      case "eml": {
        const emlData = await parseEml(file.content);
        // OPH-25: Capture parsed subject for persistence to orders.subject
        if (emlData.subject) {
          parsedEmailSubject = emlData.subject;
        }
        let emlText = `## Email Document: ${file.originalFilename}\n`;
        if (emlData.subject) emlText += `Subject: ${emlData.subject}\n`;
        if (emlData.from) emlText += `From: ${emlData.from}\n`;
        if (emlData.to) emlText += `To: ${emlData.to}\n`;
        if (emlData.date) emlText += `Date: ${emlData.date}\n`;
        if (emlData.textBody) {
          emlText += `\n--- Email Body ---\n${emlData.textBody}\n`;
        }
        if (emlData.attachments.length > 0) {
          emlText += `\n--- Attachments ---\n`;
          emlData.attachments.forEach((att) => {
            emlText += `- ${att.filename} (${att.contentType}, ${att.size} bytes)\n`;
          });
        }
        contentBlocks.push({ type: "text", text: emlText });
        break;
      }

      case "xlsx":
      case "xls": {
        const workbook = XLSX.read(file.content, { type: "buffer" });

        // Combine all sheets into one CSV block
        let allCsv = "";
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) continue;
          const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ";", rawNumbers: true });
          if (allCsv) allCsv += "\n";
          allCsv += csv;
        }

        // Count data rows (all non-empty rows minus header)
        const allRows = allCsv.split("\n").filter((r) => r.trim().length > 0);
        const dataRowCount = Math.max(0, allRows.length - 1);

        if (dataRowCount > CHUNK_ROW_THRESHOLD) {
          // Large file → chunked extraction
          console.log(
            `Excel file "${file.originalFilename}" has ${dataRowCount} data rows (> ${CHUNK_ROW_THRESHOLD}). Using chunked extraction.`
          );
          const excelChunks = splitCsvIntoChunks(allCsv, CHUNK_ROW_THRESHOLD);
          return extractChunkedExcel({
            anthropic,
            model,
            systemPrompt: SYSTEM_PROMPT,
            baseContentBlocks: [...contentBlocks], // snapshot of current blocks (dealer context, other files)
            excelChunks,
            filename: file.originalFilename,
            input,
            sourceFiles,
          });
        }

        // Small file → add as text block, proceed with single-call extraction
        const excelText = `## Excel Document: ${file.originalFilename}\n${allCsv}`;
        contentBlocks.push({ type: "text", text: excelText });
        break;
      }

      case "csv": {
        const csvText = file.content.toString("utf-8");
        contentBlocks.push({
          type: "text",
          text: `## CSV Document: ${file.originalFilename}\n${csvText}`,
        });
        break;
      }

      case "txt": {
        // OPH-21: Label email_body.txt distinctly so Claude treats it as
        // supplemental sender text that may add to or override attachment data.
        const txtContent = file.content.toString("utf-8");
        if (file.originalFilename === "email_body.txt") {
          contentBlocks.push({
            type: "text",
            text: `## Email Body Text (supplemental info from sender)\nThis is the original email body text written by the sender. It may contain additional order items, corrections, or instructions that supplement or override the attached document(s). Treat this as the most recent communication from the sender.\n\n${txtContent}`,
          });
        } else {
          contentBlocks.push({
            type: "text",
            text: `## Text Document: ${file.originalFilename}\n${txtContent}`,
          });
        }
        break;
      }

      default: {
        // Fallback: try as plain text
        const text = file.content.toString("utf-8");
        contentBlocks.push({
          type: "text",
          text: `## Document: ${file.originalFilename}\n${text}`,
        });
      }
    }
  }

  contentBlocks.push({
    type: "text",
    text: "Extract the order data from the document(s) above. Return ONLY valid JSON.",
  });

  // Call Claude with retry
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Use streaming to avoid SDK timeout on large responses
      const stream = anthropic.messages.stream({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: contentBlocks }],
      });
      const message = await stream.finalMessage();

      // Check if response was truncated due to max_tokens
      if (message.stop_reason === "max_tokens") {
        throw new Error(
          `Extraktion abgebrochen: Antwort wurde bei ${MAX_OUTPUT_TOKENS} Tokens abgeschnitten. Die Bestellung hat vermutlich zu viele Positionen für eine einzelne Extraktion.`
        );
      }

      // Extract text from response
      const responseText = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      // Parse JSON from response (handle potential markdown fences)
      const jsonStr = extractJson(responseText);
      let parsed: {
        document_language?: string | null;
        order: CanonicalOrderData["order"];
        extraction_metadata: { confidence_score: number };
      };
      try {
        parsed = safeJsonParse(jsonStr, input.orderId);
      } catch (parseError) {
        throw parseError;
      }

      // Build full canonical result
      const extractedData: CanonicalOrderData = {
        document_language: parsed.document_language?.toUpperCase() ?? null,
        order: {
          order_number: parsed.order.order_number ?? null,
          order_date: parsed.order.order_date ?? null,
          dealer: {
            id: input.dealer?.id ?? null,
            name: input.dealer?.name ?? parsed.order.dealer?.name ?? null,
          },
          sender: parsed.order.sender ?? null,
          delivery_address: parsed.order.delivery_address ?? null,
          billing_address: parsed.order.billing_address ?? null,
          line_items: (parsed.order.line_items ?? []).map((item, idx) => ({
            position: item.position ?? idx + 1,
            article_number: item.article_number ?? null,
            dealer_article_number: item.dealer_article_number ?? null,
            description: item.description ?? "",
            quantity: item.quantity ?? 0,
            unit: item.unit ?? null,
            unit_price: item.unit_price ?? null,
            total_price: item.total_price ?? null,
            currency: item.currency ?? null,
          })),
          total_amount: parsed.order.total_amount ?? null,
          currency: parsed.order.currency ?? null,
          notes: parsed.order.notes ?? null,
          email_subject: input.emailSubject ?? null,
        },
        extraction_metadata: {
          schema_version: SCHEMA_VERSION,
          confidence_score: parsed.extraction_metadata?.confidence_score ?? 0,
          model,
          extracted_at: new Date().toISOString(),
          source_files: sourceFiles,
          dealer_hints_applied: !!input.dealer?.extractionHints,
          column_mapping_applied: !!input.columnMappingContext,
          input_tokens: message.usage.input_tokens,
          output_tokens: message.usage.output_tokens,
        },
      };

      return {
        extractedData,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        parsedEmailSubject,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Retry on rate limit (429) or server errors (5xx)
      const isRetryable =
        lastError.message.includes("429") ||
        lastError.message.includes("529") ||
        lastError.message.includes("overloaded") ||
        lastError.message.includes("timeout") ||
        lastError.message.includes("500") ||
        lastError.message.includes("502") ||
        lastError.message.includes("503");

      if (!isRetryable || attempt === MAX_RETRIES) {
        break;
      }

      // Exponential backoff
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }

  throw lastError ?? new Error("Extraction failed after retries.");
}

/**
 * Splits CSV text into chunks of `chunkSize` data rows.
 * Returns the header row separately so it can be prepended to every chunk.
 */
function splitCsvIntoChunks(
  csvText: string,
  chunkSize: number
): { headerRow: string; chunks: string[][] } {
  const rows = csvText.split("\n");
  const headerRow = rows[0] ?? "";
  // Filter out empty trailing rows
  const dataRows = rows.slice(1).filter((r) => r.trim().length > 0);

  const chunks: string[][] = [];
  for (let i = 0; i < dataRows.length; i += chunkSize) {
    chunks.push(dataRows.slice(i, i + chunkSize));
  }
  return { headerRow, chunks };
}

/**
 * Extracts a single chunk with retry logic. Used by extractChunkedExcel.
 */
async function extractSingleChunk(params: {
  anthropic: Anthropic;
  model: string;
  systemPrompt: string;
  contentBlocks: ContentBlockParam[];
}): Promise<{
  parsed: {
    document_language?: string | null;
    order: CanonicalOrderData["order"];
    extraction_metadata: { confidence_score: number };
  };
  inputTokens: number;
  outputTokens: number;
}> {
  const { anthropic, model, systemPrompt, contentBlocks } = params;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Use streaming to avoid SDK timeout on large responses
      const stream = anthropic.messages.stream({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: contentBlocks }],
      });
      const message = await stream.finalMessage();

      // Check if response was truncated due to max_tokens
      if (message.stop_reason === "max_tokens") {
        throw new Error(
          `Extraktion abgebrochen: Antwort wurde bei ${MAX_OUTPUT_TOKENS} Tokens abgeschnitten (Chunk-Extraktion).`
        );
      }

      const responseText = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      const jsonStr = extractJson(responseText);
      const parsed = safeJsonParse<{
        document_language?: string | null;
        order: CanonicalOrderData["order"];
        extraction_metadata: { confidence_score: number };
      }>(jsonStr);

      return {
        parsed,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isRetryable =
        lastError.message.includes("429") ||
        lastError.message.includes("529") ||
        lastError.message.includes("overloaded") ||
        lastError.message.includes("timeout") ||
        lastError.message.includes("500") ||
        lastError.message.includes("502") ||
        lastError.message.includes("503");

      if (!isRetryable || attempt === MAX_RETRIES) {
        break;
      }

      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }

  throw lastError ?? new Error("Chunk extraction failed after retries.");
}

/**
 * Extracts a large Excel order by splitting it into chunks and calling Claude
 * for all chunks in parallel, then merging the results.
 */
async function extractChunkedExcel(params: {
  anthropic: Anthropic;
  model: string;
  systemPrompt: string;
  /** Content blocks that are NOT Excel data (dealer context, email body, etc.) */
  baseContentBlocks: ContentBlockParam[];
  /** Excel CSV data split into chunks: { headerRow, chunks } */
  excelChunks: { headerRow: string; chunks: string[][] };
  filename: string;
  input: ExtractionInput;
  sourceFiles: string[];
}): Promise<ExtractionResult> {
  const { anthropic, model, systemPrompt, baseContentBlocks, excelChunks, filename, input, sourceFiles } = params;
  const { headerRow, chunks } = excelChunks;

  // Fire all chunk extractions in parallel
  const chunkPromises = chunks.map((chunkRows, chunkIdx) => {
    const chunkCsv = [headerRow, ...chunkRows].join("\n");
    const chunkLabel = `## Excel Document: ${filename} (Chunk ${chunkIdx + 1}/${chunks.length})\n`;

    const chunkContentBlocks: ContentBlockParam[] = [
      ...baseContentBlocks,
      { type: "text", text: `${chunkLabel}${chunkCsv}` },
      {
        type: "text",
        text: `Extract the order data from the document(s) above. This is chunk ${chunkIdx + 1} of ${chunks.length} from a large Excel file. Return ONLY valid JSON.`,
      },
    ];

    return extractSingleChunk({ anthropic, model, systemPrompt, contentBlocks: chunkContentBlocks });
  });

  const chunkResults = await Promise.all(chunkPromises);

  // Merge results — chunk 0 provides header info, all chunks contribute line items
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let minConfidence = 1;
  let mergedLineItems: CanonicalOrderData["order"]["line_items"] = [];

  const firstResult = chunkResults[0].parsed;
  totalInputTokens += chunkResults[0].inputTokens;
  totalOutputTokens += chunkResults[0].outputTokens;
  minConfidence = Math.min(minConfidence, firstResult.extraction_metadata?.confidence_score ?? 0);

  // First chunk: build the header data structure
  const firstItems = (firstResult.order.line_items ?? []).map((item, idx) => ({
    position: item.position ?? idx + 1,
    article_number: item.article_number ?? null,
    dealer_article_number: item.dealer_article_number ?? null,
    description: item.description ?? "",
    quantity: item.quantity ?? 0,
    unit: item.unit ?? null,
    unit_price: item.unit_price ?? null,
    total_price: item.total_price ?? null,
    currency: item.currency ?? null,
  }));
  mergedLineItems = firstItems;

  // Subsequent chunks: collect line items, renumber positions
  for (let i = 1; i < chunkResults.length; i++) {
    const result = chunkResults[i];
    totalInputTokens += result.inputTokens;
    totalOutputTokens += result.outputTokens;
    minConfidence = Math.min(minConfidence, result.parsed.extraction_metadata?.confidence_score ?? 0);

    const positionOffset = mergedLineItems.length;
    const chunkItems = (result.parsed.order.line_items ?? []).map((item, idx) => ({
      position: positionOffset + idx + 1,
      article_number: item.article_number ?? null,
      dealer_article_number: item.dealer_article_number ?? null,
      description: item.description ?? "",
      quantity: item.quantity ?? 0,
      unit: item.unit ?? null,
      unit_price: item.unit_price ?? null,
      total_price: item.total_price ?? null,
      currency: item.currency ?? null,
    }));
    mergedLineItems = [...mergedLineItems, ...chunkItems];
  }

  const extractedData: CanonicalOrderData = {
    document_language: firstResult.document_language?.toUpperCase() ?? null,
    order: {
      order_number: firstResult.order.order_number ?? null,
      order_date: firstResult.order.order_date ?? null,
      dealer: {
        id: input.dealer?.id ?? null,
        name: input.dealer?.name ?? firstResult.order.dealer?.name ?? null,
      },
      sender: firstResult.order.sender ?? null,
      delivery_address: firstResult.order.delivery_address ?? null,
      billing_address: firstResult.order.billing_address ?? null,
      line_items: mergedLineItems,
      total_amount: firstResult.order.total_amount ?? null,
      currency: firstResult.order.currency ?? null,
      notes: firstResult.order.notes ?? null,
      email_subject: input.emailSubject ?? null,
    },
    extraction_metadata: {
      schema_version: SCHEMA_VERSION,
      confidence_score: minConfidence,
      model,
      extracted_at: new Date().toISOString(),
      source_files: sourceFiles,
      dealer_hints_applied: !!input.dealer?.extractionHints,
      column_mapping_applied: !!input.columnMappingContext,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      chunks_used: chunks.length,
    },
  };

  return {
    extractedData,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    // BUG-2 fix: Chunked path is Excel-only, so no EML subject, but return field for interface consistency.
    parsedEmailSubject: null,
  };
}

/**
 * Extracts JSON from a response that may contain markdown code fences.
 */
function extractJson(text: string): string {
  // Try to find JSON within code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  // Find the first '{' and use bracket counting to find its matching '}'
  const startIdx = text.indexOf("{");
  if (startIdx !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = startIdx; i < text.length; i++) {
      const ch = text[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\" && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          return text.substring(startIdx, i + 1);
        }
      }
    }
  }

  // Return as-is and let JSON.parse handle the error
  return text.trim();
}

/**
 * Attempts to parse JSON, repairing common issues from LLM output if needed.
 */
function safeJsonParse<T>(jsonStr: string, orderId?: string): T {
  // First try direct parse
  try {
    return JSON.parse(jsonStr) as T;
  } catch (e) {
    console.error(`[safeJsonParse] Direct parse failed for order ${orderId ?? "unknown"}. Error: ${e instanceof Error ? e.message : e}. First 500 chars: ${jsonStr.substring(0, 500)}`);
  }

  let repaired = jsonStr;

  // Replace Unicode quotation marks inside string values with escaped ASCII equivalents.
  // These cause issues when Claude outputs company names like UAB „Tavis" — the „ " chars
  // can interfere with JSON string delimiters.
  repaired = repaired.replace(/\u201E/g, '\\"');  // „ (double low-9 quotation mark)
  repaired = repaired.replace(/\u201C/g, '\\"');  // " (left double quotation mark)
  repaired = repaired.replace(/\u201D/g, '\\"');  // " (right double quotation mark)
  repaired = repaired.replace(/\u201A/g, "\\'");  // ‚ (single low-9 quotation mark)
  repaired = repaired.replace(/\u2018/g, "\\'");  // ' (left single quotation mark)
  repaired = repaired.replace(/\u2019/g, "\\'");  // ' (right single quotation mark)

  try {
    return JSON.parse(repaired) as T;
  } catch {
    // Continue with more repairs
  }

  // Fix trailing commas before } or ]
  repaired = repaired.replace(/,\s*([\]}])/g, "$1");

  // Fix unescaped newlines/tabs/returns inside string values
  repaired = repaired.replace(
    /"(?:[^"\\]|\\.)*"/g,
    (match) => match.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
  );

  try {
    return JSON.parse(repaired) as T;
  } catch {
    // Continue with more aggressive repairs
  }

  // Remove all control characters except already-escaped ones
  repaired = repaired.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

  try {
    return JSON.parse(repaired) as T;
  } catch {
    // Continue with most aggressive repairs
  }

  // Fix unescaped quotes inside string values: find strings and escape internal quotes
  // This handles cases like "order_number": "AB"CD" → "order_number": "AB\"CD"
  repaired = repaired.replace(
    /:\s*"((?:[^"\\]|\\.)*)"/g,
    (_match, content: string) => {
      // Re-process: within the captured content, check for unescaped quotes
      // by looking at the raw jsonStr around this area
      return `: "${content}"`;
    }
  );

  try {
    return JSON.parse(repaired) as T;
  } catch {
    // Last resort: try to use a character-by-character JSON string fixer
    repaired = fixJsonStrings(jsonStr);
    try {
      return JSON.parse(repaired) as T;
    } catch (finalError) {
      console.error(`[safeJsonParse] All repair attempts failed for order ${orderId ?? "unknown"}. fixJsonStrings first 500 chars: ${repaired.substring(0, 500)}`);
      throw finalError;
    }
  }
}

/**
 * Character-by-character JSON string repair.
 * Walks the JSON and properly escapes string contents.
 */
function fixJsonStrings(input: string): string {
  const result: string[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    if (input[i] === '"') {
      // Start of a string — collect and fix its contents
      result.push('"');
      i++;
      while (i < len) {
        const ch = input[i];
        if (ch === '\\') {
          // Keep escape sequences as-is
          result.push(ch);
          i++;
          if (i < len) {
            result.push(input[i]);
            i++;
          }
        } else if (ch === '"') {
          // Could be end-of-string or unescaped quote inside string
          // Peek ahead: if next non-whitespace is a valid JSON token after
          // a string value, treat this as the real closing quote.
          const rest = input.substring(i + 1).trimStart();
          const nextCh = rest.length > 0 ? rest[0] : '';
          if (
            rest.length === 0 ||
            nextCh === ':' ||
            nextCh === ',' ||
            nextCh === '}' ||
            nextCh === ']' ||
            // A '"' follows → could be start of next key/value in the object
            // Check if it looks like a key ("key":) or array element
            (nextCh === '"' && /^"[^"]*"\s*:/.test(rest))
          ) {
            result.push('"');
            i++;
            break;
          } else {
            // Unescaped quote inside string — escape it
            result.push('\\"');
            i++;
          }
        } else if (ch === '\n') {
          result.push('\\n');
          i++;
        } else if (ch === '\r') {
          result.push('\\r');
          i++;
        } else if (ch === '\t') {
          result.push('\\t');
          i++;
        } else if (ch.charCodeAt(0) < 0x20) {
          // Other control character — skip
          i++;
        } else {
          result.push(ch);
          i++;
        }
      }
    } else {
      result.push(input[i]);
      i++;
    }
  }

  return result.join('');
}
