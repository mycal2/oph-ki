"use client";

import { AlertTriangle, ArrowLeft, CheckCircle, CircleCheck, ClipboardCheck, RefreshCw, Loader2 } from "lucide-react";
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
  /** OPH-93: Whether the clarify action is in progress. */
  isClarifying: boolean;
  /** OPH-93: Whether the resolve-clarification action is in progress. */
  isResolvingClarification: boolean;
  /** OPH-93: The current clarification note (shown as a banner). */
  clarificationNote?: string | null;
  onApprove: () => void;
  /** OPH-90: Called when user clicks "Als Geprüft markieren". */
  onCheck: () => void;
  onReExtract: () => void;
  /** OPH-93: Called when user clicks "Klärung markieren". */
  onClarify: () => void;
  /** OPH-93: Called when user clicks "Klärung abgeschlossen". */
  onResolveClarification: () => void;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  uploaded: "Hochgeladen",
  processing: "Wird verarbeitet",
  extracted: "Extrahiert",
  review: "In Prüfung",
  checked: "Geprüft",
  clarification: "Klärung",
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
  clarification: "outline",
  approved: "default",
  exported: "secondary",
  error: "destructive",
};

/** OPH-90/93: Extra Tailwind classes for specific statuses. */
const STATUS_CLASSNAMES: Partial<Record<OrderStatus, string>> = {
  checked: "border-blue-300 bg-blue-50 text-blue-700",
  clarification: "border-amber-300 bg-amber-50 text-amber-700",
};

/**
 * Header for the review page. Shows back button, status, auto-save indicator,
 * and action buttons (approve, re-extract, check, clarify).
 */
/** OPH-90/93: Statuses from which the "Als Geprüft markieren" button is available. */
const CHECKABLE_STATUSES: OrderStatus[] = ["extracted", "review", "checked", "clarification"];

/** OPH-93: Statuses from which the "Klärung markieren" button is available. */
const CLARIFIABLE_STATUSES: OrderStatus[] = ["extracted", "review", "checked", "clarification"];

/** OPH-93: Statuses from which the "Freigeben" button is available.
 *  clarification is excluded per AC-16 — user must go through checked first. */
const APPROVABLE_STATUSES: OrderStatus[] = ["extracted", "review", "checked"];

export function ReviewPageHeader({
  orderId,
  orderStatus,
  autoSaveStatus,
  autoSaveError,
  canApprove,
  isApproving,
  isChecking,
  isReExtracting,
  isClarifying,
  isResolvingClarification,
  clarificationNote,
  onApprove,
  onCheck,
  onReExtract,
  onClarify,
  onResolveClarification,
}: ReviewPageHeaderProps) {
  const router = useRouter();

  const anyActionInProgress = isApproving || isChecking || isReExtracting || isClarifying || isResolvingClarification;
  const showCheckButton = CHECKABLE_STATUSES.includes(orderStatus);
  const showClarifyButton = CLARIFIABLE_STATUSES.includes(orderStatus);
  const showApproveButton = APPROVABLE_STATUSES.includes(orderStatus);
  const showResolveButton = orderStatus === "clarification";

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
            disabled={anyActionInProgress}
            className="gap-1.5"
          >
            {isReExtracting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Erneut extrahieren
          </Button>
          {/* OPH-93: "Klärung markieren" button */}
          {showClarifyButton && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClarify}
              disabled={anyActionInProgress || autoSaveStatus === "saving"}
              className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
            >
              {isClarifying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" />
              )}
              Klärung markieren
            </Button>
          )}
          {/* OPH-93: "Klärung abgeschlossen" button — only shown for clarification orders */}
          {showResolveButton && (
            <Button
              variant="outline"
              size="sm"
              onClick={onResolveClarification}
              disabled={anyActionInProgress || autoSaveStatus === "saving"}
              className="gap-1.5"
            >
              {isResolvingClarification ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CircleCheck className="h-3.5 w-3.5" />
              )}
              Klärung abgeschlossen
            </Button>
          )}
          {/* OPH-90: "Als Geprüft markieren" button */}
          {showCheckButton && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCheck}
              disabled={anyActionInProgress || autoSaveStatus === "saving"}
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
          {/* OPH-93: Freigeben is hidden for clarification orders (AC-16) */}
          {showApproveButton && (
            <Button
              size="sm"
              onClick={onApprove}
              disabled={!canApprove || anyActionInProgress || autoSaveStatus === "saving"}
              className="gap-1.5"
            >
              {isApproving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5" />
              )}
              Freigeben
            </Button>
          )}
        </div>
      </div>

      {/* OPH-93: Clarification note banner */}
      {orderStatus === "clarification" && clarificationNote && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-amber-800">Klärungsnotiz</p>
            <p className="text-sm text-amber-700">{clarificationNote}</p>
          </div>
        </div>
      )}
    </div>
  );
}
