"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ClipboardList,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSfBasePath } from "@/hooks/use-sf-base-path";
import type {
  SalesforceOrderListItem,
  SalesforceOrderListResponse,
  ApiResponse,
  OrderStatus,
} from "@/lib/types";

const PAGE_SIZE = 20;

interface SalesforceOrderHistoryProps {
  slug: string;
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
export function SalesforceOrderHistory({ slug }: SalesforceOrderHistoryProps) {
  const basePath = useSfBasePath(slug);

  const [orders, setOrders] = useState<SalesforceOrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({ page: pageNum.toString() });
        const res = await fetch(`/api/sf/orders?${params}`);
        const json: ApiResponse<SalesforceOrderListResponse> = await res.json();

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
      } catch {
        setError("Netzwerkfehler beim Laden der Bestellungen.");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    fetchOrders(1, false);
  }, [fetchOrders]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchOrders(nextPage, true);
  };

  const hasMore = orders.length < total;

  // ---- LOADING STATE ----
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">Meine Bestellungen</h1>
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
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => fetchOrders(1, false)}>
          Erneut versuchen
        </Button>
      </div>
    );
  }

  // ---- EMPTY STATE ----
  if (orders.length === 0) {
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
        <Link href={`${basePath}`}>
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
          {total} {total === 1 ? "Bestellung" : "Bestellungen"} insgesamt
        </p>
      </div>

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
