"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderDetailHeader } from "./order-detail-header";
import { OrderFileList } from "./order-file-list";
import { ExtractionResultPreview } from "./extraction-result-preview";
import { useOrderPolling } from "@/hooks/use-order-polling";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import type { OrderForReview, OrderWithDealer, DealerOverrideResponse, ApiResponse } from "@/lib/types";

interface OrderDetailContentProps {
  orderId: string;
}

/**
 * Client component for the order detail page.
 * Fetches order data and renders the header + file list.
 */
export function OrderDetailContent({ orderId }: OrderDetailContentProps) {
  const router = useRouter();
  const { role } = useCurrentUserRole();
  const [order, setOrder] = useState<OrderForReview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      setOrder(json.data);
    } catch {
      setError("Verbindungsfehler beim Laden der Bestellung.");
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const [isRetrying, setIsRetrying] = useState(false);

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
      }
    },
    [order]
  );

  // Polling: update order state when extraction progresses
  // The API returns OrderForReview; the polling hook types it as OrderWithDealer.
  const handleOrderUpdated = useCallback((updatedOrder: OrderWithDealer) => {
    setOrder(updatedOrder as OrderForReview);
  }, []);

  // OPH-6: Handle successful export — update local state to reflect "exported" status
  const handleExported = useCallback(() => {
    if (order) {
      setOrder({
        ...order,
        status: "exported",
        last_exported_at: new Date().toISOString(),
      });
    }
  }, [order]);

  // OPH-12: Navigate back to orders list after successful deletion
  const handleDeleted = useCallback(() => {
    router.push("/orders");
  }, [router]);

  const { isPolling } = useOrderPolling({
    orderId,
    extractionStatus: order?.extraction_status ?? null,
    orderStatus: order?.status ?? null,
    onOrderUpdated: handleOrderUpdated,
    enabled: !!order,
  });

  // Manual retry: trigger extraction again for failed orders
  const handleRetryExtraction = useCallback(async () => {
    if (!order) return;
    setIsRetrying(true);

    try {
      const res = await fetch(`/api/orders/${orderId}/extract`, {
        method: "POST",
      });
      const json = (await res.json()) as ApiResponse;

      if (!res.ok || !json.success) {
        setError(json.error ?? "Extraktion konnte nicht gestartet werden.");
        return;
      }

      // Update local state to show processing status immediately
      setOrder({
        ...order,
        extraction_status: "processing",
        extraction_error: null,
        status: "processing",
      });
    } catch {
      setError("Verbindungsfehler beim Starten der Extraktion.");
    } finally {
      setIsRetrying(false);
    }
  }, [order, orderId]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Card>
          <CardContent className="space-y-4 p-6">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-6">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/orders")}
          className="gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurueck
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

  // Empty state (should not normally happen)
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
          Zurueck
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

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/orders")}
        className="gap-1"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurueck zur Uebersicht
      </Button>

      {/* Order header with dealer info + export button */}
      <OrderDetailHeader
        order={order}
        wasExported={!!order.last_exported_at}
        onDealerChanged={handleDealerChanged}
        onExported={handleExported}
        onDeleted={handleDeleted}
        userRole={role ?? undefined}
      />

      {/* Unmapped articles warning (OPH-14) */}
      {order.has_unmapped_articles && order.dealer_id && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Artikelnummern ohne ERP-Zuordnung</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span>
              Diese Bestellung enthaelt Haendler-Artikelnummern, fuer die noch keine
              ERP-Zuordnung hinterlegt ist.
            </span>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 w-fit"
              onClick={() =>
                router.push(
                  `/settings/dealer-mappings?dealer=${order.dealer_id}`
                )
              }
            >
              Zuordnungen verwalten
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* AI Extraction Result */}
      <ExtractionResultPreview
        extractionStatus={order.extraction_status}
        extractedData={order.extracted_data}
        extractionError={order.extraction_error}
        isPolling={isPolling}
        onRetryExtraction={handleRetryExtraction}
        isRetrying={isRetrying}
        orderId={orderId}
        orderStatus={order.status}
      />

      {/* File list */}
      {order.files.length > 0 && <OrderFileList files={order.files} />}
    </div>
  );
}
