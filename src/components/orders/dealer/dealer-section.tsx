"use client";

import { useState, useCallback } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DealerBadge } from "./dealer-badge";
import { DealerOverrideDialog } from "./dealer-override-dialog";
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

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <DealerBadge
        dealerName={currentDealerName}
        confidence={currentConfidence}
        recognitionMethod={currentMethod}
      />
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setDialogOpen(true)}
        aria-label="Haendler korrigieren"
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
