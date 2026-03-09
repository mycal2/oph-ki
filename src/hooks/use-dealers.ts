"use client";

import { useState, useEffect, useCallback } from "react";
import type { DealerListItem, ApiResponse } from "@/lib/types";

interface UseDealersReturn {
  dealers: DealerListItem[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook to fetch the list of active dealers for display in dropdowns.
 * Calls GET /api/dealers.
 */
export function useDealers(): UseDealersReturn {
  const [dealers, setDealers] = useState<DealerListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDealers = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/dealers");
      const json = (await res.json()) as ApiResponse<DealerListItem[]>;

      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? "Händler konnten nicht geladen werden.");
        setDealers([]);
        return;
      }

      setDealers(json.data);
    } catch {
      setError("Verbindungsfehler beim Laden der Händler.");
      setDealers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDealers();
  }, [fetchDealers]);

  return { dealers, isLoading, error, refetch: fetchDealers };
}
