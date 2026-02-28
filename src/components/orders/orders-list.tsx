"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { FileText, Upload, Loader2, AlertCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { DealerBadge } from "@/components/orders/dealer/dealer-badge";
import { ExtractionStatusBadge } from "@/components/orders/extraction-status-badge";
import type { OrderListItem, OrderStatus, ApiResponse } from "@/lib/types";

const STATUS_LABELS: Record<OrderStatus, string> = {
  uploaded: "Hochgeladen",
  processing: "Wird verarbeitet",
  extracted: "Extrahiert",
  review: "In Pruefung",
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
  exported: "secondary",
  error: "destructive",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Client component that fetches and displays the orders list.
 */
export function OrdersList() {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/orders?limit=50");
      const json = (await res.json()) as ApiResponse<OrderListItem[]>;

      if (!res.ok || !json.success) {
        setError(json.error ?? "Bestellungen konnten nicht geladen werden.");
        return;
      }

      setOrders(json.data ?? []);
    } catch {
      setError("Verbindungsfehler beim Laden der Bestellungen.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-28 ml-auto" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={fetchOrders}>
          <Loader2 className="h-4 w-4 mr-2" />
          Erneut versuchen
        </Button>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-semibold mb-1">Noch keine Bestellungen</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Laden Sie Ihre erste Bestellung hoch, um die automatische
            Extraktion zu starten.
          </p>
          <Button asChild>
            <Link href="/orders/upload">
              <Upload className="h-4 w-4" />
              Erste Bestellung hochladen
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Datei</TableHead>
            <TableHead className="hidden sm:table-cell">Haendler</TableHead>
            <TableHead className="hidden md:table-cell">Hochgeladen von</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Datum</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id} className="group">
              <TableCell>
                <Link
                  href={`/orders/${order.id}`}
                  className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors"
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate max-w-[200px]">
                    {order.primary_filename ?? "Unbekannte Datei"}
                  </span>
                  {order.file_count > 1 && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      +{order.file_count - 1}
                    </span>
                  )}
                </Link>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <DealerBadge
                  dealerName={order.dealer_name}
                  confidence={order.recognition_confidence}
                  recognitionMethod={order.recognition_method}
                  compact
                />
              </TableCell>
              <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                {order.uploaded_by_name ?? "-"}
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <Badge variant={STATUS_VARIANTS[order.status]} className="text-xs w-fit">
                    {STATUS_LABELS[order.status]}
                  </Badge>
                  {order.extraction_status && order.extraction_status !== "extracted" && (
                    <ExtractionStatusBadge
                      status={order.extraction_status}
                      compact
                    />
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right text-sm text-muted-foreground whitespace-nowrap">
                {formatDate(order.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
