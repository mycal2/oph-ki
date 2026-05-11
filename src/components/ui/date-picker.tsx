"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { format, startOfMonth } from "date-fns";
import { de, enGB, type Locale } from "date-fns/locale";
import { useLocale } from "next-intl";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * OPH-103: Locale-aware single-date picker.
 *
 * Replaces native `<input type="date">` so the calendar UI and the trigger
 * label always render in the user's chosen application locale rather than the
 * browser/OS locale.
 *
 * Contract:
 * - `value` is a `Date | undefined`. Call-sites that store ISO strings
 *   (e.g. `YYYY-MM-DD` in URL state) should convert at the boundary.
 * - `onChange` emits a `Date | undefined`. Call-sites convert back to ISO
 *   via `format(date, "yyyy-MM-dd")`.
 */

const LOCALE_MAP: Record<string, Locale> = {
  de,
  en: enGB,
};

// Locale-specific display pattern in the trigger button.
const DISPLAY_PATTERN: Record<string, string> = {
  de: "dd.MM.yyyy",
  en: "dd/MM/yyyy",
};

interface DatePickerProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  /** Placeholder text shown when no date is selected. */
  placeholder?: string;
  /** Optional aria-label for the trigger button. */
  ariaLabel?: string;
  /** Optional additional class names for the trigger button. */
  className?: string;
  disabled?: boolean;
  /** Optional date constraint passed through to the underlying Calendar. */
  disabledDates?: React.ComponentProps<typeof Calendar>["disabled"];
}

export function DatePicker({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  disabled,
  disabledDates,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const dateFnsLocale = LOCALE_MAP[locale] ?? de;
  const pattern = DISPLAY_PATTERN[locale] ?? "dd.MM.yyyy";

  const defaultMonth = value ?? startOfMonth(new Date());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className
          )}
          aria-label={ariaLabel}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, pattern, { locale: dateFnsLocale }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          defaultMonth={defaultMonth}
          selected={value}
          onSelect={(date) => {
            onChange(date);
            if (date) setOpen(false);
          }}
          locale={dateFnsLocale}
          disabled={disabledDates}
        />
      </PopoverContent>
    </Popover>
  );
}
