"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Plus, Loader2, PackageSearch, AlertCircle, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type {
  ArticleCatalogItem,
  ArticleCatalogPageResponse,
  ApiResponse,
} from "@/lib/types";
import { useBasket } from "@/hooks/use-basket";

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;
const MIN_SEARCH_LENGTH = 2;

interface ArticleSearchProps {
  /** Whether the tenant has any articles at all (checked server-side). */
  hasArticles: boolean;
}

/**
 * OPH-76: Mobile-first article search for the Salesforce App.
 *
 * Features:
 * - Prominent search bar, auto-focused on mount
 * - Debounced search (300ms, min 2 chars)
 * - Results show article number, name, packaging, size
 * - "Hinzufügen" button adds article to basket
 * - Pagination via "Weitere laden" button
 * - Loading, empty, and error states
 */
export function ArticleSearch({ hasArticles }: ArticleSearchProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [articles, setArticles] = useState<ArticleCatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { addToBasket, itemCount } = useBasket();

  // Track which articles were just added (for visual feedback)
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());

  // Auto-focus the search input on mount
  useEffect(() => {
    if (hasArticles && inputRef.current) {
      inputRef.current.focus();
    }
  }, [hasArticles]);

  // Debounce the search query
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.length < MIN_SEARCH_LENGTH) {
      setDebouncedQuery("");
      setArticles([]);
      setTotal(0);
      setHasSearched(false);
      setPage(1);
      return;
    }

    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  // Fetch articles when debounced query or page changes
  const fetchArticles = useCallback(
    async (searchQuery: string, pageNum: number, append: boolean) => {
      if (searchQuery.length < MIN_SEARCH_LENGTH) return;

      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({
          page: pageNum.toString(),
          pageSize: PAGE_SIZE.toString(),
          search: searchQuery,
        });

        const res = await fetch(`/api/articles?${params}`, {
          signal: controller.signal,
        });
        const json: ApiResponse<ArticleCatalogPageResponse> = await res.json();

        if (!json.success) {
          setError(json.error ?? "Fehler beim Laden der Artikel.");
          return;
        }

        const newArticles = json.data!.articles;

        if (append) {
          setArticles((prev) => [...prev, ...newArticles]);
        } else {
          setArticles(newArticles);
        }
        setTotal(json.data!.total);
        setHasSearched(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return; // Request was cancelled, ignore
        }
        setError("Netzwerkfehler beim Laden der Artikel.");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    []
  );

  // Trigger fetch when debounced query changes (new search)
  useEffect(() => {
    if (debouncedQuery.length >= MIN_SEARCH_LENGTH) {
      fetchArticles(debouncedQuery, 1, false);
    }
  }, [debouncedQuery, fetchArticles]);

  // Handle "load more" pagination
  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchArticles(debouncedQuery, nextPage, true);
  };

  // Handle adding to basket with visual feedback
  const handleAdd = (article: ArticleCatalogItem) => {
    addToBasket(article);
    setJustAdded((prev) => new Set(prev).add(article.id));
    setTimeout(() => {
      setJustAdded((prev) => {
        const next = new Set(prev);
        next.delete(article.id);
        return next;
      });
    }, 1200);
  };

  const hasMore = articles.length < total;
  const showHint = query.length > 0 && query.length < MIN_SEARCH_LENGTH;

  // Empty catalog state
  if (!hasArticles) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <PackageSearch className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h2 className="text-lg font-semibold mb-2">
          Noch keine Artikel vorhanden
        </h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Ihr Artikelstamm ist noch leer. Bitte wenden Sie sich an Ihren
          Administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Basket indicator (visible when items are in basket) */}
      {itemCount > 0 && (
        <div className="flex items-center justify-end">
          <Badge variant="secondary" className="text-sm font-semibold">
            {itemCount} {itemCount === 1 ? "Artikel" : "Artikel"} im Warenkorb
          </Badge>
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="search"
          placeholder="Artikel suchen (Name, Nr., GTIN...)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 h-12 text-base"
          aria-label="Artikelsuche"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Hint for short queries */}
      {showHint && (
        <p className="text-xs text-muted-foreground text-center">
          Mindestens 2 Zeichen eingeben
        </p>
      )}

      {/* Error state */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading skeleton (initial search) */}
      {isLoading && !isLoadingMore && (
        <div className="flex flex-col gap-3" role="status" aria-label="Lade Artikel...">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border p-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-9 w-28 shrink-0" />
            </div>
          ))}
        </div>
      )}

      {/* Search results */}
      {!isLoading && hasSearched && articles.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            {total} {total === 1 ? "Ergebnis" : "Ergebnisse"}
          </p>
          <div className="flex flex-col gap-3" role="list" aria-label="Suchergebnisse">
            {articles.map((article) => (
              <ArticleResultCard
                key={article.id}
                article={article}
                onAdd={handleAdd}
                justAdded={justAdded.has(article.id)}
              />
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <Button
              variant="outline"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="w-full"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Laden...
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Weitere laden
                </>
              )}
            </Button>
          )}
        </>
      )}

      {/* Empty search result */}
      {!isLoading && hasSearched && articles.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            Keine Artikel gefunden
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Versuchen Sie einen anderen Suchbegriff.
          </p>
        </div>
      )}

      {/* Initial state (no search yet) */}
      {!isLoading && !hasSearched && !showHint && query.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">
            Geben Sie einen Suchbegriff ein, um Artikel zu finden.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ArticleResultCard
// ---------------------------------------------------------------------------

interface ArticleResultCardProps {
  article: ArticleCatalogItem;
  onAdd: (article: ArticleCatalogItem) => void;
  justAdded: boolean;
}

function ArticleResultCard({ article, onAdd, justAdded }: ArticleResultCardProps) {
  // Build packaging / size detail string
  const details: string[] = [];
  if (article.packaging) details.push(article.packaging);
  if (article.size1) details.push(article.size1);
  if (article.size2) details.push(article.size2);

  return (
    <div
      role="listitem"
      className="flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors"
    >
      {/* Article info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-primary tabular-nums">
          {article.article_number}
        </p>
        <p className="text-sm font-medium leading-snug mt-0.5 break-words">
          {article.name}
        </p>
        {details.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {details.join(" / ")}
          </p>
        )}
      </div>

      {/* Add button */}
      <Button
        size="sm"
        variant={justAdded ? "secondary" : "default"}
        onClick={() => onAdd(article)}
        className="shrink-0 font-semibold transition-all"
        aria-label={`${article.name} hinzufügen`}
      >
        {justAdded ? (
          "Hinzugefügt"
        ) : (
          <>
            <Plus className="h-4 w-4" />
            Hinzufügen
          </>
        )}
      </Button>
    </div>
  );
}
