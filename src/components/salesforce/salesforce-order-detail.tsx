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
import { useTranslations, useLocale } from "next-intl";
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

interface ResolvedArticle {
  article: ArticleCatalogItem;
  quantity: number;
}

type StatusKey =
  | "statusSubmitted"
  | "statusInReview"
  | "statusExported"
  | "statusError"
  | "statusProcessing";

function getStatusDisplay(status: OrderStatus): {
  key: StatusKey;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  switch (status) {
    case "extracted":
      return { key: "statusSubmitted", variant: "default" };
    case "review":
    case "checked":
      return { key: "statusInReview", variant: "secondary" };
    case "approved":
    case "exported":
      return { key: "statusExported", variant: "outline" };
    case "error":
      return { key: "statusError", variant: "destructive" };
    default:
      return { key: "statusProcessing", variant: "secondary" };
  }
}

function formatDate(dateStr: string, locale: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale === "en" ? "en-US" : "de-DE", {
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

export function SalesforceOrderDetail({
  slug,
  orderId,
}: SalesforceOrderDetailProps) {
  const t = useTranslations("salesforce.orders.detail");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const basePath = useSfBasePath(slug);
  const router = useRouter();
  const { addToBasket, setQuantity } = useBasket();

  const [order, setOrder] = useState<SalesforceOrderDetailResponse | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isReordering, setIsReordering] = useState(false);
  const [unavailableArticles, setUnavailableArticles] = useState<string[]>([]);
  const [showUnavailableWarning, setShowUnavailableWarning] = useState(false);

  const pendingArticlesRef = useRef<Map<string, ResolvedArticle> | null>(null);

  const fetchOrder = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/sf/orders/${orderId}`);
      const json: ApiResponse<SalesforceOrderDetailResponse> =
        await res.json();

      if (!json.success) {
        setError(json.error ?? t("loadError"));
        return;
      }

      setOrder(json.data!);
    } catch {
      setError(t("networkError"));
    } finally {
      setIsLoading(false);
    }
  }, [orderId, t]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  function addArticlesToBasket(articles: Map<string, ResolvedArticle>) {
    for (const { article, quantity } of articles.values()) {
      addToBasket(article);
      if (quantity > 1) {
        setTimeout(() => setQuantity(article.id, quantity), 0);
      }
    }
  }

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
          const exactMatch = json.data!.articles.find(
            (a) =>
              a.article_number.toLowerCase() ===
              lineItem.articleNumber!.toLowerCase()
          );
          const match = exactMatch ?? json.data!.articles[0];

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

  async function handleReorder() {
    if (!order) return;

    setIsReordering(true);
    setError(null);

    try {
      const hasArticleNumbers = order.lineItems.some(
        (item) => item.articleNumber && item.articleNumber.trim() !== ""
      );

      if (!hasArticleNumbers) {
        setError(t("noArticleNumbers"));
        setIsReordering(false);
        return;
      }

      const { found, notFound } = await resolveArticles();

      if (found.size === 0) {
        setError(t("allUnavailable"));
        setIsReordering(false);
        return;
      }

      if (notFound.length > 0) {
        pendingArticlesRef.current = found;
        setUnavailableArticles(notFound);
        setShowUnavailableWarning(true);
        setIsReordering(false);
        return;
      }

      addArticlesToBasket(found);
      router.push(`${basePath}/basket`);
    } catch {
      setError(t("checkAvailabilityError"));
    } finally {
      setIsReordering(false);
    }
  }

  function handleReorderProceed() {
    setShowUnavailableWarning(false);

    const articles = pendingArticlesRef.current;
    if (articles && articles.size > 0) {
      addArticlesToBasket(articles);
      pendingArticlesRef.current = null;
      router.push(`${basePath}/basket`);
    } else {
      setError(t("noneAdded"));
    }
  }

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

  if (error && !order) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href={`${basePath}/orders`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("backToOrders")}
        </Link>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={fetchOrder}>
          {t("tryAgain")}
        </Button>
      </div>
    );
  }

  if (!order) return null;

  const { key: statusKey, variant: statusVariant } = getStatusDisplay(
    order.status
  );

  return (
    <div className="flex flex-col pb-28">
      <Link
        href={`${basePath}/orders`}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("backToOrders")}
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <Badge
            variant={statusVariant}
            className="text-[10px] whitespace-nowrap"
          >
            {t(statusKey)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatDate(order.createdAt, locale)}
        </p>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t("customerSection")}
            </span>
          </div>
          <p className="text-sm font-semibold">
            {order.dealerName ?? order.senderCompanyName ?? t("customerUnknown")}
          </p>
          {order.customerNumber && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {t("customerNumberPrefix", { number: order.customerNumber })}
            </p>
          )}
        </CardContent>
      </Card>

      {order.deliveryAddress && (
        <Card className="mb-4">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("deliverySection")}
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

      {order.notes && (
        <Card className="mb-4">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("notesSection")}
              </span>
            </div>
            <p className="text-sm whitespace-pre-line">{order.notes}</p>
          </CardContent>
        </Card>
      )}

      <div className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Package className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t("itemsSection", { count: order.lineItems.length })}
          </span>
        </div>
        <div className="space-y-2" role="list" aria-label={t("itemsAriaLabel")}>
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
                  {item.quantity} {item.unit ?? t("unitFallback")}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <AlertDialog
        open={showUnavailableWarning}
        onOpenChange={setShowUnavailableWarning}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t("unavailableTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-2">
                  {t("unavailableSummary", { count: unavailableArticles.length })}
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
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReorderProceed}>
              {t("proceedAnyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                {t("checkingArticles")}
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                {t("reorder")}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
