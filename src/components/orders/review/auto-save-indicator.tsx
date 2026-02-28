"use client";

import { Check, Loader2, AlertCircle, Cloud } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AutoSaveStatus } from "@/lib/types";

interface AutoSaveIndicatorProps {
  status: AutoSaveStatus;
  error?: string | null;
}

const STATUS_CONFIG: Record<
  AutoSaveStatus,
  {
    label: string;
    icon: typeof Check;
    className: string;
    tooltip: string;
    animate?: boolean;
  }
> = {
  idle: {
    label: "",
    icon: Cloud,
    className: "text-muted-foreground/50",
    tooltip: "Alle Aenderungen werden automatisch gespeichert.",
  },
  saving: {
    label: "Speichern...",
    icon: Loader2,
    className: "text-blue-600 dark:text-blue-400",
    tooltip: "Aenderungen werden gespeichert...",
    animate: true,
  },
  saved: {
    label: "Gespeichert",
    icon: Check,
    className: "text-green-600 dark:text-green-400",
    tooltip: "Alle Aenderungen wurden gespeichert.",
  },
  error: {
    label: "Fehler",
    icon: AlertCircle,
    className: "text-destructive",
    tooltip: "Speichern fehlgeschlagen.",
  },
};

/**
 * Compact indicator showing the auto-save status in the review page header.
 */
export function AutoSaveIndicator({ status, error }: AutoSaveIndicatorProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const tooltipText = error ?? config.tooltip;

  // Don't show anything when idle
  if (status === "idle") return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium",
              config.className
            )}
            role="status"
            aria-live="polite"
            aria-label={config.label}
          >
            <Icon
              className={cn("h-3.5 w-3.5", config.animate && "animate-spin")}
            />
            <span>{config.label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs">{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
