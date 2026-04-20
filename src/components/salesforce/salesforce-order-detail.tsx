"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  MapPin,
  MessageSquare,
  Building2,
  Package,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBasket } from "@/hooks/use-basket";
import { useSfBasePath } from "@/hooks/use-sf-base-path";
import type {
  SalesforceOrderDetailResponse,
  ArticleCatalogPageResponse,
  ApiResponse,
  OrderStatus,
  ArticleCatalogItem,
} from "@/lib/types";

interface SalesforceOrderDetailProps {
  slug: string;
  orderId: string;
}

/** Resolved article for reorder: catalog article + desired quantity. */
interface ResolvedArticle {
  article: ArticleCatalogItem;
  quantity: number;
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

/** Formats a date string to a readable German date. */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("de-DE", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

/**
 * OPH-81: Order detail view with reorder functionality.
 *
 * Shows full order details (line items, dealer info, delivery address, notes)
 * and a "Nachbestellen" button that validates articles against the current
 * catalog before adding them to the basket.
 */
export function SalesforceOrderDetail({
  slug,
  orderId,
}: SalesforceOrderDetailProps) {
  const basePath = useSfBasePath(slug);
  const router = useRouter();
  const { addToBasket, setQuantity } = useBasket();

  const [order, setOrder] = useState<SalesforceOrderDetailResponse | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reorder state
  const [isReordering, setIsReordering] = useState(false);
  const [unavailableArticles, setUnavailableArticles] = useState<string[]>([]);
  const [showUnavailableWarning, setShowUnavailableWarning] = useState(false);

  // Mutable ref to store resolved articles while the warning dialog is shown
  const pendingArticlesRef = useRef<Map<string, ResolvedArticle> | null>(null);

  const fetchOrder = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/sf/orders/${orderId}`);
      const json: ApiResponse<SalesforceOrderDetailResponse> =
        await res.json();

      if (!json.success) {
        setError(json.error ?? "Bestellung konnte nicht geladen werden.");
        return;
      }

      setOrder(json.data!);
    } catch {
      setError("Netzwerkfehler beim Laden der Bestellung.");
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  /** Adds resolved articles to the basket, preserving original quantities. */
  function addArticlesToBasket(articles: Map<string, ResolvedArticle>) {
    for (const { article, quantity } of articles.values()) {
      addToBasket(article);
      // addToBasket sets quantity to 1 (or increments). Override with the real qty.
      if (quantity > 1) {
        setTimeout(() => setQuantity(article.id, quantity), 0);
      }
    }
  }

  /**
   * Looks up each line item in the catalog and returns found/not-found results.
   */
  async function resolveArticles(): Promise<{
    found: Map<string, ResolvedArticle>;
    notFound: string[];
  }> {
    const found = new Map<string, ResolvedArticle>();
    const notFound: string[] = [];

    if (!order) return { found, notFound };

    for (const lineItem of order.lineItems) {
      if (!lineItem.articleNumber || lineItem.articleNumber.trim() === "")
        continue;

      try {
        const params = new URLSearchParams({
          search: lineItem.articleNumber,
          page: "1",
          pageSize: "5",
        });
        const res = await fetch(`/api/articles?${params}`);
        const json: ApiResponse<ArticleCatalogPageResponse> =
          await res.json();

        if (json.success && json.data!.articles.length > 0) {
          // Prefer exact match by article number
          const exactMatch = json.data!.articles.find(
            (a) =>
              a.article_number.toLowerCase() ===
              lineItem.articleNumber!.toLowerCase()
          );
          const match = exactMatch ?? json.data!.articles[0];

          // Sum quantities when the same article appears multiple times
          const existing = found.get(match.id);
          if (existing) {
            existing.quantity += lineItem.quantity;
          } else {
            found.set(match.id, { article: match, quantity: lineItem.quantity });
          }
        } else {
          notFound.push(
            `${lineItem.articleNumber} (${lineItem.description})`
          );
        }
      } catch {
        notFound.push(
          `${lineItem.articleNumber} (${lineItem.description})`
        );
      }
    }

    return { found, notFound };
  }

  /**
   * Reorder flow:
   * 1. Validate all articles against the live catalog
   * 2. If some are unavailable, show a warning dialog
   * 3. On confirmation (or if all are available), add to basket and navigate
   */
  async function handleReorder() {
    if (!order) return;

    setIsReordering(true);
    setError(null);

    try {
      const hasArticleNumbers = order.lineItems.some(
        (item) => item.articleNumber && item.articleNumber.trim() !== ""
      );

      if (!hasArticleNumbers) {
        setError(
          "Keine Artikelnummern in dieser Bestellung vorhanden. Nachbestellung nicht möglich."
        );
        setIsReordering(false);
        return;
      }

      const { found, notFound } = await resolveArticles();

      if (found.size === 0) {
        setError(
          "Keiner der Artikel ist noch im Katalog verfügbar. Nachbestellung nicht möglich."
        );
        setIsReordering(false);
        return;
      }

      if (notFound.length > 0) {
        // Store found articles for use after dialog confirmation
        pendingArticlesRef.current = found;
        setUnavailableArticles(notFound);
        setShowUnavailableWarning(true);
        setIsReordering(false);
        return;
      }

      // All articles available — add to basket and navigate
      addArticlesToBasket(found);
      router.push(`${basePath}/basket`);
    } catch {
      setError("Fehler beim Prüfen der Artikelverfügbarkeit.");
    } finally {
      setIsReordering(false);
    }
  }

  /** Called when user confirms to proceed despite unavailable articles. */
  function handleReorderProceed() {
    setShowUnavailableWarning(false);

    const articles = pendingArticlesRef.current;
    if (articles && articles.size > 0) {
      addArticlesToBasket(articles);
      pendingArticlesRef.current = null;
      router.push(`${basePath}/basket`);
    } else {
      setError("Keine Artikel konnten zum Warenkorb hinzugefügt werden.");
    }
  }

  // ---- LOADING STATE ----
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-36" />
        <div className="space-y-3 mt-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  // ---- ERROR STATE (no order loaded) ----
  if (error && !order) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href={`${basePath}/orders`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Bestellungen
        </Link>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={fetchOrder}>
          Erneut versuchen
        </Button>
      </div>
    );
  }

  if (!order) return null;

  const { label: statusLabel, variant: statusVariant } = getStatusDisplay(
    order.status
  );

  return (
    <div className="flex flex-col pb-28">
      {/* Back button */}
      <Link
        href={`${basePath}/orders`}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Bestellungen
      </Link>

      {/* Order header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-lg font-semibold">Bestelldetails</h1>
          <Badge
            variant={statusVariant}
            className="text-[10px] whitespace-nowrap"
          >
            {statusLabel}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatDate(order.createdAt)}
        </p>
      </div>

      {/* Dealer / Customer info */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Kunde
            </span>
          </div>
          <p className="text-sm font-semibold">
            {order.dealerName ?? order.senderCompanyName ?? "Unbekannt"}
          </p>
          {order.customerNumber && (
            <p className="text-xs text-muted-foreground tabular-nums">
              Nr. {order.customerNumber}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Delivery address */}
      {order.deliveryAddress && (
        <Card className="mb-4">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Lieferadresse
              </span>
            </div>
            <p className="text-sm">
              {[
                order.deliveryAddress.company,
                order.deliveryAddress.street,
                [
                  order.deliveryAddress.postal_code,
                  order.deliveryAddress.city,
                ]
                  .filter(Boolean)
                  .join(" "),
                order.deliveryAddress.country,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {order.notes && (
        <Card className="mb-4">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Bemerkungen
              </span>
            </div>
            <p className="text-sm whitespace-pre-line">{order.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Line items */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Package className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Positionen ({order.lineItems.length})
          </span>
        </div>
        <div className="space-y-2" role="list" aria-label="Bestellpositionen">
          {order.lineItems.map((item, index) => (
            <div
              key={index}
              role="listitem"
              className="flex items-start gap-3 rounded-lg border p-3"
            >
              <div className="flex-1 min-w-0">
                {item.articleNumber && (
                  <p className="text-xs font-bold text-primary tabular-nums">
                    {item.articleNumber}
                  </p>
                )}
                <p className="text-sm leading-snug truncate">
                  {item.description}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">
                  {item.quantity} {item.unit ?? "Stk"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reorder error */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Unavailable articles warning dialog */}
      <AlertDialog
        open={showUnavailableWarning}
        onOpenChange={setShowUnavailableWarning}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Artikel nicht verfügbar
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-2">
                  {unavailableArticles.length}{" "}
                  {unavailableArticles.length === 1
                    ? "Artikel ist"
                    : "Artikel sind"}{" "}
                  nicht mehr im Katalog verfügbar und{" "}
                  {unavailableArticles.length === 1 ? "wird" : "werden"} nicht
                  in den Warenkorb übernommen:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  {unavailableArticles.map((name, i) => (
                    <li key={i}>{name}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleReorderProceed}>
              Trotzdem fortfahren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sticky footer with reorder button */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background p-4">
        <div className="mx-auto max-w-lg">
          <Button
            className="w-full font-semibold"
            onClick={handleReorder}
            disabled={isReordering}
          >
            {isReordering ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Artikel werden geprüft...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Nachbestellen
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
