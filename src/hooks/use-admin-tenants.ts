"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  TenantAdminListItem,
  Tenant,
  TenantUserListItem,
  ApiResponse,
} from "@/lib/types";
import type { CreateTenantInput, UpdateTenantInput, AdminInviteUserInput } from "@/lib/validations";

interface UseAdminTenantsReturn {
  tenants: TenantAdminListItem[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  createTenant: (data: CreateTenantInput) => Promise<Tenant | null>;
  updateTenant: (id: string, data: UpdateTenantInput) => Promise<Tenant | null>;
  fetchTenant: (id: string) => Promise<Tenant | null>;
  fetchTenantUsers: (id: string) => Promise<TenantUserListItem[]>;
  inviteUser: (tenantId: string, data: AdminInviteUserInput) => Promise<{ ok: boolean; error?: string }>;
  toggleUserStatus: (tenantId: string, userId: string, status: "active" | "inactive") => Promise<boolean>;
  exportCsv: () => Promise<void>;
  isMutating: boolean;
  mutationError: string | null;
}

export function useAdminTenants(): UseAdminTenantsReturn {
  const [tenants, setTenants] = useState<TenantAdminListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/tenants");
      const json = (await res.json()) as ApiResponse<TenantAdminListItem[]>;

      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? "Mandanten konnten nicht geladen werden.");
        setTenants([]);
        return;
      }

      setTenants(json.data);
    } catch {
      setError("Verbindungsfehler beim Laden der Mandanten.");
      setTenants([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const createTenant = useCallback(
    async (data: CreateTenantInput) => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const res = await fetch("/api/admin/tenants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const json = (await res.json()) as ApiResponse<Tenant>;

        if (!res.ok || !json.success || !json.data) {
          setMutationError(json.error ?? "Mandant konnte nicht erstellt werden.");
          return null;
        }

        await fetchTenants();
        return json.data;
      } catch {
        setMutationError("Verbindungsfehler beim Erstellen des Mandanten.");
        return null;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchTenants]
  );

  const updateTenant = useCallback(
    async (id: string, data: UpdateTenantInput) => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const res = await fetch(`/api/admin/tenants/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const json = (await res.json()) as ApiResponse<Tenant>;

        if (!res.ok || !json.success || !json.data) {
          setMutationError(json.error ?? "Mandant konnte nicht aktualisiert werden.");
          return null;
        }

        await fetchTenants();
        return json.data;
      } catch {
        setMutationError("Verbindungsfehler beim Aktualisieren des Mandanten.");
        return null;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchTenants]
  );

  const fetchTenant = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/tenants/${id}`);
      const json = (await res.json()) as ApiResponse<Tenant>;

      if (!res.ok || !json.success || !json.data) {
        return null;
      }

      return json.data;
    } catch {
      return null;
    }
  }, []);

  const fetchTenantUsers = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/tenants/${id}/users`);
      const json = (await res.json()) as ApiResponse<TenantUserListItem[]>;

      if (!res.ok || !json.success || !json.data) {
        return [];
      }

      return json.data;
    } catch {
      return [];
    }
  }, []);

  const inviteUser = useCallback(
    async (tenantId: string, data: AdminInviteUserInput) => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const res = await fetch(`/api/admin/tenants/${tenantId}/users/invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const json = (await res.json()) as ApiResponse;

        if (!res.ok || !json.success) {
          const errMsg = json.error ?? "Einladung konnte nicht gesendet werden.";
          return { ok: false, error: errMsg };
        }

        return { ok: true };
      } catch {
        return { ok: false, error: "Verbindungsfehler beim Senden der Einladung." };
      } finally {
        setIsMutating(false);
      }
    },
    []
  );

  const toggleUserStatus = useCallback(
    async (tenantId: string, userId: string, status: "active" | "inactive") => {
      setIsMutating(true);
      setMutationError(null);

      try {
        const res = await fetch(`/api/admin/tenants/${tenantId}/users/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const json = (await res.json()) as ApiResponse;

        if (!res.ok || !json.success) {
          setMutationError(json.error ?? "Benutzerstatus konnte nicht geändert werden.");
          return false;
        }

        return true;
      } catch {
        setMutationError("Verbindungsfehler beim Ändern des Benutzerstatus.");
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    []
  );

  const exportCsv = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tenants/export");
      if (!res.ok) {
        setMutationError("CSV-Export fehlgeschlagen.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mandanten-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setMutationError("Verbindungsfehler beim CSV-Export.");
    }
  }, []);

  return {
    tenants,
    isLoading,
    error,
    refetch: fetchTenants,
    createTenant,
    updateTenant,
    fetchTenant,
    fetchTenantUsers,
    inviteUser,
    toggleUserStatus,
    exportCsv,
    isMutating,
    mutationError,
  };
}
