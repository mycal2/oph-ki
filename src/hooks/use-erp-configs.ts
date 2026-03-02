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
  /** List of tenants with their ERP config status. */
  configs: ErpConfigListItem[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  isMutating: boolean;
  mutationError: string | null;
}

/**
 * Hook for the ERP config list page (all tenants).
 */
export function useErpConfigs(): UseErpConfigsReturn {
  const [configs, setConfigs] = useState<ErpConfigListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMutating] = useState(false);
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

  return {
    configs,
    isLoading,
    error,
    refetch: fetchConfigs,
    isMutating,
    mutationError,
  };
}

interface UseErpConfigDetailReturn {
  /** Full config detail for one tenant. */
  detail: ErpConfigDetail | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  /** Save config (creates new version). */
  saveConfig: (payload: ErpConfigSavePayload) => Promise<boolean>;
  /** Rollback to a specific version. */
  rollbackToVersion: (versionId: string) => Promise<boolean>;
  /** Copy config from another tenant. */
  copyFromTenant: (sourceTenantId: string) => Promise<boolean>;
  /** Test config against sample data. */
  testConfig: (
    mode: "json" | "order",
    config: Omit<ErpConfigSavePayload, "comment">,
    jsonInput?: string,
    orderId?: string
  ) => Promise<ErpConfigTestResult | null>;
  /** Fetch approved orders for this tenant (for test dialog). */
  fetchApprovedOrders: () => Promise<{ id: string; order_number: string | null; created_at: string }[]>;
  isMutating: boolean;
  mutationError: string | null;
  clearMutationError: () => void;
}

/**
 * Hook for the ERP config detail page (single tenant).
 */
export function useErpConfigDetail(tenantId: string): UseErpConfigDetailReturn {
  const [detail, setDetail] = useState<ErpConfigDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/erp-configs/${tenantId}`);
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
  }, [tenantId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const saveConfig = useCallback(
    async (payload: ErpConfigSavePayload): Promise<boolean> => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const res = await fetch(`/api/admin/erp-configs/${tenantId}`, {
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
    [tenantId, fetchDetail]
  );

  const rollbackToVersion = useCallback(
    async (versionId: string): Promise<boolean> => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const res = await fetch(
          `/api/admin/erp-configs/${tenantId}/rollback/${versionId}`,
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
    [tenantId, fetchDetail]
  );

  const copyFromTenant = useCallback(
    async (sourceTenantId: string): Promise<boolean> => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const res = await fetch(
          `/api/admin/erp-configs/${tenantId}/copy-from/${sourceTenantId}`,
          { method: "POST" }
        );
        const json = (await res.json()) as ApiResponse;

        if (!res.ok || !json.success) {
          setMutationError(json.error ?? "Kopieren fehlgeschlagen.");
          return false;
        }

        await fetchDetail();
        return true;
      } catch {
        setMutationError("Verbindungsfehler beim Kopieren.");
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [tenantId, fetchDetail]
  );

  const testConfig = useCallback(
    async (
      mode: "json" | "order",
      config: Omit<ErpConfigSavePayload, "comment">,
      jsonInput?: string,
      orderId?: string
    ): Promise<ErpConfigTestResult | null> => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const res = await fetch(`/api/admin/erp-configs/${tenantId}/test`, {
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
    [tenantId]
  );

  const fetchApprovedOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/erp-configs/${tenantId}/orders`);
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
  }, [tenantId]);

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
    copyFromTenant,
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
