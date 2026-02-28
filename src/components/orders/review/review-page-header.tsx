"use client";

import { ArrowLeft, CheckCircle, RefreshCw, Loader2 } from "lucide-react";
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
  isReExtracting: boolean;
  onApprove: () => void;
  onReExtract: () => void;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  uploaded: "Hochgeladen",
  processing: "Wird verarbeitet",
  extracted: "Extrahiert",
  review: "In Pruefung",
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
  approved: "default",
  exported: "secondary",
  error: "destructive",
};

/**
 * Header for the review page. Shows back button, status, auto-save indicator,
 * and action buttons (approve, re-extract).
 */
export function ReviewPageHeader({
  orderId,
  orderStatus,
  autoSaveStatus,
  autoSaveError,
  canApprove,
  isApproving,
  isReExtracting,
  onApprove,
  onReExtract,
}: ReviewPageHeaderProps) {
  const router = useRouter();

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
        Zurueck zur Bestellung
      </Button>

      {/* Title row with status + actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold md:text-2xl">Bestellung pruefen</h1>
          <Badge variant={STATUS_VARIANTS[orderStatus]}>
            {STATUS_LABELS[orderStatus]}
          </Badge>
          <AutoSaveIndicator status={autoSaveStatus} error={autoSaveError} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={onReExtract}
            disabled={isReExtracting || isApproving}
            className="gap-1.5"
          >
            {isReExtracting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Erneut extrahieren
          </Button>
          <Button
            size="sm"
            onClick={onApprove}
            disabled={!canApprove || isApproving || isReExtracting || autoSaveStatus === "saving"}
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
