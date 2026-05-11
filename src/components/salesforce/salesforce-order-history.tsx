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
import { useTranslations, useLocale } from "next-intl";
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

type DatePreset = "" | "thisMonth" | "last3Months" | "thisYear";

interface SalesforceOrderHistoryProps {
  slug: string;
  showSearch?: boolean;
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
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function SalesforceOrderHistory({
  slug,
  showSearch = false,
}: SalesforceOrderHistoryProps) {
  const t = useTranslations("salesforce.orders.history");
  const basePath = useSfBasePath(slug);

  const [orders, setOrders] = useState<SalesforceOrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const datePresetRef = useRef<DatePreset>(datePreset);

  const isFilterActive = activeSearch !== "" || datePreset !== "";

  const datePresetOptions: { value: DatePreset; labelKey: "datePresetAll" | "datePresetThisMonth" | "datePresetLast3Months" | "datePresetThisYear" }[] = [
    { value: "", labelKey: "datePresetAll" },
    { value: "thisMonth", labelKey: "datePresetThisMonth" },
    { value: "last3Months", labelKey: "datePresetLast3Months" },
    { value: "thisYear", labelKey: "datePresetThisYear" },
  ];

  const fetchOrders = useCallback(
    async (
      pageNum: number,
      append: boolean,
      search: string = "",
      preset: DatePreset = ""
    ) => {
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

        if (controller.signal.aborted) return;

        if (!json.success) {
          setError(json.error ?? t("loadError"));
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
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(t("networkError"));
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [t]
  );

  useEffect(() => {
    fetchOrders(1, false);
  }, [fetchOrders]);

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
        fetchOrders(1, false, trimmed, datePresetRef.current);
      }
    }, 400);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, showSearch]);

  const handleDatePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    datePresetRef.current = preset;
    setPage(1);
    setOrders([]);
    fetchOrders(1, false, activeSearch, preset);
  };

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

  const searchFilterControls = showSearch ? (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t("searchPlaceholder")}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          maxLength={200}
          className="pl-9 pr-9"
          aria-label={t("searchAriaLabel")}
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => setSearchInput("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={t("clearSearchAriaLabel")}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {datePresetOptions.map((option) => (
          <Button
            key={option.value}
            variant={datePreset === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => handleDatePresetChange(option.value)}
            className="text-xs h-8"
          >
            {t(option.labelKey)}
          </Button>
        ))}

        {isFilterActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-xs h-8 text-muted-foreground ml-auto"
          >
            {t("reset")}
          </Button>
        )}
      </div>
    </div>
  ) : null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        {searchFilterControls}
        <div
          className="flex flex-col gap-3"
          role="status"
          aria-label={t("loadingAriaLabel")}
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

  if (error && orders.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        {searchFilterControls}
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button
          variant="outline"
          onClick={() => fetchOrders(1, false, activeSearch, datePreset)}
        >
          {t("tryAgain")}
        </Button>
      </div>
    );
  }

  if (orders.length === 0) {
    if (isFilterActive) {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          {searchFilterControls}
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium mb-1">
              {t("filteredEmptyTitle")}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              {t("filteredEmptyDescription")}
            </p>
            <Button variant="outline" size="sm" onClick={handleReset}>
              {t("reset")}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ClipboardList className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold mb-2">
          {t("emptyTitle")}
        </h2>
        <p className="text-sm text-muted-foreground max-w-xs mb-6">
          {t("emptyDescription")}
        </p>
        <Link href={`${basePath}/order`}>
          <Button>
            <ShoppingCart className="h-4 w-4" />
            {t("emptyCta")}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("summary", { count: total })}
          {isFilterActive ? t("summarySuffixFiltered") : t("summarySuffixTotal")}
        </p>
      </div>

      {searchFilterControls}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div
        className="flex flex-col gap-3"
        role="list"
        aria-label={t("ordersAriaLabel")}
      >
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            basePath={basePath}
          />
        ))}
      </div>

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
              {t("loadingMore")}
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              {t("loadMore")}
            </>
          )}
        </Button>
      )}
    </div>
  );
}

interface OrderCardProps {
  order: SalesforceOrderListItem;
  basePath: string;
}

function OrderCard({ order, basePath }: OrderCardProps) {
  const t = useTranslations("salesforce.orders.history");
  const locale = useLocale();
  const { key: statusKey, variant } = getStatusDisplay(order.status);
  const formattedDate = formatDate(order.createdAt, locale);

  return (
    <Link
      href={`${basePath}/orders/${order.id}`}
      role="listitem"
      className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50 active:bg-accent"
      aria-label={t("orderCardAriaLabel", { date: formattedDate })}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
        <Package className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold truncate">
            {order.dealerName ?? t("unknownCustomer")}
          </p>
        </div>
        {order.customerNumber && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {t("customerNumberPrefix", { number: order.customerNumber })}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">
            {formattedDate}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("lineItemCount", { count: order.lineItemCount })}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Badge variant={variant} className="text-[10px] whitespace-nowrap">
          {t(statusKey)}
        </Badge>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  );
}
