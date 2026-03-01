"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  DealerAdminListItem,
  Dealer,
  DealerAuditLogEntry,
  DealerRuleConflict,
  TestRecognitionResult,
  ApiResponse,
} from "@/lib/types";
import type { CreateDealerInput, UpdateDealerInput } from "@/lib/validations";

interface UseAdminDealersReturn {
  dealers: DealerAdminListItem[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  createDealer: (
    data: CreateDealerInput
  ) => Promise<{ dealer: Dealer; warnings: DealerRuleConflict[] } | null>;
  updateDealer: (
    id: string,
    data: UpdateDealerInput
  ) => Promise<{ dealer: Dealer; warnings: DealerRuleConflict[] } | null>;
  deleteDealer: (id: string) => Promise<boolean>;
  fetchDealer: (id: string) => Promise<Dealer | null>;
  fetchAuditLog: (id: string) => Promise<DealerAuditLogEntry[]>;
  testRecognition: (file: File) => Promise<TestRecognitionResult | null>;
  isMutating: boolean;
  mutationError: string | null;
}

export function useAdminDealers(): UseAdminDealersReturn {
  const [dealers, setDealers] = useState<DealerAdminListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const fetchDealers = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/dealers");
      const json = (await res.json()) as ApiResponse<DealerAdminListItem[]>;

      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? "Haendler konnten nicht geladen werden.");
        setDealers([]);
        return;
      }

      setDealers(json.data);
    } catch {
      setError("Verbindungsfehler beim Laden der Haendler.");
      setDealers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDealers();
  }, [fetchDealers]);

  const createDealer = useCallback(
    async (data: CreateDealerInput) => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const res = await fetch("/api/admin/dealers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const json = (await res.json()) as ApiResponse<{
          dealer: Dealer;
          warnings: DealerRuleConflict[];
        }>;

        if (!res.ok || !json.success || !json.data) {
          setMutationError(json.error ?? "Haendler konnte nicht erstellt werden.");
          return null;
        }

        await fetchDealers();
        return json.data;
      } catch {
        setMutationError("Verbindungsfehler beim Erstellen des Haendlers.");
        return null;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchDealers]
  );

  const updateDealer = useCallback(
    async (id: string, data: UpdateDealerInput) => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const res = await fetch(`/api/admin/dealers/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const json = (await res.json()) as ApiResponse<{
          dealer: Dealer;
          warnings: DealerRuleConflict[];
        }>;

        if (!res.ok || !json.success || !json.data) {
          setMutationError(json.error ?? "Haendler konnte nicht aktualisiert werden.");
          return null;
        }

        await fetchDealers();
        return json.data;
      } catch {
        setMutationError("Verbindungsfehler beim Aktualisieren des Haendlers.");
        return null;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchDealers]
  );

  const deleteDealer = useCallback(
    async (id: string) => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const res = await fetch(`/api/admin/dealers/${id}`, {
          method: "DELETE",
        });
        const json = (await res.json()) as ApiResponse;

        if (!res.ok || !json.success) {
          setMutationError(json.error ?? "Haendler konnte nicht deaktiviert werden.");
          return false;
        }

        await fetchDealers();
        return true;
      } catch {
        setMutationError("Verbindungsfehler beim Deaktivieren des Haendlers.");
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchDealers]
  );

  const fetchDealer = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/dealers/${id}`);
      const json = (await res.json()) as ApiResponse<Dealer>;

      if (!res.ok || !json.success || !json.data) {
        return null;
      }

      return json.data;
    } catch {
      return null;
    }
  }, []);

  const fetchAuditLog = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/dealers/${id}/audit`);
      const json = (await res.json()) as ApiResponse<DealerAuditLogEntry[]>;

      if (!res.ok || !json.success || !json.data) {
        return [];
      }

      return json.data;
    } catch {
      return [];
    }
  }, []);

  const testRecognition = useCallback(async (file: File) => {
    setIsMutating(true);
    setMutationError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/dealers/test-recognition", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json()) as ApiResponse<TestRecognitionResult>;

      if (!res.ok || !json.success || !json.data) {
        setMutationError(json.error ?? "Erkennung fehlgeschlagen.");
        return null;
      }

      return json.data;
    } catch {
      setMutationError("Verbindungsfehler beim Testen der Erkennung.");
      return null;
    } finally {
      setIsMutating(false);
    }
  }, []);

  return {
    dealers,
    isLoading,
    error,
    refetch: fetchDealers,
    createDealer,
    updateDealer,
    deleteDealer,
    fetchDealer,
    fetchAuditLog,
    testRecognition,
    isMutating,
    mutationError,
  };
}
