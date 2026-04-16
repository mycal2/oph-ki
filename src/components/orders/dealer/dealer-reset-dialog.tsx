"use client";

import { useCallback } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useDealerReset } from "@/hooks/use-dealer-reset";
import type { DealerResetResponse } from "@/lib/types";

interface DealerResetDialogProps {
  orderId: string;
  /** ISO timestamp used for optimistic locking to prevent concurrent edits. */
  orderUpdatedAt?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful reset with the full response data. */
  onResetSuccess: (result: DealerResetResponse) => void;
}

/**
 * OPH-66: Confirmation dialog for resetting the dealer assignment on an order.
 * Uses AlertDialog (destructive action pattern) instead of a full form dialog.
 */
export function DealerResetDialog({
  orderId,
  orderUpdatedAt,
  open,
  onOpenChange,
  onResetSuccess,
}: DealerResetDialogProps) {
  const { reset, isSubmitting, error } = useDealerReset();

  const handleConfirm = useCallback(
    async (e: React.MouseEvent) => {
      // Prevent AlertDialog from auto-closing on click — we close manually on success.
      e.preventDefault();

      const result = await reset(orderId, orderUpdatedAt);

      if (result) {
        onResetSuccess(result);
        onOpenChange(false);
      }
    },
    [orderId, orderUpdatedAt, reset, onResetSuccess, onOpenChange]
  );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Händler-Zuweisung wirklich zurücksetzen?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Die Bestellung hat danach keinen Händler mehr. Sie können die
            Bestellung anschließend neu extrahieren, um die KI-Erkennung
            erneut laufen zu lassen.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>
            Abbrechen
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Zurücksetzen...
              </>
            ) : (
              "Zurücksetzen"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
