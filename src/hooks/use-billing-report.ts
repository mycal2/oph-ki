"use client";

import { useState, useCallback } from "react";
import type { BillingReportResponse, ApiResponse } from "@/lib/types";

interface UseBillingReportReturn {
  report: BillingReportResponse | null;
  isLoading: boolean;
  error: string | null;
  warning: string | null;
  generate: (params: {
    from: string;
    to: string;
    tenantIds: string[];
    includePrices: boolean;
  }) => Promise<void>;
  clear: () => void;
}

export function useBillingReport(): UseBillingReportReturn {
  const [report, setReport] = useState<BillingReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const generate = useCallback(
    async (params: {
      from: string;
      to: string;
      tenantIds: string[];
      includePrices: boolean;
    }) => {
      setIsLoading(true);
      setError(null);
      setWarning(null);
      setReport(null);

      try {
        const res = await fetch("/api/admin/reports/billing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });

        const json = (await res.json()) as ApiResponse<BillingReportResponse>;

        if (!res.ok || !json.success || !json.data) {
          setError(json.error ?? "Bericht konnte nicht erstellt werden.");
          return;
        }

        if (json.data.warning) {
          setWarning(json.data.warning);
        }

        setReport(json.data);
      } catch {
        setError("Verbindungsfehler beim Erstellen des Berichts.");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const clear = useCallback(() => {
    setReport(null);
    setError(null);
    setWarning(null);
  }, []);

  return { report, isLoading, error, warning, generate, clear };
}
