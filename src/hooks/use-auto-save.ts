"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import type { CanonicalOrderData, AutoSaveStatus, ApiResponse, ReviewSaveResponse } from "@/lib/types";

const DEBOUNCE_MS = 2000;

interface UseAutoSaveOptions {
  orderId: string;
  /** Current updated_at for optimistic locking. Updated after each save. */
  updatedAt: string;
  /** Called when the server responds with a new updatedAt. */
  onUpdatedAt: (updatedAt: string) => void;
  /** Called when a 409 conflict is detected. */
  onConflict?: () => void;
  /** Whether auto-save is enabled. */
  enabled?: boolean;
}

/**
 * Debounced auto-save hook for the review page.
 * Sends a PATCH request 2 seconds after the last change.
 * Tracks save status for the UI indicator.
 */
export function useAutoSave({
  orderId,
  updatedAt,
  onUpdatedAt,
  onConflict,
  enabled = true,
}: UseAutoSaveOptions) {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updatedAtRef = useRef(updatedAt);
  const isSavingRef = useRef(false);

  // Keep ref in sync
  useEffect(() => {
    updatedAtRef.current = updatedAt;
  }, [updatedAt]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const saveNow = useCallback(
    async (data: CanonicalOrderData): Promise<string | null> => {
      if (isSavingRef.current) return null;
      isSavingRef.current = true;
      setStatus("saving");
      setError(null);

      try {
        const res = await fetch(`/api/orders/${orderId}/review`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewedData: data,
            updatedAt: updatedAtRef.current,
          }),
        });

        const json = (await res.json()) as ApiResponse<ReviewSaveResponse>;

        if (res.status === 409) {
          setStatus("error");
          setError("Konflikt: Die Bestellung wurde von einem anderen Benutzer geaendert.");
          onConflict?.();
          return null;
        }

        if (!res.ok || !json.success || !json.data) {
          setStatus("error");
          setError(json.error ?? "Speichern fehlgeschlagen.");
          return null;
        }

        const newUpdatedAt = json.data.updatedAt;
        onUpdatedAt(newUpdatedAt);
        updatedAtRef.current = newUpdatedAt;
        setStatus("saved");

        // Reset to idle after 3 seconds
        setTimeout(() => {
          setStatus((prev) => (prev === "saved" ? "idle" : prev));
        }, 3000);

        return newUpdatedAt;
      } catch {
        setStatus("error");
        setError("Verbindungsfehler beim Speichern.");
        return null;
      } finally {
        isSavingRef.current = false;
      }
    },
    [orderId, onUpdatedAt, onConflict]
  );

  const scheduleSave = useCallback(
    (data: CanonicalOrderData) => {
      if (!enabled) return;

      // Clear previous timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      // Schedule new save
      timerRef.current = setTimeout(() => {
        saveNow(data);
      }, DEBOUNCE_MS);
    },
    [enabled, saveNow]
  );

  // Flush: save immediately if there are pending changes (e.g., before navigating away).
  // Returns the new updatedAt if a save was performed, or null if nothing was pending.
  const flush = useCallback(
    async (data: CanonicalOrderData): Promise<string | null> => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        return saveNow(data);
      }
      return null;
    },
    [saveNow]
  );

  return {
    status,
    error,
    scheduleSave,
    flush,
  };
}
