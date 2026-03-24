"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { format, startOfMonth } from "date-fns";
import { de } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DateRangePickerProps {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  disabled?: boolean;
}

export function DateRangePicker({ value, onChange, disabled }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  // Default display month: start of range or current month
  const defaultMonth = value?.from ?? startOfMonth(new Date());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal sm:w-[300px]",
            !value?.from && "text-muted-foreground"
          )}
          aria-label="Zeitraum auswaehlen"
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value?.from ? (
            value.to ? (
              <>
                {format(value.from, "dd.MM.yyyy", { locale: de })} &ndash;{" "}
                {format(value.to, "dd.MM.yyyy", { locale: de })}
              </>
            ) : (
              format(value.from, "dd.MM.yyyy", { locale: de })
            )
          ) : (
            "Zeitraum auswaehlen"
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          defaultMonth={defaultMonth}
          selected={value}
          onSelect={(range) => {
            onChange(range);
            // Close the popover when both dates are selected
            if (range?.from && range?.to) {
              setOpen(false);
            }
          }}
          numberOfMonths={2}
          locale={de}
          disabled={{ after: new Date() }}
        />
      </PopoverContent>
    </Popover>
  );
}
