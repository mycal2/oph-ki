"use client";

import { useState, useCallback } from "react";
import { Pencil, Check, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DealerBadge } from "./dealer-badge";
import { DealerOverrideDialog } from "./dealer-override-dialog";
import { DealerResetDialog } from "./dealer-reset-dialog";
import { useDealerOverride } from "@/hooks/use-dealer-override";
import type { RecognitionMethod, DealerOverrideResponse, DealerResetResponse } from "@/lib/types";

interface DealerSectionProps {
  orderId: string;
  dealerId: string | null;
  dealerName: string | null;
  confidence: number;
  recognitionMethod: RecognitionMethod;
  /** ISO timestamp for optimistic locking. */
  orderUpdatedAt?: string;
  /** Called after a successful override so the parent can update its state. */
  onDealerChanged?: (result: DealerOverrideResponse) => void;
  /** OPH-66: Called after a successful dealer reset so the parent can update its state. */
  onDealerReset?: (result: DealerResetResponse) => void;
  /** OPH-66: Whether the current user is a platform admin (controls reset button visibility). */
  isPlatformAdmin?: boolean;
  /** OPH-96: Disable all action buttons when order is locked by another user. */
  disabled?: boolean;
}

/**
 * Combines the DealerBadge with a "Korrigieren" button that opens the override dialog
 * and an optional "Zurücksetzen" button for platform admins (OPH-66).
 */
export function DealerSection({
  orderId,
  dealerId,
  dealerName,
  confidence,
  recognitionMethod,
  orderUpdatedAt,
  onDealerChanged,
  onDealerReset,
  isPlatformAdmin = false,
  disabled = false,
}: DealerSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [currentDealerName, setCurrentDealerName] = useState(dealerName);
  const [currentDealerId, setCurrentDealerId] = useState(dealerId);
  const [currentMethod, setCurrentMethod] =
    useState<RecognitionMethod>(recognitionMethod);
  const [currentConfidence, setCurrentConfidence] = useState(confidence);

  const { override, isSubmitting: isConfirming } = useDealerOverride();

  const isAiProposal = currentMethod === "ai_content" && currentConfidence < 80;

  const handleOverrideSuccess = useCallback(
    (result: DealerOverrideResponse) => {
      setCurrentDealerId(result.dealerId);
      setCurrentDealerName(result.dealerName);
      setCurrentMethod("manual");
      setCurrentConfidence(100);
      onDealerChanged?.(result);
    },
    [onDealerChanged]
  );

  const handleConfirmProposal = useCallback(async () => {
    if (!currentDealerId) return;
    const result = await override(
      orderId,
      currentDealerId,
      "KI-Vorschlag bestätigt",
      orderUpdatedAt
    );
    if (result) {
      handleOverrideSuccess(result);
    }
  }, [orderId, currentDealerId, orderUpdatedAt, override, handleOverrideSuccess]);

  const handleResetSuccess = useCallback(
    (result: DealerResetResponse) => {
      setCurrentDealerId(null);
      setCurrentDealerName(null);
      setCurrentMethod("none");
      setCurrentConfidence(0);
      onDealerReset?.(result);

      toast.success(
        "Händler-Zuweisung zurückgesetzt. Bestellung neu extrahieren, um erneut zu erkennen.",
        {
          action: {
            label: "Neu extrahieren",
            onClick: async () => {
              try {
                const res = await fetch(`/api/orders/${orderId}/extract`, {
                  method: "POST",
                });
                if (res.ok) {
                  toast.success("Extraktion gestartet.");
                } else {
                  const json = await res.json();
                  toast.error(json.error ?? "Extraktion fehlgeschlagen.");
                }
              } catch {
                toast.error("Verbindungsfehler bei der Extraktion.");
              }
            },
          },
        }
      );
    },
    [orderId, onDealerReset]
  );

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <DealerBadge
        dealerName={currentDealerName}
        confidence={currentConfidence}
        recognitionMethod={currentMethod}
      />
      {isAiProposal && (
        <>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/40 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-500/30">
            KI-Vorschlag
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-green-700 hover:text-green-800 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30"
            onClick={handleConfirmProposal}
            disabled={isConfirming || disabled}
            aria-label="KI-Vorschlag bestätigen"
          >
            {isConfirming ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Bestätigen
          </Button>
        </>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setDialogOpen(true)}
        disabled={disabled}
        aria-label="Händler korrigieren"
      >
        <Pencil className="h-3 w-3" />
        Korrigieren
      </Button>

      {/* OPH-66: Reset button — only visible to platform admins */}
      {isPlatformAdmin && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-destructive/70 hover:text-destructive hover:bg-destructive/10"
          onClick={() => setResetDialogOpen(true)}
          disabled={disabled}
          aria-label="Händler zurücksetzen"
        >
          <RotateCcw className="h-3 w-3" />
          Zurücksetzen
        </Button>
      )}

      <DealerOverrideDialog
        orderId={orderId}
        currentDealerId={currentDealerId}
        orderUpdatedAt={orderUpdatedAt}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onOverrideSuccess={handleOverrideSuccess}
      />

      {/* OPH-66: Reset dialog */}
      {isPlatformAdmin && (
        <DealerResetDialog
          orderId={orderId}
          orderUpdatedAt={orderUpdatedAt}
          open={resetDialogOpen}
          onOpenChange={setResetDialogOpen}
          onResetSuccess={handleResetSuccess}
        />
      )}
    </div>
  );
}
