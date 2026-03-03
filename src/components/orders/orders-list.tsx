"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { FileText, Upload, Loader2, AlertCircle, Building2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DealerBadge } from "@/components/orders/dealer/dealer-badge";
import { ExtractionStatusBadge } from "@/components/orders/extraction-status-badge";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import type { OrderListItem, OrderStatus, ApiResponse } from "@/lib/types";

const STATUS_LABELS: Record<OrderStatus, string> = {
  uploaded: "Hochgeladen",
  processing: "Wird verarbeitet",
  extracted: "Extrahiert",
  review: "In Pruefung",
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
  approved: "default",
  exported: "secondary",
  error: "destructive",
};

/** Sentinel value for "All tenants" in the Select component. */
const ALL_TENANTS = "__all__";

/** sessionStorage key for persisting the tenant filter across navigation. */
const TENANT_FILTER_KEY = "oph18_tenant_filter";

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
 * OPH-18: Platform admins see a "Mandant" column and a tenant filter dropdown.
 */
export function OrdersList() {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<string>(() => {
    if (typeof window === "undefined") return ALL_TENANTS;
    return sessionStorage.getItem(TENANT_FILTER_KEY) ?? ALL_TENANTS;
  });

  const handleTenantChange = useCallback((value: string) => {
    setSelectedTenant(value);
    if (value === ALL_TENANTS) {
      sessionStorage.removeItem(TENANT_FILTER_KEY);
    } else {
      sessionStorage.setItem(TENANT_FILTER_KEY, value);
    }
  }, []);

  const { isPlatformAdmin, isLoading: isRoleLoading } = useCurrentUserRole();

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/orders?limit=50");
      const json = (await res.json()) as ApiResponse<OrderListItem[]>;

      if (!res.ok || !json.success) {
        if (!silent) setError(json.error ?? "Bestellungen konnten nicht geladen werden.");
        return;
      }

      setOrders(json.data ?? []);
    } catch {
      if (!silent) setError("Verbindungsfehler beim Laden der Bestellungen.");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Auto-refresh every 5s when orders are being processed
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasProcessingOrders = orders.some(
    (o) => o.status === "uploaded" || o.status === "processing"
  );

  useEffect(() => {
    if (hasProcessingOrders) {
      pollRef.current = setInterval(() => fetchOrders(true), 5000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [hasProcessingOrders, fetchOrders]);

  // OPH-18: Derive unique tenant names from orders for the filter dropdown
  const tenantOptions = useMemo(() => {
    if (!isPlatformAdmin) return [];
    const names = new Set<string>();
    for (const order of orders) {
      if (order.tenant_name) {
        names.add(order.tenant_name);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "de"));
  }, [orders, isPlatformAdmin]);

  // OPH-18: Client-side tenant filter
  const filteredOrders = useMemo(() => {
    if (!isPlatformAdmin || selectedTenant === ALL_TENANTS) {
      return orders;
    }
    return orders.filter((o) => o.tenant_name === selectedTenant);
  }, [orders, selectedTenant, isPlatformAdmin]);

  if (isLoading || isRoleLoading) {
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
        <Button variant="outline" onClick={() => fetchOrders()}>
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
    <div className="space-y-4">
      {/* OPH-18: Admin-only tenant filter toolbar */}
      {isPlatformAdmin && tenantOptions.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Mandant:</span>
          </div>
          <Select
            value={selectedTenant}
            onValueChange={handleTenantChange}
          >
            <SelectTrigger
              className="w-[220px]"
              aria-label="Mandant filtern"
            >
              <SelectValue placeholder="Alle Mandanten" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TENANTS}>Alle Mandanten</SelectItem>
              {tenantOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedTenant !== ALL_TENANTS && (
            <span className="text-xs text-muted-foreground">
              {filteredOrders.length} {filteredOrders.length === 1 ? "Bestellung" : "Bestellungen"}
            </span>
          )}
        </div>
      )}

      {/* Orders table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datei</TableHead>
              {isPlatformAdmin && (
                <TableHead className="hidden lg:table-cell">Mandant</TableHead>
              )}
              <TableHead className="hidden sm:table-cell">Haendler</TableHead>
              <TableHead className="hidden md:table-cell">Hochgeladen von</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Datum</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={isPlatformAdmin ? 6 : 5}
                  className="h-24 text-center text-muted-foreground"
                >
                  Keine Bestellungen gefunden.
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((order) => (
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
                  {isPlatformAdmin && (
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {order.tenant_name ?? "\u2014"}
                    </TableCell>
                  )}
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
                      <Badge variant={STATUS_VARIANTS[order.status]} className="text-xs w-fit gap-1">
                        {(order.status === "uploaded" || order.status === "processing") && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
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
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
