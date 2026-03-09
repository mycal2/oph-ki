"use client";

import { useState, useCallback, useEffect } from "react";
import type {
  TenantOutputFormat,
  OutputFormatParseResponse,
  FieldMapping,
  ApiResponse,
} from "@/lib/types";

interface UseOutputFormatReturn {
  /** Current output format for the config, null if none assigned. */
  format: TenantOutputFormat | null;
  isLoading: boolean;
  error: string | null;
  isMutating: boolean;
  mutationError: string | null;
  refetch: () => void;
  /** Parse a sample file and return the detected schema (no save). */
  parseFile: (file: File) => Promise<OutputFormatParseResponse | null>;
  /** Save the confirmed format (upload file + store schema). */
  saveFormat: (file: File) => Promise<boolean>;
  /** Delete the current format. */
  deleteFormat: () => Promise<boolean>;
  /** OPH-32: Save field mappings for the current output format. */
  saveFieldMappings: (mappings: FieldMapping[]) => Promise<boolean>;
  clearMutationError: () => void;
}

/**
 * Hook for managing output format samples.
 * OPH-29: Uses configId (ERP config) instead of tenantId.
 */
export function useOutputFormat(configId: string): UseOutputFormatReturn {
  const [format, setFormat] = useState<TenantOutputFormat | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const fetchFormat = useCallback(async () => {
    if (!configId) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/erp-configs/${configId}/output-format`);

      if (res.status === 404) {
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
  }, [configId]);

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
          `/api/admin/erp-configs/${configId}/output-format/parse`,
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
    [configId]
  );

  const saveFormat = useCallback(
    async (file: File): Promise<boolean> => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`/api/admin/erp-configs/${configId}/output-format`, {
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
    [configId, fetchFormat]
  );

  const deleteFormat = useCallback(async (): Promise<boolean> => {
    setIsMutating(true);
    setMutationError(null);

    try {
      const res = await fetch(`/api/admin/erp-configs/${configId}/output-format`, {
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
  }, [configId]);

  /** OPH-32: Save field mappings via PUT. */
  const saveFieldMappings = useCallback(
    async (mappings: FieldMapping[]): Promise<boolean> => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const res = await fetch(`/api/admin/erp-configs/${configId}/output-format`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field_mappings: mappings }),
        });
        const json = (await res.json()) as ApiResponse<TenantOutputFormat>;

        if (!res.ok || !json.success) {
          setMutationError(json.error ?? "Feld-Zuordnungen konnten nicht gespeichert werden.");
          return false;
        }

        // Update local state with the returned format (includes field_mappings)
        if (json.data) {
          setFormat(json.data);
        }
        return true;
      } catch {
        setMutationError("Verbindungsfehler beim Speichern der Feld-Zuordnungen.");
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [configId]
  );

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
    saveFieldMappings,
    clearMutationError,
  };
}
