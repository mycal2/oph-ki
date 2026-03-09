"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReviewPageHeader } from "./review-page-header";
import { DocumentPreviewPanel } from "./document-preview-panel";
import { OrderEditForm } from "./order-edit-form";
import { DealerSection } from "@/components/orders/dealer";
import { useAutoSave } from "@/hooks/use-auto-save";
import type {
  OrderForReview,
  CanonicalOrderData,
  ApiResponse,
  ReviewApproveResponse,
  DealerOverrideResponse,
} from "@/lib/types";

interface ReviewPageContentProps {
  orderId: string;
}

/**
 * Main client component for the order review page.
 * Fetches order data, manages auto-save, handles approve/re-extract actions.
 */
export function ReviewPageContent({ orderId }: ReviewPageContentProps) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderForReview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isReExtracting, setIsReExtracting] = useState(false);
  const [showReExtractConfirm, setShowReExtractConfirm] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");

  // Working copy of the reviewed data
  const [reviewData, setReviewData] = useState<CanonicalOrderData | null>(null);
  const reviewDataRef = useRef<CanonicalOrderData | null>(null);

  // Keep ref in sync for flush
  useEffect(() => {
    reviewDataRef.current = reviewData;
  }, [reviewData]);

  // Auto-save hook
  const { status: autoSaveStatus, error: autoSaveError, scheduleSave, flush } = useAutoSave({
    orderId,
    updatedAt,
    onUpdatedAt: setUpdatedAt,
    onConflict: () => {
      setError("Diese Bestellung wurde von einem anderen Benutzer geändert. Bitte laden Sie die Seite neu.");
    },
    enabled: !!order && order.status !== "exported",
  });

  // Fetch order data
  const fetchOrder = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/orders/${orderId}`);
      const json = (await res.json()) as ApiResponse<OrderForReview>;

      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? "Bestellung konnte nicht geladen werden.");
        return;
      }

      const orderData = json.data;
      setOrder(orderData);
      setUpdatedAt(orderData.updated_at);

      // Initialize reviewed_data from existing reviewed_data or from extracted_data
      const initialData = orderData.reviewed_data ?? orderData.extracted_data;
      if (initialData) {
        setReviewData(initialData);
      }
    } catch {
      setError("Verbindungsfehler beim Laden der Bestellung.");
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Handle dealer override
  const handleDealerChanged = useCallback(
    (result: DealerOverrideResponse) => {
      if (order) {
        setOrder({
          ...order,
          dealer_id: result.dealerId,
          dealer_name: result.dealerName,
          recognition_method: "manual",
          recognition_confidence: 100,
          dealer_overridden_by: result.overriddenBy,
          dealer_overridden_at: result.overriddenAt,
          overridden_by_name: result.overriddenByName,
          override_reason: result.overrideReason,
        });
        // Update updatedAt from the order's actual updated_at
        setUpdatedAt(result.updatedAt);
      }
    },
    [order]
  );

  // Handle form changes -> schedule auto-save
  const handleDataChange = useCallback(
    (newData: CanonicalOrderData) => {
      setReviewData(newData);
      scheduleSave(newData);
    },
    [scheduleSave]
  );

  // Validate: at least 1 line item with description and quantity
  const canApprove = reviewData
    ? reviewData.order.line_items.some(
        (item) => item.description.trim().length > 0 && item.quantity > 0
      )
    : false;

  // Approve order
  const handleApprove = useCallback(async () => {
    if (!reviewData) return;
    setIsApproving(true);
    setError(null);

    try {
      // Flush any pending auto-save first; use returned updatedAt if a save was performed
      const flushedUpdatedAt = await flush(reviewData);
      const currentUpdatedAt = flushedUpdatedAt ?? updatedAt;

      const res = await fetch(`/api/orders/${orderId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updatedAt: currentUpdatedAt }),
      });

      const json = (await res.json()) as ApiResponse<ReviewApproveResponse>;

      if (res.status === 409) {
        setError("Konflikt: Die Bestellung wurde von einem anderen Benutzer geändert.");
        return;
      }

      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? "Freigabe fehlgeschlagen.");
        return;
      }

      // Navigate to order detail page
      router.push(`/orders/${orderId}`);
    } catch {
      setError("Verbindungsfehler bei der Freigabe.");
    } finally {
      setIsApproving(false);
    }
  }, [reviewData, orderId, updatedAt, flush, router]);

  // Re-extract: confirm dialog, then trigger
  const handleReExtractConfirm = useCallback(async () => {
    setShowReExtractConfirm(false);
    setIsReExtracting(true);
    setError(null);

    try {
      const res = await fetch(`/api/orders/${orderId}/extract`, {
        method: "POST",
      });
      const json = (await res.json()) as ApiResponse;

      if (!res.ok || !json.success) {
        setError(json.error ?? "Extraktion konnte nicht gestartet werden.");
        return;
      }

      // Navigate back to order detail where the user can see extraction progress
      router.push(`/orders/${orderId}`);
    } catch {
      setError("Verbindungsfehler beim Starten der Extraktion.");
    } finally {
      setIsReExtracting(false);
    }
  }, [orderId, router]);

  // ---- Loading state ----
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[500px] rounded-md" />
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // ---- Error state (no order data) ----
  if (error && !order) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/orders/${orderId}`)}
          className="gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={fetchOrder}>
          Erneut versuchen
        </Button>
      </div>
    );
  }

  // ---- No order data ----
  if (!order) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/orders")}
          className="gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Bestellung nicht gefunden.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- No extraction data available ----
  if (!reviewData) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/orders/${orderId}`)}
          className="gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zur Bestellung
        </Button>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Keine Extraktionsdaten</AlertTitle>
          <AlertDescription>
            Für diese Bestellung liegen noch keine extrahierten Daten vor.
            Bitte warten Sie, bis die KI-Extraktion abgeschlossen ist.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.push(`/orders/${orderId}`)}>
          Zurück zur Bestellung
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <ReviewPageHeader
        orderId={orderId}
        orderStatus={order.status}
        autoSaveStatus={autoSaveStatus}
        autoSaveError={autoSaveError}
        canApprove={canApprove}
        isApproving={isApproving}
        isReExtracting={isReExtracting}
        onApprove={handleApprove}
        onReExtract={() => setShowReExtractConfirm(true)}
      />

      {/* Dealer info */}
      <DealerSection
        orderId={orderId}
        dealerId={order.dealer_id}
        dealerName={order.dealer_name}
        confidence={order.recognition_confidence}
        recognitionMethod={order.recognition_method}
        orderUpdatedAt={updatedAt}
        onDealerChanged={handleDealerChanged}
      />

      {/* Error banner */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Document Preview */}
        <DocumentPreviewPanel orderId={orderId} />

        {/* Right: Edit Form */}
        <OrderEditForm data={reviewData} onChange={handleDataChange} />
      </div>

      {/* Re-extract confirmation dialog */}
      <Dialog open={showReExtractConfirm} onOpenChange={setShowReExtractConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Erneut extrahieren?</DialogTitle>
            <DialogDescription>
              Alle manuellen Änderungen werden verworfen und die KI-Extraktion
              wird neu gestartet. Diese Aktion kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowReExtractConfirm(false)}
              disabled={isReExtracting}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleReExtractConfirm}
              disabled={isReExtracting}
              className="gap-1.5"
            >
              {isReExtracting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Ja, erneut extrahieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
