"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface TenantOption {
  id: string;
  name: string;
}

interface TenantMultiSelectProps {
  tenants: TenantOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export function TenantMultiSelect({
  tenants,
  selected,
  onChange,
  disabled,
  isLoading,
}: TenantMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const allSelected = tenants.length > 0 && selected.length === tenants.length;

  function toggleAll() {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(tenants.map((t) => t.id));
    }
  }

  function toggleTenant(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  const triggerLabel =
    selected.length === 0
      ? "Mandanten auswaehlen"
      : selected.length === tenants.length
        ? "Alle Mandanten"
        : `${selected.length} Mandant${selected.length === 1 ? "" : "en"} ausgewaehlt`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Mandanten auswaehlen"
          disabled={disabled || isLoading}
          className={cn(
            "w-full justify-between sm:w-[300px]",
            selected.length === 0 && "text-muted-foreground"
          )}
        >
          {isLoading ? "Laden..." : triggerLabel}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Mandant suchen..." />
          <CommandList>
            <CommandEmpty>Kein Mandant gefunden.</CommandEmpty>
            <CommandGroup>
              {/* Select all */}
              <CommandItem onSelect={toggleAll} className="font-medium">
                <Checkbox
                  checked={allSelected}
                  className="mr-2"
                  aria-hidden
                  tabIndex={-1}
                />
                Alle Mandanten auswaehlen
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              {tenants.map((tenant) => {
                const isSelected = selected.includes(tenant.id);
                return (
                  <CommandItem
                    key={tenant.id}
                    onSelect={() => toggleTenant(tenant.id)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {tenant.name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
