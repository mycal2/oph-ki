"use client";

import { Building2, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RecognitionMethod } from "@/lib/types";

interface DealerBadgeProps {
  dealerName: string | null;
  confidence: number;
  recognitionMethod: RecognitionMethod;
  /** Compact mode for file list rows (smaller text, no icon). */
  compact?: boolean;
}

const METHOD_LABELS: Record<RecognitionMethod, string> = {
  domain: "E-Mail-Domain",
  address: "Absender-Adresse",
  subject: "Betreff-Muster",
  filename: "Dateiname-Muster",
  manual: "Manuell zugewiesen",
  none: "Nicht erkannt",
};

/**
 * Displays a dealer recognition badge with the dealer name and confidence score.
 * Colors: green >= 80%, yellow 50-79%, red/muted < 50% or unknown.
 */
export function DealerBadge({
  dealerName,
  confidence,
  recognitionMethod,
  compact = false,
}: DealerBadgeProps) {
  const isUnknown = !dealerName || recognitionMethod === "none";

  if (isUnknown) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                "gap-1 text-muted-foreground border-muted-foreground/30",
                compact ? "text-[11px] px-1.5 py-0" : "text-xs"
              )}
            >
              {!compact && <HelpCircle className="h-3 w-3" />}
              Unbekannt
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Kein Haendler erkannt. Sie koennen manuell zuweisen.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const isHigh = confidence >= 80;
  const isMedium = confidence >= 50 && confidence < 80;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "gap-1",
              compact ? "text-[11px] px-1.5 py-0" : "text-xs",
              isHigh &&
                "border-green-500/40 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 dark:border-green-500/30",
              isMedium &&
                "border-yellow-500/40 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-500/30",
              !isHigh &&
                !isMedium &&
                "border-red-500/40 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 dark:border-red-500/30"
            )}
          >
            {!compact && <Building2 className="h-3 w-3" />}
            <span className="truncate max-w-[150px]">{dealerName}</span>
            <span className="font-normal opacity-70">{confidence}%</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            Erkannt via: {METHOD_LABELS[recognitionMethod]} | Konfidenz:{" "}
            {confidence}%
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
