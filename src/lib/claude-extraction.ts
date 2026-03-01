import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";
import * as XLSX from "xlsx";
import { parseEml } from "@/lib/eml-parser";
import type { CanonicalOrderData } from "@/lib/types";

const SCHEMA_VERSION = "1.0.0";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const DEFAULT_MODEL = "claude-sonnet-4-6";

const CANONICAL_JSON_SCHEMA = `{
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
      "customer_number": "string | null (the sender's own order or customer reference number)"
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
        "article_number": "string | null",
        "description": "string",
        "quantity": "number",
        "unit": "string | null (e.g. Stueck, Packung, Karton)",
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
11. The "sender" is the company or dealer that placed/sent the order. This is different from the delivery address (where goods are shipped). Look for sender info in letterheads, "From" fields, company stamps, headers, or contact blocks at the top of the document.`;

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
}

export interface ExtractionResult {
  extractedData: CanonicalOrderData;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Extracts order data from files using Claude API.
 * Handles PDF (multimodal), .eml (parsed), Excel (converted to text), and CSV.
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
    // OPH-14 hook: dealer data mappings would be added here
    contentBlocks.push({ type: "text", text: dealerContext });
  }

  // Process each file
  const sourceFiles: string[] = [];

  for (const file of input.files) {
    sourceFiles.push(file.originalFilename);
    const ext = file.originalFilename.toLowerCase().split(".").pop() ?? "";

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
        let excelText = `## Excel Document: ${file.originalFilename}\n`;
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) continue;
          const csv = XLSX.utils.sheet_to_csv(sheet);
          excelText += `\n### Sheet: ${sheetName}\n${csv}\n`;
        }
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
      const message = await anthropic.messages.create({
        model,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: contentBlocks }],
      });

      // Extract text from response
      const responseText = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      // Parse JSON from response (handle potential markdown fences)
      const jsonStr = extractJson(responseText);
      const parsed = JSON.parse(jsonStr) as {
        order: CanonicalOrderData["order"];
        extraction_metadata: { confidence_score: number };
      };

      // Build full canonical result
      const extractedData: CanonicalOrderData = {
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
        },
        extraction_metadata: {
          schema_version: SCHEMA_VERSION,
          confidence_score: parsed.extraction_metadata?.confidence_score ?? 0,
          model,
          extracted_at: new Date().toISOString(),
          source_files: sourceFiles,
          dealer_hints_applied: !!input.dealer?.extractionHints,
          input_tokens: message.usage.input_tokens,
          output_tokens: message.usage.output_tokens,
        },
      };

      return {
        extractedData,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
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
 * Extracts JSON from a response that may contain markdown code fences.
 */
function extractJson(text: string): string {
  // Try to find JSON within code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch?.[0]) {
    return jsonMatch[0];
  }

  // Return as-is and let JSON.parse handle the error
  return text.trim();
}
