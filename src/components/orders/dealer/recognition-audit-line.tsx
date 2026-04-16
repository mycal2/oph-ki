import { Info } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import type { RecognitionMethod } from "@/lib/types";

interface RecognitionAuditLineProps {
  recognitionMethod: RecognitionMethod;
  confidence: number;
  overriddenByName: string | null;
  overriddenAt: string | null;
  overrideReason?: string | null;
  /** OPH-66: Display name of the user who reset the dealer. */
  resetByName?: string | null;
  /** OPH-66: ISO timestamp when the dealer was reset. */
  resetAt?: string | null;
}

const METHOD_LABELS: Record<RecognitionMethod, string> = {
  domain: "E-Mail-Domain",
  address: "Absender-Adresse",
  subject: "Betreff-Muster",
  filename: "Dateiname-Muster",
  manual: "Manuell zugewiesen",
  ai_content: "KI-Dokumentanalyse",
  body_text_match: "E-Mail-Text",
  none: "Keine Erkennung",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Displays a compact audit line showing how the dealer was recognized,
 * whether it was manually overridden, and whether it was reset (OPH-66).
 */
export function RecognitionAuditLine({
  recognitionMethod,
  confidence,
  overriddenByName,
  overriddenAt,
  overrideReason,
  resetByName,
  resetAt,
}: RecognitionAuditLineProps) {
  const parts: string[] = [];

  parts.push(`Erkannt via: ${METHOD_LABELS[recognitionMethod]}`);
  parts.push(`Konfidenz: ${confidence}%`);

  if (overriddenByName && overriddenAt) {
    parts.push(
      `Manuell korrigiert von: ${overriddenByName} am ${formatDate(overriddenAt)}`
    );
  }

  // OPH-66: Show reset info when dealer_id is NULL and reset_at is set.
  // If resetByName is missing (e.g. user was deleted), show date only.
  const isResetState = recognitionMethod === "none" && resetAt;

  if (isResetState) {
    const resetText = resetByName
      ? `Zurückgesetzt von ${resetByName} am ${formatDate(resetAt)}`
      : `Zurückgesetzt am ${formatDate(resetAt)}`;
    parts.push(resetText);
  }

  return (
    <div className="space-y-2">
      <Separator />
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <div>
          <p>{parts.join(" | ")}</p>
          {overrideReason && (
            <p className="mt-0.5 italic">Begruendung: {overrideReason}</p>
          )}
        </div>
      </div>
    </div>
  );
}
