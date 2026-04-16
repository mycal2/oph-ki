"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  ArticleCatalogItem,
  ArticleCatalogPageResponse,
  ArticleImportResult,
  ApiResponse,
} from "@/lib/types";
import type { CreateArticleInput, UpdateArticleInput } from "@/lib/validations";

interface UseArticleCatalogOptions {
  /** If provided, use admin API for this tenant (platform_admin mode). */
  adminTenantId?: string | null;
  /** Initial page size. */
  pageSize?: number;
}

interface BulkDeleteResult {
  ok: boolean;
  deleted?: number;
  error?: string;
}

interface UseArticleCatalogReturn {
  articles: ArticleCatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  isLoading: boolean;
  error: string | null;
  setPage: (page: number) => void;
  setSearch: (search: string) => void;
  createArticle: (data: CreateArticleInput) => Promise<{ ok: boolean; error?: string }>;
  updateArticle: (id: string, data: UpdateArticleInput) => Promise<{ ok: boolean; error?: string }>;
  deleteArticle: (id: string) => Promise<{ ok: boolean; error?: string }>;
  bulkDeleteArticles: (ids: string[]) => Promise<BulkDeleteResult>;
  importFile: (file: File) => Promise<{ ok: boolean; data?: ArticleImportResult; error?: string }>;
  exportCsv: () => Promise<void>;
  refetch: () => void;
}

export function useArticleCatalog(options: UseArticleCatalogOptions = {}): UseArticleCatalogReturn {
  const { adminTenantId, pageSize: initialPageSize = 50 } = options;

  const [articles, setArticles] = useState<ArticleCatalogItem[]>([]);
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
    ? `/api/admin/tenants/${adminTenantId}/articles`
    : "/api/articles";

  // Fetch articles
  const fetchArticles = useCallback(async () => {
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
      const json: ApiResponse<ArticleCatalogPageResponse> = await res.json();

      if (!json.success) {
        setError(json.error ?? "Fehler beim Laden der Artikel.");
        setArticles([]);
        setTotal(0);
        return;
      }

      setArticles(json.data!.articles);
      setTotal(json.data!.total);
    } catch {
      setError("Netzwerkfehler beim Laden der Artikel.");
      setArticles([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, page, pageSize, debouncedSearch]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  // Create single article
  const createArticle = useCallback(
    async (data: CreateArticleInput): Promise<{ ok: boolean; error?: string }> => {
      try {
        // For admin mode, use the admin base with POST
        const url = adminTenantId ? baseUrl : "/api/articles";
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const json: ApiResponse = await res.json();

        if (!json.success) {
          return { ok: false, error: json.error };
        }

        fetchArticles();
        return { ok: true };
      } catch {
        return { ok: false, error: "Netzwerkfehler beim Erstellen des Artikels." };
      }
    },
    [adminTenantId, baseUrl, fetchArticles]
  );

  // Update single article
  const updateArticle = useCallback(
    async (id: string, data: UpdateArticleInput): Promise<{ ok: boolean; error?: string }> => {
      try {
        const url = adminTenantId
          ? `/api/admin/tenants/${adminTenantId}/articles/${id}`
          : `/api/articles/${id}`;
        const res = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const json: ApiResponse = await res.json();

        if (!json.success) {
          return { ok: false, error: json.error };
        }

        fetchArticles();
        return { ok: true };
      } catch {
        return { ok: false, error: "Netzwerkfehler beim Aktualisieren des Artikels." };
      }
    },
    [adminTenantId, fetchArticles]
  );

  // Delete single article
  const deleteArticle = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const url = adminTenantId
          ? `/api/admin/tenants/${adminTenantId}/articles/${id}`
          : `/api/articles/${id}`;
        const res = await fetch(url, {
          method: "DELETE",
        });
        const json: ApiResponse = await res.json();

        if (!json.success) {
          return { ok: false, error: json.error };
        }

        fetchArticles();
        return { ok: true };
      } catch {
        return { ok: false, error: "Netzwerkfehler beim Loeschen des Artikels." };
      }
    },
    [adminTenantId, fetchArticles]
  );

  // Bulk delete articles
  const bulkDeleteArticles = useCallback(
    async (ids: string[]): Promise<BulkDeleteResult> => {
      try {
        const bulkUrl = adminTenantId
          ? `/api/admin/tenants/${adminTenantId}/articles/bulk`
          : "/api/articles/bulk";
        const res = await fetch(bulkUrl, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        const json: ApiResponse<{ deleted: number }> = await res.json();

        if (!json.success) {
          return { ok: false, error: json.error };
        }

        fetchArticles();
        return { ok: true, deleted: json.data?.deleted ?? 0 };
      } catch {
        return { ok: false, error: "Netzwerkfehler beim Loeschen der Artikel." };
      }
    },
    [adminTenantId, fetchArticles]
  );

  // Import CSV/Excel file
  const importFile = useCallback(
    async (file: File): Promise<{ ok: boolean; data?: ArticleImportResult; error?: string }> => {
      try {
        const formData = new FormData();
        formData.append("file", file);

        const importUrl = adminTenantId
          ? `/api/admin/tenants/${adminTenantId}/articles/import`
          : "/api/articles/import";

        const res = await fetch(importUrl, {
          method: "POST",
          body: formData,
        });
        const json: ApiResponse<ArticleImportResult> = await res.json();

        if (!json.success) {
          return { ok: false, error: json.error };
        }

        fetchArticles();
        return { ok: true, data: json.data! };
      } catch {
        return { ok: false, error: "Netzwerkfehler beim Importieren." };
      }
    },
    [adminTenantId, fetchArticles]
  );

  // Export CSV
  const exportCsv = useCallback(async () => {
    try {
      const exportUrl = adminTenantId
        ? `/api/admin/tenants/${adminTenantId}/articles/export`
        : "/api/articles/export";

      const res = await fetch(exportUrl);
      if (!res.ok) {
        throw new Error("Export failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "artikelstamm.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError("Fehler beim Exportieren des Artikelstamms.");
    }
  }, [adminTenantId]);

  return {
    articles,
    total,
    page,
    pageSize,
    search,
    isLoading,
    error,
    setPage,
    setSearch,
    createArticle,
    updateArticle,
    deleteArticle,
    bulkDeleteArticles,
    importFile,
    exportCsv,
    refetch: fetchArticles,
  };
}
