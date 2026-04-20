"use client";

import { ArrowLeft, CheckCircle, ClipboardCheck, RefreshCw, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AutoSaveIndicator } from "./auto-save-indicator";
import type { AutoSaveStatus, OrderStatus } from "@/lib/types";

interface ReviewPageHeaderProps {
  orderId: string;
  orderStatus: OrderStatus;
  autoSaveStatus: AutoSaveStatus;
  autoSaveError?: string | null;
  /** Whether the order has enough data to be approved (at least 1 line item with description + quantity). */
  canApprove: boolean;
  isApproving: boolean;
  /** OPH-90: Whether the check action is in progress. */
  isChecking: boolean;
  isReExtracting: boolean;
  onApprove: () => void;
  /** OPH-90: Called when user clicks "Als Geprüft markieren". */
  onCheck: () => void;
  onReExtract: () => void;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  uploaded: "Hochgeladen",
  processing: "Wird verarbeitet",
  extracted: "Extrahiert",
  review: "In Prüfung",
  checked: "Geprüft",
  approved: "Freigegeben",
  exported: "Exportiert",
  error: "Fehler",
};

const STATUS_VARIANTS: Record<
  OrderStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  uploaded: "secondary",
  processing: "default",
  extracted: "outline",
  review: "default",
  checked: "outline",
  approved: "default",
  exported: "secondary",
  error: "destructive",
};

/** OPH-90: Extra Tailwind classes for specific statuses (e.g. blue for "checked"). */
const STATUS_CLASSNAMES: Partial<Record<OrderStatus, string>> = {
  checked: "border-blue-300 bg-blue-50 text-blue-700",
};

/**
 * Header for the review page. Shows back button, status, auto-save indicator,
 * and action buttons (approve, re-extract).
 */
/** OPH-90: Statuses from which the "Als Geprüft markieren" button is available. */
const CHECKABLE_STATUSES: OrderStatus[] = ["extracted", "review", "checked"];

export function ReviewPageHeader({
  orderId,
  orderStatus,
  autoSaveStatus,
  autoSaveError,
  canApprove,
  isApproving,
  isChecking,
  isReExtracting,
  onApprove,
  onCheck,
  onReExtract,
}: ReviewPageHeaderProps) {
  const router = useRouter();

  const showCheckButton = CHECKABLE_STATUSES.includes(orderStatus);

  return (
    <div className="space-y-3">
      {/* Back button row */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(`/orders/${orderId}`)}
        className="gap-1"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zur Bestellung
      </Button>

      {/* Title row with status + actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold md:text-2xl">Bestellung prüfen</h1>
          <Badge
            variant={STATUS_VARIANTS[orderStatus]}
            className={STATUS_CLASSNAMES[orderStatus] ?? ""}
          >
            {STATUS_LABELS[orderStatus]}
          </Badge>
          <AutoSaveIndicator status={autoSaveStatus} error={autoSaveError} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={onReExtract}
            disabled={isReExtracting || isApproving || isChecking}
            className="gap-1.5"
          >
            {isReExtracting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Erneut extrahieren
          </Button>
          {/* OPH-90: "Als Geprüft markieren" button */}
          {showCheckButton && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCheck}
              disabled={isChecking || isApproving || isReExtracting || autoSaveStatus === "saving"}
              className="gap-1.5"
            >
              {isChecking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ClipboardCheck className="h-3.5 w-3.5" />
              )}
              Als Geprüft markieren
            </Button>
          )}
          <Button
            size="sm"
            onClick={onApprove}
            disabled={!canApprove || isApproving || isChecking || isReExtracting || autoSaveStatus === "saving"}
            className="gap-1.5"
          >
            {isApproving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle className="h-3.5 w-3.5" />
            )}
            Freigeben
          </Button>
        </div>
      </div>
    </div>
  );
}
