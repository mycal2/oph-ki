"use client";

import { useState, useCallback } from "react";
import type { ApiResponse, DealerOverrideResponse } from "@/lib/types";

interface UseDealerOverrideReturn {
  override: (
    orderId: string,
    dealerId: string,
    reason?: string,
    updatedAt?: string
  ) => Promise<DealerOverrideResponse | null>;
  isSubmitting: boolean;
  error: string | null;
}

/**
 * Hook for submitting a dealer override via PATCH /api/orders/[orderId]/dealer.
 */
export function useDealerOverride(): UseDealerOverrideReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const override = useCallback(
    async (
      orderId: string,
      dealerId: string,
      reason?: string,
      updatedAt?: string
    ): Promise<DealerOverrideResponse | null> => {
      setIsSubmitting(true);
      setError(null);

      try {
        const res = await fetch(`/api/orders/${orderId}/dealer`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dealerId, reason, updatedAt }),
        });

        const json = (await res.json()) as ApiResponse<DealerOverrideResponse>;

        if (!res.ok || !json.success || !json.data) {
          setError(json.error ?? "Haendler-Zuweisung fehlgeschlagen.");
          return null;
        }

        return json.data;
      } catch {
        setError("Verbindungsfehler bei der Haendler-Zuweisung.");
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  return { override, isSubmitting, error };
}
