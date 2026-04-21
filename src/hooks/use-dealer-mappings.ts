"use client";

import { useState, useEffect, useCallback } from "react";
import type { DealerDataMappingListItem, MappingType } from "@/lib/types";

interface UseDealerMappingsOptions {
  dealerId: string | null;
  mappingType?: MappingType | null;
  /** OPH-92: When provided (platform_admin), scope mappings to this tenant. */
  adminTenantId?: string | null;
}

export function useDealerMappings({ dealerId, mappingType, adminTenantId }: UseDealerMappingsOptions) {
  const [mappings, setMappings] = useState<DealerDataMappingListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMappings = useCallback(async () => {
    if (!dealerId) {
      setMappings([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ dealerId });
      if (mappingType) params.set("mappingType", mappingType);
      if (adminTenantId) params.set("tenantId", adminTenantId);

      const res = await fetch(`/api/dealer-mappings?${params}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error ?? "Fehler beim Laden der Zuordnungen.");
        return;
      }

      setMappings(json.data ?? []);
    } catch {
      setError("Netzwerkfehler beim Laden der Zuordnungen.");
    } finally {
      setIsLoading(false);
    }
  }, [dealerId, mappingType, adminTenantId]);

  useEffect(() => {
    fetchMappings();
  }, [fetchMappings]);

  const createMapping = useCallback(
    async (data: {
      dealerId: string;
      mappingType: MappingType;
      dealerValue: string;
      erpValue: string;
      conversionFactor?: number;
      description?: string;
      isGlobal?: boolean;
    }) => {
      const res = await fetch("/api/dealer-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, ...(adminTenantId ? { tenantId: adminTenantId } : {}) }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Fehler beim Erstellen.");
      }

      await fetchMappings();
      return json.data;
    },
    [fetchMappings, adminTenantId]
  );

  const updateMapping = useCallback(
    async (id: string, data: Record<string, unknown>) => {
      const res = await fetch(`/api/dealer-mappings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Fehler beim Aktualisieren.");
      }

      await fetchMappings();
    },
    [fetchMappings]
  );

  const deleteMapping = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/dealer-mappings/${id}`, {
        method: "DELETE",
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Fehler beim Löschen.");
      }

      await fetchMappings();
    },
    [fetchMappings]
  );

  const importCsv = useCallback(
    async (csvContent: string, importDealerId: string, importMappingType: MappingType, isGlobal?: boolean) => {
      const params = new URLSearchParams({
        dealerId: importDealerId,
        mappingType: importMappingType,
      });
      if (adminTenantId) params.set("tenantId", adminTenantId);

      const res = await fetch(`/api/dealer-mappings/import?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvContent, isGlobal: isGlobal || undefined }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Fehler beim Import.");
      }

      await fetchMappings();
      return json.data as { created: number; updated: number; errors: string[] };
    },
    [fetchMappings, adminTenantId]
  );

  return {
    mappings,
    isLoading,
    error,
    refresh: fetchMappings,
    createMapping,
    updateMapping,
    deleteMapping,
    importCsv,
  };
}
