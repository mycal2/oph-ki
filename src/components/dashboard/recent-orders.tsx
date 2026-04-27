"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { FileText, Upload, AlertCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ApiResponse,
  OrderListItem,
  OrdersPageResponse,
  OrderStatus,
} from "@/lib/types";

const STATUS_LABELS: Record<OrderStatus, string> = {
  uploaded: "Hochgeladen",
  processing: "Wird verarbeitet",
  extracted: "Extrahiert",
  review: "In Prüfung",
  checked: "Geprüft",
  clarification: "Klärung",
  approved: "Freigegeben",
  exported: "Exportiert",
  error: "Fehler",
};

const STATUS_VARIANTS: Record<
  OrderStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  uploaded: "secondary",
  processing: "default",
  extracted: "outline",
  review: "default",
  checked: "outline",
  clarification: "outline",
  approved: "default",
  exported: "secondary",
  error: "destructive",
};

/** OPH-90/93: Extra Tailwind classes for specific statuses. */
const STATUS_CLASSNAMES: Partial<Record<OrderStatus, string>> = {
  checked: "border-blue-300 bg-blue-50 text-blue-700",
  clarification: "border-amber-300 bg-amber-50 text-amber-700",
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RecentOrdersSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3 rounded-md">
          <Skeleton className="h-4 w-28 shrink-0" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24 hidden sm:block" />
          <Skeleton className="h-5 w-20 ml-auto" />
        </div>
      ))}
    </div>
  );
}

export function RecentOrders() {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/orders?pageSize=5&page=1");
      const json = (await res.json()) as ApiResponse<OrdersPageResponse>;

      if (res.ok && json.success && json.data) {
        setOrders(json.data.orders);
      } else {
        setError(
          json.error ?? "Bestellungen konnten nicht geladen werden."
        );
      }
    } catch {
      setError("Bestellungen konnten nicht geladen werden. Bitte Seite neu laden.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Letzte Bestellungen</CardTitle>
            <CardDescription>
              Ihre neuesten Bestellungen und deren Status.
            </CardDescription>
          </div>
          {orders.length > 0 && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/orders">Alle anzeigen</Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && <RecentOrdersSkeleton />}

        {!isLoading && error && (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
            <AlertCircle className="h-10 w-10 text-destructive/60" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchOrders}
            >
              <RefreshCw className="h-4 w-4" />
              Erneut versuchen
            </Button>
          </div>
        )}

        {!isLoading && !error && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
            <FileText className="h-12 w-12 text-muted-foreground/50" />
            <div>
              <p className="text-sm text-muted-foreground">
                Noch keine Bestellungen. Laden Sie Ihre erste Bestellung hoch.
              </p>
            </div>
            <Button asChild>
              <Link href="/orders/upload">
                <Upload className="h-4 w-4" />
                Bestellung hochladen
              </Link>
            </Button>
          </div>
        )}

        {!isLoading && !error && orders.length > 0 && (
          <div className="space-y-1">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="flex items-center gap-4 p-3 rounded-md hover:bg-muted/50 transition-colors group"
              >
                <span className="text-xs text-muted-foreground shrink-0 w-28 tabular-nums">
                  {formatDate(order.created_at)}
                </span>
                <span className="text-sm truncate min-w-0 flex-1">
                  {order.dealer_name ?? (
                    <span className="text-muted-foreground">--</span>
                  )}
                </span>
                <span className="text-sm text-muted-foreground truncate hidden sm:block max-w-[200px]">
                  {order.primary_filename ?? (
                    <span>--</span>
                  )}
                </span>
                {order.status === "clarification" && order.clarification_note ? (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant={STATUS_VARIANTS[order.status]}
                          className={`shrink-0 ml-auto cursor-default ${STATUS_CLASSNAMES[order.status] ?? ""}`}
                        >
                          {STATUS_LABELS[order.status]}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        {order.clarification_note}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Badge
                    variant={STATUS_VARIANTS[order.status]}
                    className={`shrink-0 ml-auto ${STATUS_CLASSNAMES[order.status] ?? ""}`}
                  >
                    {STATUS_LABELS[order.status]}
                  </Badge>
                )}
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
