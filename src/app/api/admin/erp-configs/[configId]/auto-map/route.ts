import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  requirePlatformAdmin,
  isErrorResponse,
  checkAdminRateLimit,
} from "@/lib/admin-auth";
import type { AutoMappingResult } from "@/lib/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_MODEL = "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// Canonical variable definitions (server-side mirror of field-mapper-panel)
// ---------------------------------------------------------------------------

interface VariableDefinition {
  path: string;
  description: string;
}

interface VariableGroup {
  label: string;
  variables: VariableDefinition[];
}

const VARIABLE_GROUPS: VariableGroup[] = [
  {
    label: "Bestellung",
    variables: [
      { path: "order.order_number", description: "Bestellnummer" },
      { path: "order.order_date", description: "Bestelldatum" },
      { path: "order.currency", description: "Waehrung" },
      { path: "order.total_amount", description: "Gesamtbetrag" },
      { path: "order.notes", description: "Notizen" },
      { path: "order.email_subject", description: "E-Mail-Betreff" },
      { path: "order.dealer.name", description: "Haendlername" },
    ],
  },
  {
    label: "Absender",
    variables: [
      { path: "order.sender.company_name", description: "Firma" },
      { path: "order.sender.customer_number", description: "Kundennummer" },
      { path: "order.sender.email", description: "E-Mail" },
      { path: "order.sender.phone", description: "Telefon" },
      { path: "order.sender.street", description: "Strasse" },
      { path: "order.sender.city", description: "Stadt" },
      { path: "order.sender.postal_code", description: "PLZ" },
      { path: "order.sender.country", description: "Land" },
    ],
  },
  {
    label: "Lieferadresse",
    variables: [
      { path: "order.delivery_address.company", description: "Firma" },
      { path: "order.delivery_address.street", description: "Strasse" },
      { path: "order.delivery_address.city", description: "Stadt" },
      { path: "order.delivery_address.postal_code", description: "PLZ" },
      { path: "order.delivery_address.country", description: "Land" },
    ],
  },
  {
    label: "Bestellpositionen",
    variables: [
      { path: "this.position", description: "Position" },
      { path: "this.article_number", description: "Artikelnummer" },
      {
        path: "this.dealer_article_number",
        description: "Lieferantenartikelnr.",
      },
      { path: "this.description", description: "Beschreibung" },
      { path: "this.quantity", description: "Menge" },
      { path: "this.unit", description: "Einheit" },
      { path: "this.unit_price", description: "Stueckpreis" },
      { path: "this.total_price", description: "Gesamtpreis" },
    ],
  },
];

/** All valid canonical field paths. */
const ALL_CANONICAL_PATHS = VARIABLE_GROUPS.flatMap((g) =>
  g.variables.map((v) => v.path)
);

// ---------------------------------------------------------------------------
// Zod schema for validating Claude's response
// ---------------------------------------------------------------------------

const autoMappingItemSchema = z.object({
  target_column: z.string(),
  canonical_field: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

const autoMappingResponseSchema = z.array(autoMappingItemSchema);

// ---------------------------------------------------------------------------
// Build the prompt for Claude
// ---------------------------------------------------------------------------

function buildPrompt(targetColumns: string[]): string {
  const variableList = VARIABLE_GROUPS.map((group) => {
    const vars = group.variables
      .map((v) => `  - ${v.path} (${v.description})`)
      .join("\n");
    return `### ${group.label}\n${vars}`;
  }).join("\n\n");

  return `You are a field-mapping assistant for an ERP order processing platform.

You are given a list of TARGET COLUMNS from a customer's ERP output format (e.g. column headers from their CSV/Excel/XML export template).

Your task: For each target column, find the best matching CANONICAL FIELD from the list below, or return null if no good match exists.

## Canonical Fields (grouped by category)

${variableList}

## Target Columns to Map

${targetColumns.map((col, i) => `${i + 1}. "${col}"`).join("\n")}

## Instructions

1. Match each target column to the most semantically appropriate canonical field.
2. Target columns may be in German, English, or abbreviated. Use your understanding of both languages and common ERP terminology to find the best match.
3. The same canonical field MAY be mapped to multiple target columns if semantically appropriate (e.g., two columns that both represent the article number).
4. Set confidence between 0.0 and 1.0:
   - 0.9-1.0: Very confident match (e.g. "Bestellnummer" -> order.order_number)
   - 0.7-0.89: Likely match (e.g. "BestNr" -> order.order_number)
   - 0.4-0.69: Possible match, needs human review
   - 0.2-0.39: Weak match, probably wrong
   - Below 0.2: Return null for canonical_field
5. If you cannot find a reasonable match, set canonical_field to null and confidence to 0.0.

## Response Format

Return ONLY a valid JSON array (no markdown, no code fences, no explanation):
[
  { "target_column": "...", "canonical_field": "..." or null, "confidence": 0.0-1.0 },
  ...
]

Return exactly one entry per target column, in the same order as the input.`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * POST /api/admin/erp-configs/[configId]/auto-map
 *
 * OPH-45: Uses Claude AI to suggest field mappings from the detected output
 * format schema columns to canonical order data fields.
 * Platform admin only. No request body needed -- reads detected_schema from DB.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ configId: string }> }
): Promise<NextResponse> {
  try {
    const { configId } = await params;
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    if (!UUID_REGEX.test(configId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Konfigurations-ID." },
        { status: 400 }
      );
    }

    // Verify config exists
    const { data: config, error: configError } = await adminClient
      .from("erp_configs")
      .select("id")
      .eq("id", configId)
      .single();

    if (configError || !config) {
      return NextResponse.json(
        { success: false, error: "ERP-Konfiguration nicht gefunden." },
        { status: 404 }
      );
    }

    // Read detected_schema from the output format
    const { data: outputFormat, error: formatError } = await adminClient
      .from("tenant_output_formats")
      .select("detected_schema")
      .eq("erp_config_id", configId)
      .maybeSingle();

    if (formatError) {
      console.error("Error fetching output format:", formatError);
      return NextResponse.json(
        { success: false, error: "Fehler beim Laden des Output-Formats." },
        { status: 500 }
      );
    }

    if (!outputFormat) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Kein Output-Format fuer diese Konfiguration vorhanden. Bitte zuerst eine Beispieldatei hochladen.",
        },
        { status: 400 }
      );
    }

    const detectedSchema = outputFormat.detected_schema as
      | { column_name: string }[]
      | null;

    if (!detectedSchema || !Array.isArray(detectedSchema) || detectedSchema.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Das Output-Format hat kein erkanntes Schema (detected_schema ist leer). Bitte laden Sie eine neue Beispieldatei hoch.",
        },
        { status: 400 }
      );
    }

    const targetColumns = detectedSchema.map((col) => col.column_name);

    // Call Claude API
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("ANTHROPIC_API_KEY is not set.");
      return NextResponse.json(
        { success: false, error: "KI-Service nicht konfiguriert." },
        { status: 500 }
      );
    }

    const model = process.env.EXTRACTION_MODEL ?? DEFAULT_MODEL;
    const anthropic = new Anthropic({ apiKey });

    const prompt = buildPrompt(targetColumns);

    let responseText: string;
    try {
      const message = await anthropic.messages.create(
        {
          model,
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        },
        { signal: AbortSignal.timeout(30_000) }
      );

      // Extract text from response
      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text block in Claude response.");
      }
      responseText = textBlock.text;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Claude API error during auto-map:", msg);
      return NextResponse.json(
        {
          success: false,
          error: `KI-Anfrage fehlgeschlagen: ${msg}`,
        },
        { status: 500 }
      );
    }

    // Parse and validate the JSON response
    let rawMappings: unknown;
    try {
      // Strip potential markdown code fences
      const cleaned = responseText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      rawMappings = JSON.parse(cleaned);
    } catch {
      console.error(
        "Failed to parse Claude auto-map response as JSON:",
        responseText.substring(0, 500)
      );
      return NextResponse.json(
        {
          success: false,
          error:
            "Die KI-Antwort konnte nicht als JSON interpretiert werden. Bitte versuchen Sie es erneut.",
        },
        { status: 500 }
      );
    }

    const parsed = autoMappingResponseSchema.safeParse(rawMappings);
    if (!parsed.success) {
      console.error(
        "Claude auto-map response failed validation:",
        parsed.error.issues
      );
      return NextResponse.json(
        {
          success: false,
          error:
            "Die KI-Antwort hat ein ungueltiges Format. Bitte versuchen Sie es erneut.",
        },
        { status: 500 }
      );
    }

    // Post-process: sanitize canonical_field values
    const mappings: AutoMappingResult[] = parsed.data.map((item) => {
      const canonicalField =
        item.canonical_field && ALL_CANONICAL_PATHS.includes(item.canonical_field)
          ? item.canonical_field
          : null;

      return {
        target_column: item.target_column,
        canonical_field: canonicalField,
        confidence:
          canonicalField === null && item.canonical_field !== null
            ? 0 // Claude returned an invalid path -- reset confidence
            : Math.round(item.confidence * 100) / 100,
      };
    });

    return NextResponse.json({ success: true, data: { mappings } });
  } catch (error) {
    console.error(
      "Error in POST /api/admin/erp-configs/[configId]/auto-map:",
      error
    );
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
