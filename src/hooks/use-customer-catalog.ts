"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  CustomerCatalogItem,
  CustomerCatalogPageResponse,
  CustomerImportResult,
  ApiResponse,
} from "@/lib/types";
import type { CreateCustomerInput, UpdateCustomerInput } from "@/lib/validations";

interface UseCustomerCatalogOptions {
  /** If provided, use admin API for this tenant (platform_admin mode). */
  adminTenantId?: string | null;
  /** Initial page size. */
  pageSize?: number;
}

interface UseCustomerCatalogReturn {
  customers: CustomerCatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  isLoading: boolean;
  error: string | null;
  setPage: (page: number) => void;
  setSearch: (search: string) => void;
  createCustomer: (data: CreateCustomerInput) => Promise<{ ok: boolean; error?: string }>;
  updateCustomer: (id: string, data: UpdateCustomerInput) => Promise<{ ok: boolean; error?: string }>;
  deleteCustomer: (id: string) => Promise<{ ok: boolean; error?: string }>;
  importFile: (file: File) => Promise<{ ok: boolean; data?: CustomerImportResult; error?: string }>;
  exportCsv: () => Promise<void>;
  refetch: () => void;
}

export function useCustomerCatalog(options: UseCustomerCatalogOptions = {}): UseCustomerCatalogReturn {
  const { adminTenantId, pageSize: initialPageSize = 50 } = options;

  const [customers, setCustomers] = useState<CustomerCatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(initialPageSize);
  const [search, setSearchState] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input
  const setSearch = useCallback((value: string) => {
    setSearchState(value);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }, []);

  // Build the base URL depending on tenant vs admin mode
  const baseUrl = adminTenantId
    ? `/api/admin/tenants/${adminTenantId}/customers`
    : "/api/customers";

  // Fetch customers
  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }

      const res = await fetch(`${baseUrl}?${params}`);
      const json: ApiResponse<CustomerCatalogPageResponse> = await res.json();

      if (!json.success) {
        setError(json.error ?? "Fehler beim Laden der Kunden.");
        setCustomers([]);
        setTotal(0);
        return;
      }

      setCustomers(json.data!.customers);
      setTotal(json.data!.total);
    } catch {
      setError("Netzwerkfehler beim Laden der Kunden.");
      setCustomers([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, page, pageSize, debouncedSearch]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Create single customer
  const createCustomer = useCallback(
    async (data: CreateCustomerInput): Promise<{ ok: boolean; error?: string }> => {
      try {
        const url = adminTenantId ? baseUrl : "/api/customers";
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const json: ApiResponse = await res.json();

        if (!json.success) {
          return { ok: false, error: json.error };
        }

        fetchCustomers();
        return { ok: true };
      } catch {
        return { ok: false, error: "Netzwerkfehler beim Erstellen des Kunden." };
      }
    },
    [adminTenantId, baseUrl, fetchCustomers]
  );

  // Update single customer
  const updateCustomer = useCallback(
    async (id: string, data: UpdateCustomerInput): Promise<{ ok: boolean; error?: string }> => {
      try {
        const url = adminTenantId
          ? `/api/admin/tenants/${adminTenantId}/customers/${id}`
          : `/api/customers/${id}`;
        const res = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const json: ApiResponse = await res.json();

        if (!json.success) {
          return { ok: false, error: json.error };
        }

        fetchCustomers();
        return { ok: true };
      } catch {
        return { ok: false, error: "Netzwerkfehler beim Aktualisieren des Kunden." };
      }
    },
    [adminTenantId, fetchCustomers]
  );

  // Delete single customer
  const deleteCustomer = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const url = adminTenantId
          ? `/api/admin/tenants/${adminTenantId}/customers/${id}`
          : `/api/customers/${id}`;
        const res = await fetch(url, {
          method: "DELETE",
        });
        const json: ApiResponse = await res.json();

        if (!json.success) {
          return { ok: false, error: json.error };
        }

        fetchCustomers();
        return { ok: true };
      } catch {
        return { ok: false, error: "Netzwerkfehler beim Loeschen des Kunden." };
      }
    },
    [adminTenantId, fetchCustomers]
  );

  // Import CSV/Excel file
  const importFile = useCallback(
    async (file: File): Promise<{ ok: boolean; data?: CustomerImportResult; error?: string }> => {
      try {
        const formData = new FormData();
        formData.append("file", file);

        const importUrl = adminTenantId
          ? `/api/admin/tenants/${adminTenantId}/customers/import`
          : "/api/customers/import";

        const res = await fetch(importUrl, {
          method: "POST",
          body: formData,
        });
        const json: ApiResponse<CustomerImportResult> = await res.json();

        if (!json.success) {
          return { ok: false, error: json.error };
        }

        fetchCustomers();
        return { ok: true, data: json.data! };
      } catch {
        return { ok: false, error: "Netzwerkfehler beim Importieren." };
      }
    },
    [adminTenantId, fetchCustomers]
  );

  // Export CSV
  const exportCsv = useCallback(async () => {
    try {
      const exportUrl = adminTenantId
        ? `/api/admin/tenants/${adminTenantId}/customers/export`
        : "/api/customers/export";

      const res = await fetch(exportUrl);
      if (!res.ok) {
        throw new Error("Export failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Extract filename from Content-Disposition header, fallback to default
      const disposition = res.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="([^"]+)"/);
      a.download = filenameMatch?.[1] ?? "kundenstamm.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError("Fehler beim Exportieren des Kundenstamms.");
    }
  }, [adminTenantId]);

  return {
    customers,
    total,
    page,
    pageSize,
    search,
    isLoading,
    error,
    setPage,
    setSearch,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    importFile,
    exportCsv,
    refetch: fetchCustomers,
  };
}
