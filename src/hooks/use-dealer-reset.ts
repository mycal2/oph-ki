"use client";

import { useState, useCallback } from "react";
import type { ApiResponse, DealerResetResponse } from "@/lib/types";

interface UseDealerResetReturn {
  reset: (
    orderId: string,
    updatedAt?: string
  ) => Promise<DealerResetResponse | null>;
  isSubmitting: boolean;
  error: string | null;
}

/**
 * OPH-66: Hook for resetting the dealer assignment via DELETE /api/orders/[orderId]/dealer.
 */
export function useDealerReset(): UseDealerResetReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(
    async (
      orderId: string,
      updatedAt?: string
    ): Promise<DealerResetResponse | null> => {
      setIsSubmitting(true);
      setError(null);

      try {
        const res = await fetch(`/api/orders/${orderId}/dealer`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updatedAt }),
        });

        const json = (await res.json()) as ApiResponse<DealerResetResponse>;

        if (!res.ok || !json.success || !json.data) {
          setError(json.error ?? "Händler-Zurücksetzung fehlgeschlagen.");
          return null;
        }

        return json.data;
      } catch {
        setError("Verbindungsfehler bei der Händler-Zurücksetzung.");
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  return { reset, isSubmitting, error };
}
