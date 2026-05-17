"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { CustomerDiscountTableRow } from "@/lib/types";

interface DiscountOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: CustomerDiscountTableRow | null;
  /** Customer-level default rate, used to show the fallback hint. Null when unset. */
  defaultRate: number | null;
  /** Save / upsert an explicit per-article override. */
  onSave: (rate: number) => Promise<{ ok: boolean; error?: string }>;
  /** Remove an existing per-article override (row reverts to default). */
  onResetToDefault: () => Promise<{ ok: boolean; error?: string }>;
  isMutating: boolean;
}

/**
 * OPH-106: Edit / set / clear an explicit per-article discount override.
 *
 * - If the row already has an override → "Set new value" + "Auf Standard zuruecksetzen".
 * - If the row uses the default or has no rate → only "Speichern" is shown.
 */
export function DiscountOverrideDialog({
  open,
  onOpenChange,
  row,
  defaultRate,
  onSave,
  onResetToDefault,
  isMutating,
}: DiscountOverrideDialogProps) {
  const [rateInput, setRateInput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Reset when dialog opens or row changes.
  useEffect(() => {
    if (!open || !row) {
      return;
    }
    setError(null);
    // Pre-fill with the effective rate so the user sees the current value
    // (whether it came from an explicit override or the customer default).
    if (row.effective_rate !== null) {
      setRateInput(formatRate(row.effective_rate));
    } else {
      setRateInput("");
    }
  }, [open, row]);

  const handleSave = useCallback(async () => {
    setError(null);
    const parsed = parseRate(rateInput);
    if (parsed === null) {
      setError("Bitte geben Sie einen Rabattsatz zwischen 0 und 100 ein.");
      return;
    }
    const result = await onSave(parsed);
    if (!result.ok) {
      setError(result.error ?? "Fehler beim Speichern.");
      return;
    }
    onOpenChange(false);
  }, [onOpenChange, onSave, rateInput]);

  const handleResetToDefault = useCallback(async () => {
    setError(null);
    const result = await onResetToDefault();
    if (!result.ok) {
      setError(result.error ?? "Fehler beim Loeschen.");
      return;
    }
    onOpenChange(false);
  }, [onOpenChange, onResetToDefault]);

  if (!row) return null;

  const hasOverride = row.source === "override";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Rabatt fuer Artikel anpassen</DialogTitle>
          <DialogDescription>
            <span className="block font-medium text-foreground">
              {row.article_number} – {row.article_name}
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {defaultRate === null
                ? "Kein Kundenstandard gesetzt."
                : `Kundenstandard: ${formatRate(defaultRate)} %`}
            </span>
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="discount-override-rate">Rabattsatz (%) *</Label>
            <Input
              id="discount-override-rate"
              type="text"
              inputMode="decimal"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              placeholder="z.B. 12,50"
              disabled={isMutating}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Wert zwischen 0 und 100 mit bis zu zwei Nachkommastellen.
            </p>
          </div>

          {hasOverride && (
            <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
              <Badge variant="outline" className="text-xs">
                Override aktiv
              </Badge>
              <span className="text-muted-foreground">
                Aktueller Override: {formatRate(row.effective_rate)} %
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {hasOverride && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={handleResetToDefault}
              disabled={isMutating}
            >
              {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Auf Standard zuruecksetzen
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isMutating}
          >
            Abbrechen
          </Button>
          <Button type="button" onClick={handleSave} disabled={isMutating}>
            {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parseRate(input: string): number | null {
  const trimmed = input.trim().replace(",", ".");
  if (trimmed.length === 0) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  if (value < 0 || value > 100) return null;
  // Reject more than 2 decimals.
  if (Math.round(value * 100) !== value * 100) return null;
  return value;
}

function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  // German decimal format: "25,00" instead of "25.00".
  return rate.toFixed(2).replace(".", ",");
}
