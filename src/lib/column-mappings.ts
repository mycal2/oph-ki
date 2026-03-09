import type { SupabaseClient } from "@supabase/supabase-js";
import type { ColumnMappingProfile, ColumnMappingFormatType } from "@/lib/types";

/**
 * Maps a file MIME type to a column mapping format type.
 * Returns null if the MIME type does not correspond to a supported format.
 */
export function mimeTypeToFormatType(mimeType: string): ColumnMappingFormatType | null {
  const lower = mimeType.toLowerCase();

  // PDF
  if (lower === "application/pdf") {
    return "pdf_table";
  }

  // Excel
  if (
    lower === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    lower === "application/vnd.ms-excel" ||
    lower === "text/csv" ||
    lower === "application/csv"
  ) {
    return "excel";
  }

  // E-Mail / plain text
  if (
    lower === "message/rfc822" ||
    lower === "text/plain" ||
    lower === "text/html"
  ) {
    return "email_text";
  }

  return null;
}

/**
 * Fetches the column mapping profile for a dealer + format type.
 * Returns null if no profile exists for this combination.
 */
export async function getColumnMappingProfile(
  adminClient: SupabaseClient,
  dealerId: string,
  formatType: ColumnMappingFormatType
): Promise<ColumnMappingProfile | null> {
  const { data, error } = await adminClient
    .from("dealer_column_mapping_profiles")
    .select("*")
    .eq("dealer_id", dealerId)
    .eq("format_type", formatType)
    .single();

  if (error || !data) {
    // PGRST116 = "no rows returned" — not an error for us
    if (error && !error.message.includes("PGRST116") && !error.message.includes("0 rows")) {
      console.error("Error fetching column mapping profile:", error.message);
    }
    return null;
  }

  return data as unknown as ColumnMappingProfile;
}

/**
 * Formats a column mapping profile into natural-language context
 * for the Claude extraction prompt.
 *
 * Example output:
 * ## Column Mapping for This Dealer (PDF Format)
 * Spalten-Zuordnung für diesen Händler:
 * - Spalte 1 = ISO-Nummer (items[].iso_number)
 * - Spalte mit Header "Best.-Nr." = Artikelnummer (items[].product_code)
 * - Spalte 3 = Menge (items[].quantity)
 */
export function formatColumnMappingForPrompt(profile: ColumnMappingProfile): string {
  const formatLabels: Record<ColumnMappingFormatType, string> = {
    pdf_table: "PDF-Tabelle",
    excel: "Excel",
    email_text: "E-Mail-Text",
  };

  const formatLabel = formatLabels[profile.format_type] ?? profile.format_type;
  const lines: string[] = [];

  lines.push(`## Column Mapping for This Dealer (${formatLabel} Format)`);
  lines.push(
    "The following column mappings define which columns in this dealer's orders correspond to which canonical fields. " +
    "Use these mappings to correctly interpret ambiguous or unlabeled columns:"
  );

  for (const entry of profile.mappings) {
    let sourceDesc: string;

    switch (entry.match_type) {
      case "position":
        sourceDesc = `Spalte ${entry.position}`;
        break;
      case "header":
        sourceDesc = `Spalte mit Header "${entry.header_text}"`;
        break;
      case "both":
        sourceDesc = `Spalte ${entry.position} (Header: "${entry.header_text}")`;
        break;
      default:
        sourceDesc = "Unbekannte Spalte";
    }

    lines.push(`- ${sourceDesc} = ${entry.target_field}`);
  }

  return lines.join("\n");
}
