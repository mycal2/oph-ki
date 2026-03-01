"use client";

import { useEffect, useRef, useCallback } from "react";
import type { OrderWithDealer, ApiResponse, ExtractionStatus } from "@/lib/types";

const POLLING_INTERVAL_MS = 3000;

/** Statuses that trigger polling — extraction is still in progress. */
const POLLING_STATUSES: ExtractionStatus[] = ["pending", "processing"];

interface UseOrderPollingOptions {
  /** The order ID to poll. */
  orderId: string;
  /** Current extraction status. Polling only runs while status is pending/processing. */
  extractionStatus: ExtractionStatus | null;
  /** Current order status. Polling also runs for "uploaded" orders awaiting extraction. */
  orderStatus?: string | null;
  /** Called when the order data is refreshed from the server. */
  onOrderUpdated: (order: OrderWithDealer) => void;
  /** Called if a polling request fails. */
  onError?: (message: string) => void;
  /** Whether polling is enabled. Defaults to true. */
  enabled?: boolean;
}

/**
 * Polls GET /api/orders/[orderId] every 3 seconds while extraction is in progress.
 * Also polls for "uploaded" orders where extraction hasn't started yet.
 * Automatically stops when extraction_status becomes "extracted" or "failed".
 */
export function useOrderPolling({
  orderId,
  extractionStatus,
  orderStatus,
  onOrderUpdated,
  onError,
  enabled = true,
}: UseOrderPollingOptions) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetchingRef = useRef(false);

  const isExtractionInProgress =
    extractionStatus !== null && POLLING_STATUSES.includes(extractionStatus);
  const isAwaitingExtraction =
    orderStatus === "uploaded" || orderStatus === "processing";

  const shouldPoll = enabled && (isExtractionInProgress || isAwaitingExtraction);

  const fetchOrder = useCallback(async () => {
    // Prevent overlapping requests
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const res = await fetch(`/api/orders/${orderId}`);
      const json = (await res.json()) as ApiResponse<OrderWithDealer>;

      if (!res.ok || !json.success || !json.data) {
        onError?.(json.error ?? "Polling-Fehler: Bestellung konnte nicht geladen werden.");
        return;
      }

      onOrderUpdated(json.data);
    } catch {
      onError?.("Verbindungsfehler beim Aktualisieren der Bestellung.");
    } finally {
      isFetchingRef.current = false;
    }
  }, [orderId, onOrderUpdated, onError]);

  useEffect(() => {
    if (!shouldPoll) {
      // Clear any existing interval when polling should stop
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Start polling
    intervalRef.current = setInterval(fetchOrder, POLLING_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [shouldPoll, fetchOrder]);

  return { isPolling: shouldPoll };
}
