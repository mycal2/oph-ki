"use client";

import { AlertTriangle, CheckCircle2, Info, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ConfidenceScoreData } from "@/lib/types";

interface ConfidenceScoreSectionProps {
  /** Confidence score data from the export preview response. */
  data: ConfidenceScoreData;
}

/**
 * Confidence score badge color ranges:
 * 0-59% = Low (red), 60-84% = Medium (yellow), 85-100% = High (green).
 */
function getScoreColor(score: number): {
  badge: "destructive" | "secondary" | "default";
  text: string;
  label: string;
  progressClass: string;
} {
  if (score < 60) {
    return {
      badge: "destructive",
      text: "text-red-600 dark:text-red-400",
      label: "Niedrig",
      progressClass: "[&>div]:bg-red-500",
    };
  }
  if (score < 85) {
    return {
      badge: "secondary",
      text: "text-yellow-600 dark:text-yellow-400",
      label: "Mittel",
      progressClass: "[&>div]:bg-yellow-500",
    };
  }
  return {
    badge: "default",
    text: "text-green-600 dark:text-green-400",
    label: "Hoch",
    progressClass: "[&>div]:bg-green-500",
  };
}

/**
 * Displays the confidence score for the output format in the export dialog.
 * Shows a color-coded badge, progress bar, and a list of missing required columns.
 */
export function ConfidenceScoreSection({ data }: ConfidenceScoreSectionProps) {
  // If mapping is not configured, show a configuration prompt
  if (data.mapping_not_configured) {
    return (
      <Alert>
        <Settings className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Konfigurieren Sie das Feld-Mapping, um den Confidence Score zu aktivieren.
        </AlertDescription>
      </Alert>
    );
  }

  // If score is null (shouldn't happen if mapping is configured, but handle gracefully)
  if (data.score === null) {
    return null;
  }

  const scoreInfo = getScoreColor(data.score);

  return (
    <div className="space-y-3">
      {/* Score header with badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Format-Abdeckung</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs">
                  Anteil der Pflichtfelder im Ziel-Ausgabeformat, die aus den
                  extrahierten Bestelldaten befuellt werden koennen.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={scoreInfo.badge} className="font-mono text-xs">
            {data.score}%
          </Badge>
          <span className={`text-xs font-medium ${scoreInfo.text}`}>
            {scoreInfo.label}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <Progress
        value={data.score}
        className={`h-2 ${scoreInfo.progressClass}`}
        aria-label={`Confidence Score: ${data.score}%`}
      />

      {/* Stats line */}
      <p className="text-xs text-muted-foreground">
        {data.filled_required} von {data.total_required} Pflichtfeldern befuellt
      </p>

      {/* Missing columns list (top 5) */}
      {data.missing_columns.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
            <span className="text-xs font-medium">
              Fehlende Pflichtfelder
              {data.missing_columns.length < (data.total_required - data.filled_required) && (
                <span className="text-muted-foreground font-normal">
                  {" "}(Top {data.missing_columns.length} von{" "}
                  {data.total_required - data.filled_required})
                </span>
              )}
            </span>
          </div>
          <ul className="space-y-0.5 pl-5">
            {data.missing_columns.map((col, i) => (
              <li key={i} className="text-xs text-muted-foreground list-disc">
                {col}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* All good message */}
      {data.missing_columns.length === 0 && data.score === 100 && (
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          <span className="text-xs text-green-600 dark:text-green-400">
            Alle Pflichtfelder sind befuellt.
          </span>
        </div>
      )}
    </div>
  );
}
