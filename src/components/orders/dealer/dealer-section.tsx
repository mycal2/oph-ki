"use client";

import { useState, useCallback } from "react";
import { Pencil, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DealerBadge } from "./dealer-badge";
import { DealerOverrideDialog } from "./dealer-override-dialog";
import { useDealerOverride } from "@/hooks/use-dealer-override";
import type { RecognitionMethod, DealerOverrideResponse } from "@/lib/types";

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
}

/**
 * Combines the DealerBadge with a "Korrigieren" button that opens the override dialog.
 */
export function DealerSection({
  orderId,
  dealerId,
  dealerName,
  confidence,
  recognitionMethod,
  orderUpdatedAt,
  onDealerChanged,
}: DealerSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
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
            disabled={isConfirming}
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
        aria-label="Händler korrigieren"
      >
        <Pencil className="h-3 w-3" />
        Korrigieren
      </Button>

      <DealerOverrideDialog
        orderId={orderId}
        currentDealerId={currentDealerId}
        orderUpdatedAt={orderUpdatedAt}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onOverrideSuccess={handleOverrideSuccess}
      />
    </div>
  );
}
