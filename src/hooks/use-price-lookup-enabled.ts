"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiResponse } from "@/lib/types";

/**
 * OPH-104 / OPH-109: Returns whether the current tenant has the Price Lookup
 * add-on enabled. Used to conditionally render discount/price UI such as the
 * "Rabattierter Preis" column on the order review page.
 *
 * Returns `null` while loading or on error so callers can gate rendering
 * conservatively (i.e. don't show the column until we know for sure).
 */
interface PriceLookupSettingsResponse {
  price_lookup_enabled: boolean;
}

interface UsePriceLookupEnabledResult {
  enabled: boolean | null;
  isLoading: boolean;
  error: string | null;
}

export function usePriceLookupEnabled(): UsePriceLookupEnabledResult {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch("/api/settings/price-lookup");
      const json = (await res.json()) as ApiResponse<PriceLookupSettingsResponse>;

      if (!res.ok || !json.success || !json.data) {
        setEnabled(false);
        setError(json.error ?? "Status konnte nicht geladen werden.");
        return;
      }

      setEnabled(json.data.price_lookup_enabled);
    } catch {
      setEnabled(false);
      setError("Verbindungsfehler beim Laden des Status.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return { enabled, isLoading, error };
}
