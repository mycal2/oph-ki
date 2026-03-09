"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  ErpConfigListItem,
  ErpConfigDetail,
  ErpConfigSavePayload,
  ErpConfigTestResult,
  ErpConfigVersion,
  ApiResponse,
} from "@/lib/types";

interface UseErpConfigsReturn {
  /** List of named ERP configurations. */
  configs: ErpConfigListItem[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  /** Create a new ERP config. Returns the new config ID on success. */
  createConfig: (payload: ErpConfigSavePayload) => Promise<string | null>;
  /** Duplicate an existing config. Returns the new config ID on success. */
  duplicateConfig: (configId: string) => Promise<string | null>;
  /** Delete an ERP config. Returns true on success. */
  deleteConfig: (configId: string) => Promise<boolean>;
  isMutating: boolean;
  mutationError: string | null;
  clearMutationError: () => void;
}

/**
 * Hook for the ERP config list page.
 * OPH-29: Lists named configs (not per-tenant).
 */
export function useErpConfigs(): UseErpConfigsReturn {
  const [configs, setConfigs] = useState<ErpConfigListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const fetchConfigs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setMutationError(null);

    try {
      const res = await fetch("/api/admin/erp-configs");
      const json = (await res.json()) as ApiResponse<ErpConfigListItem[]>;

      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? "ERP-Konfigurationen konnten nicht geladen werden.");
        setConfigs([]);
        return;
      }

      setConfigs(json.data);
    } catch {
      setError("Verbindungsfehler beim Laden der ERP-Konfigurationen.");
      setConfigs([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const createConfig = useCallback(
    async (payload: ErpConfigSavePayload): Promise<string | null> => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const res = await fetch("/api/admin/erp-configs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json()) as ApiResponse<{ id: string }>;

        if (!res.ok || !json.success || !json.data) {
          setMutationError(json.error ?? "Konfiguration konnte nicht erstellt werden.");
          return null;
        }

        await fetchConfigs();
        return json.data.id;
      } catch {
        setMutationError("Verbindungsfehler beim Erstellen.");
        return null;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchConfigs]
  );

  const duplicateConfig = useCallback(
    async (configId: string): Promise<string | null> => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const res = await fetch(`/api/admin/erp-configs/${configId}/duplicate`, {
          method: "POST",
        });
        const json = (await res.json()) as ApiResponse<{ id: string }>;

        if (!res.ok || !json.success || !json.data) {
          setMutationError(json.error ?? "Duplizieren fehlgeschlagen.");
          return null;
        }

        await fetchConfigs();
        return json.data.id;
      } catch {
        setMutationError("Verbindungsfehler beim Duplizieren.");
        return null;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchConfigs]
  );

  const deleteConfig = useCallback(
    async (configId: string): Promise<boolean> => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const res = await fetch(`/api/admin/erp-configs/${configId}`, {
          method: "DELETE",
        });
        const json = (await res.json()) as ApiResponse;

        if (!res.ok || !json.success) {
          setMutationError(json.error ?? "Loeschen fehlgeschlagen.");
          return false;
        }

        await fetchConfigs();
        return true;
      } catch {
        setMutationError("Verbindungsfehler beim Loeschen.");
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchConfigs]
  );

  const clearMutationError = useCallback(() => {
    setMutationError(null);
  }, []);

  return {
    configs,
    isLoading,
    error,
    refetch: fetchConfigs,
    createConfig,
    duplicateConfig,
    deleteConfig,
    isMutating,
    mutationError,
    clearMutationError,
  };
}

interface UseErpConfigDetailReturn {
  /** Full config detail. */
  detail: ErpConfigDetail | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  /** Save config (creates new version). */
  saveConfig: (payload: ErpConfigSavePayload) => Promise<boolean>;
  /** Rollback to a specific version. */
  rollbackToVersion: (versionId: string) => Promise<boolean>;
  /** Test config against sample data. */
  testConfig: (
    mode: "json" | "order",
    config: Omit<ErpConfigSavePayload, "comment" | "name" | "description">,
    jsonInput?: string,
    orderId?: string
  ) => Promise<ErpConfigTestResult | null>;
  /** Fetch approved orders for this config (for test dialog). */
  fetchApprovedOrders: () => Promise<{ id: string; order_number: string | null; created_at: string }[]>;
  isMutating: boolean;
  mutationError: string | null;
  clearMutationError: () => void;
}

/**
 * Hook for the ERP config detail page (single config by ID).
 * OPH-29: Uses configId instead of tenantId.
 */
export function useErpConfigDetail(configId: string): UseErpConfigDetailReturn {
  const [detail, setDetail] = useState<ErpConfigDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!configId) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/erp-configs/${configId}`);
      const json = (await res.json()) as ApiResponse<ErpConfigDetail>;

      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? "ERP-Konfiguration konnte nicht geladen werden.");
        setDetail(null);
        return;
      }

      setDetail(json.data);
    } catch {
      setError("Verbindungsfehler beim Laden der ERP-Konfiguration.");
      setDetail(null);
    } finally {
      setIsLoading(false);
    }
  }, [configId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const saveConfig = useCallback(
    async (payload: ErpConfigSavePayload): Promise<boolean> => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const res = await fetch(`/api/admin/erp-configs/${configId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json()) as ApiResponse;

        if (!res.ok || !json.success) {
          setMutationError(json.error ?? "Konfiguration konnte nicht gespeichert werden.");
          return false;
        }

        await fetchDetail();
        return true;
      } catch {
        setMutationError("Verbindungsfehler beim Speichern.");
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [configId, fetchDetail]
  );

  const rollbackToVersion = useCallback(
    async (versionId: string): Promise<boolean> => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const res = await fetch(
          `/api/admin/erp-configs/${configId}/rollback/${versionId}`,
          { method: "POST" }
        );
        const json = (await res.json()) as ApiResponse;

        if (!res.ok || !json.success) {
          setMutationError(json.error ?? "Rollback fehlgeschlagen.");
          return false;
        }

        await fetchDetail();
        return true;
      } catch {
        setMutationError("Verbindungsfehler beim Rollback.");
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [configId, fetchDetail]
  );

  const testConfig = useCallback(
    async (
      mode: "json" | "order",
      config: Omit<ErpConfigSavePayload, "comment" | "name" | "description">,
      jsonInput?: string,
      orderId?: string
    ): Promise<ErpConfigTestResult | null> => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const res = await fetch(`/api/admin/erp-configs/${configId}/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, config, jsonInput, orderId }),
        });
        const json = (await res.json()) as ApiResponse<ErpConfigTestResult>;

        if (!res.ok || !json.success || !json.data) {
          setMutationError(json.error ?? "Test fehlgeschlagen.");
          return null;
        }

        return json.data;
      } catch {
        setMutationError("Verbindungsfehler beim Testen.");
        return null;
      } finally {
        setIsMutating(false);
      }
    },
    [configId]
  );

  const fetchApprovedOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/erp-configs/${configId}/orders`);
      const json = (await res.json()) as ApiResponse<
        { id: string; order_number: string | null; created_at: string }[]
      >;

      if (!res.ok || !json.success || !json.data) {
        return [];
      }

      return json.data;
    } catch {
      return [];
    }
  }, [configId]);

  const clearMutationError = useCallback(() => {
    setMutationError(null);
  }, []);

  return {
    detail,
    isLoading,
    error,
    refetch: fetchDetail,
    saveConfig,
    rollbackToVersion,
    testConfig,
    fetchApprovedOrders,
    isMutating,
    mutationError,
    clearMutationError,
  };
}

/**
 * Helper to extract versions from detail for display.
 */
export function sortVersionsDesc(versions: ErpConfigVersion[]): ErpConfigVersion[] {
  return [...versions].sort((a, b) => b.version_number - a.version_number);
}
