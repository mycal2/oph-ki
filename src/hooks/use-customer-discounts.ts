"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  ApiResponse,
  CustomerDiscountTableResponse,
  CustomerDiscountTableRow,
} from "@/lib/types";

interface UseCustomerDiscountsOptions {
  customerId: string;
  /** Initial page size for the discount table. */
  pageSize?: number;
  /** When false, the hook does nothing (used to skip fetches when feature flag is off). */
  enabled?: boolean;
}

interface UseCustomerDiscountsReturn {
  rows: CustomerDiscountTableRow[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  defaultRate: number | null;
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  setPage: (page: number) => void;
  setSearch: (search: string) => void;
  /** Set/upsert the customer-level default discount rate. */
  saveDefaultRate: (rate: number) => Promise<{ ok: boolean; error?: string }>;
  /** Remove the customer-level default discount rate. */
  deleteDefaultRate: () => Promise<{ ok: boolean; error?: string }>;
  /** Set/upsert an explicit per-article override. */
  saveOverride: (articleId: string, rate: number) => Promise<{ ok: boolean; error?: string }>;
  /** Remove an explicit per-article override (row reverts to default / none). */
  deleteOverride: (articleId: string) => Promise<{ ok: boolean; error?: string }>;
  refetch: () => void;
}

/**
 * OPH-106: Manages a single customer's discount rates and the paginated
 * article-discount table (effective rate per article).
 *
 * Server contract (implemented by the backend skill):
 *  - GET    /api/customers/[id]/discount-table?page=N&pageSize=M&search=...
 *  - PUT    /api/customers/[id]/discount-default              { rate }
 *  - DELETE /api/customers/[id]/discount-default
 *  - PUT    /api/customers/[id]/article-discounts/[articleId] { rate }
 *  - DELETE /api/customers/[id]/article-discounts/[articleId]
 */
export function useCustomerDiscounts(
  options: UseCustomerDiscountsOptions
): UseCustomerDiscountsReturn {
  const { customerId, pageSize: initialPageSize = 50, enabled = true } = options;

  const [rows, setRows] = useState<CustomerDiscountTableRow[]>([]);
  const [total, setTotal] = useState(0);
  const [defaultRate, setDefaultRate] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(initialPageSize);
  const [search, setSearchState] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  const fetchTable = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
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

      const res = await fetch(
        `/api/customers/${customerId}/discount-table?${params}`
      );
      const json = (await res.json()) as ApiResponse<CustomerDiscountTableResponse>;

      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? "Fehler beim Laden der Rabattdaten.");
        setRows([]);
        setTotal(0);
        return;
      }

      setRows(json.data.rows);
      setTotal(json.data.total);
      setDefaultRate(json.data.default_rate);
    } catch {
      setError("Netzwerkfehler beim Laden der Rabattdaten.");
      setRows([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [customerId, debouncedSearch, enabled, page, pageSize]);

  useEffect(() => {
    fetchTable();
  }, [fetchTable]);

  const saveDefaultRate = useCallback(
    async (rate: number): Promise<{ ok: boolean; error?: string }> => {
      setIsMutating(true);
      try {
        const res = await fetch(
          `/api/customers/${customerId}/discount-default`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rate }),
          }
        );
        const json = (await res.json()) as ApiResponse;
        if (!res.ok || !json.success) {
          return { ok: false, error: json.error ?? "Fehler beim Speichern." };
        }
        await fetchTable();
        return { ok: true };
      } catch {
        return { ok: false, error: "Netzwerkfehler beim Speichern." };
      } finally {
        setIsMutating(false);
      }
    },
    [customerId, fetchTable]
  );

  const deleteDefaultRate = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    setIsMutating(true);
    try {
      const res = await fetch(
        `/api/customers/${customerId}/discount-default`,
        { method: "DELETE" }
      );
      const json = (await res.json()) as ApiResponse;
      if (!res.ok || !json.success) {
        return { ok: false, error: json.error ?? "Fehler beim Loeschen." };
      }
      await fetchTable();
      return { ok: true };
    } catch {
      return { ok: false, error: "Netzwerkfehler beim Loeschen." };
    } finally {
      setIsMutating(false);
    }
  }, [customerId, fetchTable]);

  const saveOverride = useCallback(
    async (
      articleId: string,
      rate: number
    ): Promise<{ ok: boolean; error?: string }> => {
      setIsMutating(true);
      try {
        const res = await fetch(
          `/api/customers/${customerId}/article-discounts/${articleId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rate }),
          }
        );
        const json = (await res.json()) as ApiResponse;
        if (!res.ok || !json.success) {
          return { ok: false, error: json.error ?? "Fehler beim Speichern." };
        }
        await fetchTable();
        return { ok: true };
      } catch {
        return { ok: false, error: "Netzwerkfehler beim Speichern." };
      } finally {
        setIsMutating(false);
      }
    },
    [customerId, fetchTable]
  );

  const deleteOverride = useCallback(
    async (articleId: string): Promise<{ ok: boolean; error?: string }> => {
      setIsMutating(true);
      try {
        const res = await fetch(
          `/api/customers/${customerId}/article-discounts/${articleId}`,
          { method: "DELETE" }
        );
        const json = (await res.json()) as ApiResponse;
        if (!res.ok || !json.success) {
          return { ok: false, error: json.error ?? "Fehler beim Loeschen." };
        }
        await fetchTable();
        return { ok: true };
      } catch {
        return { ok: false, error: "Netzwerkfehler beim Loeschen." };
      } finally {
        setIsMutating(false);
      }
    },
    [customerId, fetchTable]
  );

  return {
    rows,
    total,
    page,
    pageSize,
    search,
    defaultRate,
    isLoading,
    isMutating,
    error,
    setPage,
    setSearch,
    saveDefaultRate,
    deleteDefaultRate,
    saveOverride,
    deleteOverride,
    refetch: fetchTable,
  };
}
