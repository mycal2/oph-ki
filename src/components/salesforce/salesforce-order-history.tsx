"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ClipboardList,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  Package,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { useSfBasePath } from "@/hooks/use-sf-base-path";
import type {
  SalesforceOrderListItem,
  SalesforceOrderListResponse,
  ApiResponse,
  OrderStatus,
} from "@/lib/types";

const PAGE_SIZE = 20;

/** OPH-88: Date preset options for filtering orders. */
type DatePreset = "" | "thisMonth" | "last3Months" | "thisYear";

const DATE_PRESET_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: "", label: "Alle" },
  { value: "thisMonth", label: "Dieser Monat" },
  { value: "last3Months", label: "Letzte 3 Monate" },
  { value: "thisYear", label: "Dieses Jahr" },
];

interface SalesforceOrderHistoryProps {
  slug: string;
  /** OPH-88: When true, show search input and date filter. Default: false. */
  showSearch?: boolean;
}

/** Maps order status to a German label and badge variant. */
function getStatusDisplay(status: OrderStatus): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  switch (status) {
    case "extracted":
      return { label: "Eingereicht", variant: "default" };
    case "review":
    case "checked":
      return { label: "In Prüfung", variant: "secondary" };
    case "approved":
    case "exported":
      return { label: "Exportiert", variant: "outline" };
    case "error":
      return { label: "Fehler", variant: "destructive" };
    default:
      return { label: "Verarbeitung", variant: "secondary" };
  }
}

/** Formats a date string to a readable German date (e.g. "18. Apr 2026, 14:30"). */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("de-DE", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

/**
 * OPH-81: Order history list for the Salesforce App.
 *
 * Shows past orders by the current sales rep, sorted newest first.
 * Supports "Mehr laden" pagination (20 per page).
 * Includes loading skeletons, error state, and empty state.
 */
export function SalesforceOrderHistory({
  slug,
  showSearch = false,
}: SalesforceOrderHistoryProps) {
  const basePath = useSfBasePath(slug);

  const [orders, setOrders] = useState<SalesforceOrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OPH-88: Search & filter state
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // BUG-5 fix: ref tracks latest datePreset so the debounced callback always reads the current value
  const datePresetRef = useRef<DatePreset>(datePreset);

  /** Whether any filter is currently active. */
  const isFilterActive = activeSearch !== "" || datePreset !== "";

  const fetchOrders = useCallback(
    async (
      pageNum: number,
      append: boolean,
      search: string = "",
      preset: DatePreset = ""
    ) => {
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
        const params = new URLSearchParams({ page: pageNum.toString() });
        if (search) params.set("search", search);
        if (preset) params.set("datePreset", preset);

        const res = await fetch(`/api/sf/orders?${params}`, {
          signal: controller.signal,
        });
        const json: ApiResponse<SalesforceOrderListResponse> = await res.json();

        // Ignore stale responses
        if (controller.signal.aborted) return;

        if (!json.success) {
          setError(json.error ?? "Bestellungen konnten nicht geladen werden.");
          return;
        }

        const newOrders = json.data!.orders;
        if (append) {
          setOrders((prev) => [...prev, ...newOrders]);
        } else {
          setOrders(newOrders);
        }
        setTotal(json.data!.total);
      } catch (err) {
        // Ignore abort errors
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Netzwerkfehler beim Laden der Bestellungen.");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    fetchOrders(1, false);
  }, [fetchOrders]);

  // OPH-88: Debounced search — fires 400ms after user stops typing
  useEffect(() => {
    if (!showSearch) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = searchInput.trim();

    debounceTimerRef.current = setTimeout(() => {
      if (trimmed !== activeSearch) {
        setActiveSearch(trimmed);
        setPage(1);
        setOrders([]);
        // BUG-5 fix: read datePreset from ref to avoid stale closure value
        fetchOrders(1, false, trimmed, datePresetRef.current);
      }
    }, 400);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
    // activeSearch intentionally omitted to avoid re-triggering
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, showSearch]);

  // OPH-88: Date preset changes trigger immediate fetch
  const handleDatePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    datePresetRef.current = preset;
    setPage(1);
    setOrders([]);
    fetchOrders(1, false, activeSearch, preset);
  };

  // OPH-88: Reset all filters
  const handleReset = () => {
    setSearchInput("");
    setActiveSearch("");
    setDatePreset("");
    datePresetRef.current = "";
    setPage(1);
    setOrders([]);
    fetchOrders(1, false, "", "");
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchOrders(nextPage, true, activeSearch, datePreset);
  };

  const hasMore = orders.length < total;

  // ---- SEARCH & FILTER CONTROLS (shared across states when showSearch=true) ----
  const searchFilterControls = showSearch ? (
    <div className="flex flex-col gap-3">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Kunde oder Kundennr. suchen..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          maxLength={200}
          className="pl-9 pr-9"
          aria-label="Bestellungen durchsuchen"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => setSearchInput("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Suche leeren"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Date preset selector */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {DATE_PRESET_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={datePreset === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => handleDatePresetChange(option.value)}
            className="text-xs h-8"
          >
            {option.label}
          </Button>
        ))}

        {/* Reset control */}
        {isFilterActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-xs h-8 text-muted-foreground ml-auto"
          >
            Zurücksetzen
          </Button>
        )}
      </div>
    </div>
  ) : null;

  // ---- LOADING STATE ----
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">Meine Bestellungen</h1>
        {searchFilterControls}
        <div
          className="flex flex-col gap-3"
          role="status"
          aria-label="Lade Bestellungen..."
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border p-4"
            >
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-20 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- ERROR STATE ----
  if (error && orders.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">Meine Bestellungen</h1>
        {searchFilterControls}
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button
          variant="outline"
          onClick={() => fetchOrders(1, false, activeSearch, datePreset)}
        >
          Erneut versuchen
        </Button>
      </div>
    );
  }

  // ---- EMPTY STATE ----
  if (orders.length === 0) {
    // OPH-88: When filters are active, show a different empty state
    if (isFilterActive) {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-lg font-semibold">Meine Bestellungen</h1>
          {searchFilterControls}
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium mb-1">
              Keine Bestellungen gefunden.
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Passen Sie Ihre Suche oder Filter an.
            </p>
            <Button variant="outline" size="sm" onClick={handleReset}>
              Zurücksetzen
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ClipboardList className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold mb-2">
          Noch keine Bestellungen
        </h2>
        <p className="text-sm text-muted-foreground max-w-xs mb-6">
          Sie haben noch keine Bestellungen aufgegeben. Starten Sie Ihre erste
          Bestellung.
        </p>
        <Link href={`${basePath}/order`}>
          <Button>
            <ShoppingCart className="h-4 w-4" />
            Neue Bestellung
          </Button>
        </Link>
      </div>
    );
  }

  // ---- ORDER LIST ----
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Meine Bestellungen</h1>
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? "Bestellung" : "Bestellungen"}
          {isFilterActive ? " gefunden" : " insgesamt"}
        </p>
      </div>

      {searchFilterControls}

      {/* Inline error for load-more failures */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div
        className="flex flex-col gap-3"
        role="list"
        aria-label="Bestellungen"
      >
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            basePath={basePath}
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
              Mehr laden
            </>
          )}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrderCard
// ---------------------------------------------------------------------------

interface OrderCardProps {
  order: SalesforceOrderListItem;
  basePath: string;
}

function OrderCard({ order, basePath }: OrderCardProps) {
  const { label, variant } = getStatusDisplay(order.status);

  return (
    <Link
      href={`${basePath}/orders/${order.id}`}
      role="listitem"
      className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50 active:bg-accent"
      aria-label={`Bestellung vom ${formatDate(order.createdAt)}`}
    >
      {/* Left icon */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
        <Package className="h-5 w-5 text-muted-foreground" />
      </div>

      {/* Order info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold truncate">
            {order.dealerName ?? "Unbekannter Kunde"}
          </p>
        </div>
        {order.customerNumber && (
          <p className="text-xs text-muted-foreground tabular-nums">
            Nr. {order.customerNumber}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">
            {formatDate(order.createdAt)}
          </span>
          <span className="text-xs text-muted-foreground">
            {order.lineItemCount}{" "}
            {order.lineItemCount === 1 ? "Position" : "Positionen"}
          </span>
        </div>
      </div>

      {/* Status badge + chevron */}
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant={variant} className="text-[10px] whitespace-nowrap">
          {label}
        </Badge>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  );
}
