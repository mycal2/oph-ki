"use client";

import { useState, useCallback } from "react";
import { Building2, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useDealers } from "@/hooks/use-dealers";
import { useDealerOverride } from "@/hooks/use-dealer-override";
import type { DealerListItem, DealerOverrideResponse } from "@/lib/types";

interface DealerOverrideDialogProps {
  orderId: string;
  currentDealerId: string | null;
  /** ISO timestamp used for optimistic locking to prevent concurrent edits. */
  orderUpdatedAt?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful override with the full response data. */
  onOverrideSuccess: (result: DealerOverrideResponse) => void;
}

export function DealerOverrideDialog({
  orderId,
  currentDealerId,
  orderUpdatedAt,
  open,
  onOpenChange,
  onOverrideSuccess,
}: DealerOverrideDialogProps) {
  const { dealers, isLoading: isDealersLoading, error: dealersError } = useDealers();
  const { override, isSubmitting, error: overrideError } = useDealerOverride();

  const [selectedDealer, setSelectedDealer] = useState<DealerListItem | null>(null);
  const [reason, setReason] = useState("");
  const [comboboxOpen, setComboboxOpen] = useState(false);

  const handleSelect = useCallback(
    (dealer: DealerListItem) => {
      setSelectedDealer(dealer);
      setComboboxOpen(false);
    },
    []
  );

  const handleConfirm = useCallback(async () => {
    if (!selectedDealer) return;

    const result = await override(
      orderId,
      selectedDealer.id,
      reason.trim() || undefined,
      orderUpdatedAt
    );

    if (result) {
      onOverrideSuccess(result);
      onOpenChange(false);
      // Reset form
      setSelectedDealer(null);
      setReason("");
    }
  }, [selectedDealer, orderId, reason, override, onOverrideSuccess, onOpenChange]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
    setSelectedDealer(null);
    setReason("");
  }, [onOpenChange]);

  const canConfirm =
    selectedDealer !== null &&
    selectedDealer.id !== currentDealerId &&
    !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Händler korrigieren</DialogTitle>
          <DialogDescription>
            Wählen Sie den korrekten Händler für diese Bestellung aus.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Dealer combobox */}
          <div className="space-y-2">
            <Label htmlFor="dealer-select">Händler</Label>
            {isDealersLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : dealersError ? (
              <Alert variant="destructive">
                <AlertDescription>{dealersError}</AlertDescription>
              </Alert>
            ) : (
              <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="dealer-select"
                    variant="outline"
                    role="combobox"
                    aria-expanded={comboboxOpen}
                    aria-label="Händler auswählen"
                    className="w-full justify-between font-normal"
                  >
                    {selectedDealer ? (
                      <span className="flex items-center gap-2 truncate">
                        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        {selectedDealer.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Händler suchen...
                      </span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Händler suchen..." />
                    <CommandList>
                      <CommandEmpty>Kein Händler gefunden.</CommandEmpty>
                      <CommandGroup>
                        {dealers.map((dealer) => (
                          <CommandItem
                            key={dealer.id}
                            value={[dealer.name, dealer.city, dealer.country].filter(Boolean).join(" ")}
                            onSelect={() => handleSelect(dealer)}
                            className="gap-2"
                          >
                            <Check
                              className={cn(
                                "h-4 w-4 shrink-0",
                                selectedDealer?.id === dealer.id
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="flex flex-col min-w-0">
                              <span className="truncate">{dealer.name}</span>
                              {(dealer.city || dealer.country) && (
                                <span className="text-xs text-muted-foreground truncate">
                                  {[dealer.city, dealer.country].filter(Boolean).join(", ")}
                                </span>
                              )}
                            </div>
                            {dealer.id === currentDealerId && (
                              <span className="ml-auto text-xs text-muted-foreground shrink-0">
                                aktuell
                              </span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Reason field */}
          <div className="space-y-2">
            <Label htmlFor="override-reason">
              Begründung{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Textarea
              id="override-reason"
              placeholder="Warum wird der Händler geändert?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={2}
              disabled={isSubmitting}
            />
            {reason.length > 0 && (
              <p className="text-xs text-muted-foreground text-right">
                {reason.length}/500
              </p>
            )}
          </div>

          {/* Error display */}
          {overrideError && (
            <Alert variant="destructive">
              <AlertDescription>{overrideError}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Abbrechen
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Speichern...
              </>
            ) : (
              "Händler zuweisen"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
