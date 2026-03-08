"use client";

import { useState, useCallback, useEffect } from "react";
import type {
  TenantOutputFormat,
  OutputFormatParseResponse,
  ApiResponse,
} from "@/lib/types";

interface UseOutputFormatReturn {
  /** Current output format for the tenant, null if none assigned. */
  format: TenantOutputFormat | null;
  /** Whether the format is loading. */
  isLoading: boolean;
  /** Error message, if any. */
  error: string | null;
  /** Whether a mutation is in progress. */
  isMutating: boolean;
  /** Mutation error message, if any. */
  mutationError: string | null;
  /** Re-fetch the current format. */
  refetch: () => void;
  /** Parse a sample file and return the detected schema (no save). */
  parseFile: (file: File) => Promise<OutputFormatParseResponse | null>;
  /** Save the confirmed format (upload file + store schema). */
  saveFormat: (file: File) => Promise<boolean>;
  /** Delete the current format. */
  deleteFormat: () => Promise<boolean>;
  /** Clear mutation error. */
  clearMutationError: () => void;
}

/**
 * Hook for managing tenant output format samples (OPH-28).
 */
export function useOutputFormat(tenantId: string): UseOutputFormatReturn {
  const [format, setFormat] = useState<TenantOutputFormat | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const fetchFormat = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/output-formats/${tenantId}`);

      if (res.status === 404) {
        // No format assigned yet — this is a valid state
        setFormat(null);
        return;
      }

      const json = (await res.json()) as ApiResponse<TenantOutputFormat>;

      if (!res.ok || !json.success) {
        setError(json.error ?? "Output-Format konnte nicht geladen werden.");
        setFormat(null);
        return;
      }

      setFormat(json.data ?? null);
    } catch {
      setError("Verbindungsfehler beim Laden des Output-Formats.");
      setFormat(null);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchFormat();
  }, [fetchFormat]);

  const parseFile = useCallback(
    async (file: File): Promise<OutputFormatParseResponse | null> => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(
          `/api/admin/output-formats/${tenantId}/parse`,
          {
            method: "POST",
            body: formData,
          }
        );
        const json = (await res.json()) as ApiResponse<OutputFormatParseResponse>;

        if (!res.ok || !json.success || !json.data) {
          setMutationError(json.error ?? "Datei konnte nicht analysiert werden.");
          return null;
        }

        return json.data;
      } catch {
        setMutationError("Verbindungsfehler beim Analysieren der Datei.");
        return null;
      } finally {
        setIsMutating(false);
      }
    },
    [tenantId]
  );

  const saveFormat = useCallback(
    async (file: File): Promise<boolean> => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`/api/admin/output-formats/${tenantId}`, {
          method: "POST",
          body: formData,
        });
        const json = (await res.json()) as ApiResponse;

        if (!res.ok || !json.success) {
          setMutationError(json.error ?? "Output-Format konnte nicht gespeichert werden.");
          return false;
        }

        await fetchFormat();
        return true;
      } catch {
        setMutationError("Verbindungsfehler beim Speichern.");
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [tenantId, fetchFormat]
  );

  const deleteFormat = useCallback(async (): Promise<boolean> => {
    setIsMutating(true);
    setMutationError(null);

    try {
      const res = await fetch(`/api/admin/output-formats/${tenantId}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as ApiResponse;

      if (!res.ok || !json.success) {
        setMutationError(json.error ?? "Output-Format konnte nicht geloescht werden.");
        return false;
      }

      setFormat(null);
      return true;
    } catch {
      setMutationError("Verbindungsfehler beim Loeschen.");
      return false;
    } finally {
      setIsMutating(false);
    }
  }, [tenantId]);

  const clearMutationError = useCallback(() => {
    setMutationError(null);
  }, []);

  return {
    format,
    isLoading,
    error,
    isMutating,
    mutationError,
    refetch: fetchFormat,
    parseFile,
    saveFormat,
    deleteFormat,
    clearMutationError,
  };
}
