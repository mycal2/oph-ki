"use client";

import { Loader2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ExtractionStatus } from "@/lib/types";

interface ExtractionStatusBadgeProps {
  status: ExtractionStatus | null;
  /** Optional error message shown in tooltip when status is "failed". */
  errorMessage?: string | null;
  /** Compact mode for list rows. */
  compact?: boolean;
}

const STATUS_CONFIG: Record<
  ExtractionStatus,
  {
    label: string;
    icon: typeof Loader2;
    variant: "default" | "secondary" | "destructive" | "outline";
    className: string;
    tooltip: string;
  }
> = {
  pending: {
    label: "Ausstehend",
    icon: Clock,
    variant: "secondary",
    className: "text-muted-foreground",
    tooltip: "Extraktion wartet auf Verarbeitung.",
  },
  processing: {
    label: "In Verarbeitung",
    icon: Loader2,
    variant: "default",
    className:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-500/30",
    tooltip: "KI-Extraktion laeuft. Bitte warten...",
  },
  extracted: {
    label: "Extrahiert",
    icon: CheckCircle2,
    variant: "outline",
    className:
      "border-green-500/40 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 dark:border-green-500/30",
    tooltip: "Bestelldaten wurden erfolgreich extrahiert.",
  },
  failed: {
    label: "Fehler",
    icon: AlertCircle,
    variant: "destructive",
    className: "",
    tooltip: "Extraktion fehlgeschlagen.",
  },
};

/**
 * Displays the extraction status of an order with an icon and tooltip.
 * Shows a spinner animation when the extraction is in progress.
 */
export function ExtractionStatusBadge({
  status,
  errorMessage,
  compact = false,
}: ExtractionStatusBadgeProps) {
  if (!status) {
    return null;
  }

  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const isAnimated = status === "processing";
  const tooltipText =
    status === "failed" && errorMessage
      ? `${config.tooltip} ${errorMessage}`
      : config.tooltip;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={config.variant}
            className={cn(
              "gap-1",
              compact ? "text-[11px] px-1.5 py-0" : "text-xs",
              config.className
            )}
          >
            <Icon
              className={cn(
                compact ? "h-3 w-3" : "h-3.5 w-3.5",
                isAnimated && "animate-spin"
              )}
            />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs">{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
