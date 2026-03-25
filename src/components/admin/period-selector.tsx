"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Period = "current_month" | "last_month" | "current_quarter" | "last_quarter";

interface PeriodOption {
  value: Period;
  label: string;
}

const periodOptions: PeriodOption[] = [
  { value: "current_month", label: "Aktueller Monat" },
  { value: "last_month", label: "Letzter Monat" },
  { value: "current_quarter", label: "Aktuelles Quartal" },
  { value: "last_quarter", label: "Letztes Quartal" },
];

interface PeriodSelectorProps {
  value: Period;
  onChange: (period: Period) => void;
  disabled?: boolean;
}

export function PeriodSelector({ value, onChange, disabled }: PeriodSelectorProps) {
  return (
    <div
      className="inline-flex items-center rounded-lg border bg-muted p-1 gap-1"
      role="radiogroup"
      aria-label="Zeitraum auswählen"
    >
      {periodOptions.map((option) => (
        <Button
          key={option.value}
          variant="ghost"
          size="sm"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
