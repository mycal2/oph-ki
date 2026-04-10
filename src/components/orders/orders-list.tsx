"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Upload,
  Loader2,
  AlertCircle,
  Building2,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";
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
import { DeleteOrderDialog } from "@/components/orders/delete-order-dialog";
import { OrdersFilterBar } from "@/components/orders/orders-filter-bar";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import type {
  OrderListItem,
  OrderStatus,
  ApiResponse,
  OrdersPageResponse,
  OrdersFilterState,
} from "@/lib/types";

const PAGE_SIZE = 25;

const STATUS_LABELS: Record<OrderStatus, string> = {
  uploaded: "Hochgeladen",
  processing: "Wird verarbeitet",
  extracted: "Extrahiert",
  review: "In Prüfung",
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

const DEFAULT_FILTERS: OrdersFilterState = {
  status: "all",
  search: "",
  dateFrom: "",
  dateTo: "",
  page: 1,
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
 * Client component that fetches and displays the orders list with
 * status filter, search, date range, and pagination.
 * OPH-18: Platform admins see a "Mandant" column and a tenant filter dropdown.
 */
export function OrdersList() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<OrdersFilterState>(DEFAULT_FILTERS);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; filename: string; fileCount: number } | null>(null);
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

  const { role, isPlatformAdmin, isLoading: isRoleLoading } = useCurrentUserRole();
  const canDelete = role === "tenant_admin" || role === "platform_admin";

  const fetchOrders = useCallback(
    async (currentFilters: OrdersFilterState, silent = false) => {
      if (!silent) setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("page", String(currentFilters.page));
        params.set("pageSize", String(PAGE_SIZE));
        if (currentFilters.status !== "all") {
          params.set("status", currentFilters.status);
        }
        if (currentFilters.search) {
          params.set("search", currentFilters.search);
        }
        if (currentFilters.dateFrom) {
          params.set("dateFrom", currentFilters.dateFrom);
        }
        if (currentFilters.dateTo) {
          params.set("dateTo", currentFilters.dateTo);
        }

        const res = await fetch(`/api/orders?${params.toString()}`);
        const json = (await res.json()) as ApiResponse<OrdersPageResponse>;

        if (!res.ok || !json.success) {
          if (!silent)
            setError(
              json.error ?? "Bestellungen konnten nicht geladen werden."
            );
          return;
        }

        if (json.data) {
          setOrders(json.data.orders);
          setTotal(json.data.total);
        }
      } catch {
        if (!silent)
          setError("Verbindungsfehler beim Laden der Bestellungen.");
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    []
  );

  // Fetch when filters change
  useEffect(() => {
    fetchOrders(filters);
  }, [filters, fetchOrders]);

  // Auto-refresh every 5s when orders are being processed
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const hasProcessingOrders = orders.some(
    (o) => o.status === "uploaded" || o.status === "processing"
  );

  useEffect(() => {
    if (hasProcessingOrders) {
      pollRef.current = setInterval(
        () => fetchOrders(filtersRef.current, true),
        5000
      );
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

  // OPH-18: Fetch all tenant names for the filter dropdown (platform admins only)
  const [tenantOptions, setTenantOptions] = useState<string[]>([]);
  useEffect(() => {
    if (!isPlatformAdmin) return;
    (async () => {
      try {
        const res = await fetch("/api/admin/tenants");
        const json = await res.json();
        if (json.success && json.data) {
          const names = (json.data as Array<{ name: string }>)
            .map((t) => t.name)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "de"));
          setTenantOptions(names);
        }
      } catch {
        // Silently fall back to no tenant filter
      }
    })();
  }, [isPlatformAdmin]);

  // OPH-18: Client-side tenant filter (admins only, on top of server filters)
  const filteredOrders = useMemo(() => {
    if (!isPlatformAdmin || selectedTenant === ALL_TENANTS) {
      return orders;
    }
    return orders.filter((o) => o.tenant_name === selectedTenant);
  }, [orders, selectedTenant, isPlatformAdmin]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handlePageChange = useCallback(
    (newPage: number) => {
      setFilters((prev) => ({ ...prev, page: newPage }));
    },
    []
  );

  if (isRoleLoading) {
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
        <OrdersFilterBar filters={filters} onFiltersChange={setFilters} />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => fetchOrders(filters)}>
          <Loader2 className="h-4 w-4 mr-2" />
          Erneut versuchen
        </Button>
      </div>
    );
  }

  // Show empty state only when there are no filters active and no orders
  const hasActiveFilters =
    filters.status !== "all" ||
    filters.search !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  if (!isLoading && orders.length === 0 && !hasActiveFilters) {
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
      {/* Filter bar */}
      <OrdersFilterBar filters={filters} onFiltersChange={setFilters} />

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
              {filteredOrders.length}{" "}
              {filteredOrders.length === 1
                ? "Bestellung"
                : "Bestellungen"}
            </span>
          )}
        </div>
      )}

      {/* Loading skeleton for table */}
      {isLoading ? (
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
      ) : (
        <>
          {/* Orders table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datei</TableHead>
                  {isPlatformAdmin && (
                    <TableHead className="hidden lg:table-cell">
                      Mandant
                    </TableHead>
                  )}
                  <TableHead className="hidden sm:table-cell">
                    Händler
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    Hochgeladen von
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Datum</TableHead>
                  {canDelete && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={(isPlatformAdmin ? 6 : 5) + (canDelete ? 1 : 0)}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {hasActiveFilters
                        ? "Keine Bestellungen für die aktiven Filter gefunden. Versuchen Sie, die Filter anzupassen."
                        : "Keine Bestellungen gefunden."}
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
                            {order.primary_filename ??
                              "Unbekannte Datei"}
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
                          <Badge
                            variant={STATUS_VARIANTS[order.status]}
                            className="text-xs w-fit gap-1"
                          >
                            {(order.status === "uploaded" ||
                              order.status === "processing") && (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            )}
                            {STATUS_LABELS[order.status]}
                          </Badge>
                          {order.extraction_status &&
                            order.extraction_status !== "extracted" && (
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
                      {canDelete && (
                        <TableCell className="text-right p-1">
                          {order.status !== "processing" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                              aria-label="Bestellung löschen"
                              onClick={(e) => {
                                e.preventDefault();
                                setDeleteTarget({
                                  id: order.id,
                                  filename: order.primary_filename ?? "Unbekannte Datei",
                                  fileCount: order.file_count,
                                });
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination controls */}
          {total > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {total} {total === 1 ? "Bestellung" : "Bestellungen"} gesamt
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(filters.page - 1)}
                  disabled={filters.page <= 1}
                  aria-label="Vorherige Seite"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Zurück
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  Seite {filters.page} von {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(filters.page + 1)}
                  disabled={filters.page >= totalPages}
                  aria-label="Nächste Seite"
                >
                  Weiter
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* OPH-12: Delete order confirmation dialog */}
      {deleteTarget && (
        <DeleteOrderDialog
          orderId={deleteTarget.id}
          fileName={deleteTarget.filename}
          fileCount={deleteTarget.fileCount}
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          onDeleted={() => {
            setDeleteTarget(null);
            fetchOrders(filters);
          }}
        />
      )}
    </div>
  );
}
