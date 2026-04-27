"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Upload,
  Loader2,
  AlertCircle,
  Building2,
  Store,
  ChevronLeft,
  ChevronRight,
  Smartphone,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

/** Sentinel value for "All tenants" in the Select component. */
const ALL_TENANTS = "__all__";

/** Sentinel value for "All dealers" in the Select component. */
const ALL_DEALERS = "__all__";

/** sessionStorage key for persisting the tenant filter across navigation. */
const TENANT_FILTER_KEY = "oph18_tenant_filter";

/** sessionStorage key for persisting the dealer filter across navigation. */
const DEALER_FILTER_KEY = "oph68_dealer_filter";

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
  const [selectedTenant] = useState<string>(() => {
    if (typeof window === "undefined") return ALL_TENANTS;
    return sessionStorage.getItem(TENANT_FILTER_KEY) ?? ALL_TENANTS;
  });
  const [selectedDealer] = useState<string>(() => {
    if (typeof window === "undefined") return ALL_DEALERS;
    return sessionStorage.getItem(DEALER_FILTER_KEY) ?? ALL_DEALERS;
  });
  const [filters, setFilters] = useState<OrdersFilterState>({
    ...DEFAULT_FILTERS,
    tenantId: selectedTenant,
    dealerId: selectedDealer,
  });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; filename: string; fileCount: number } | null>(null);

  const handleTenantChange = useCallback((value: string) => {
    if (value === ALL_TENANTS) {
      sessionStorage.removeItem(TENANT_FILTER_KEY);
    } else {
      sessionStorage.setItem(TENANT_FILTER_KEY, value);
    }
    // OPH-68: Reset dealer filter when tenant changes — the old dealer may not exist in the new tenant
    sessionStorage.removeItem(DEALER_FILTER_KEY);
    // OPH-18 fix: Server-side tenant filter — reset to page 1 and refetch
    setFilters((prev) => ({ ...prev, page: 1, tenantId: value, dealerId: ALL_DEALERS }));
  }, []);

  const handleDealerChange = useCallback((value: string) => {
    if (value === ALL_DEALERS) {
      sessionStorage.removeItem(DEALER_FILTER_KEY);
    } else {
      sessionStorage.setItem(DEALER_FILTER_KEY, value);
    }
    setFilters((prev) => ({ ...prev, page: 1, dealerId: value }));
  }, []);

  const { role, isPlatformAdmin, isLoading: isRoleLoading } = useCurrentUserRole();
  const canDelete = role === "tenant_admin" || role === "platform_admin";
  const canFilterByDealer = role === "tenant_admin" || role === "platform_admin";

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
        if (currentFilters.tenantId && currentFilters.tenantId !== ALL_TENANTS) {
          params.set("tenantId", currentFilters.tenantId);
        }
        if (currentFilters.dealerId && currentFilters.dealerId !== ALL_DEALERS) {
          params.set("dealerId", currentFilters.dealerId);
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

  // OPH-18: Fetch all tenants for the filter dropdown (platform admins only)
  const [tenantOptions, setTenantOptions] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!isPlatformAdmin) return;
    (async () => {
      try {
        const res = await fetch("/api/admin/tenants");
        const json = await res.json();
        if (json.success && json.data) {
          const tenants = (json.data as Array<{ id: string; name: string }>)
            .filter((t) => t.name)
            .sort((a, b) => a.name.localeCompare(b.name, "de"));
          setTenantOptions(tenants);
        }
      } catch {
        // Silently fall back to no tenant filter
      }
    })();
  }, [isPlatformAdmin]);

  // OPH-68: Fetch dealers that appear in orders for the dealer filter dropdown
  const [dealerOptions, setDealerOptions] = useState<{ id: string; name: string }[]>([]);
  const [isDealerOptionsLoading, setIsDealerOptionsLoading] = useState(false);
  useEffect(() => {
    if (!canFilterByDealer) return;
    (async () => {
      setIsDealerOptionsLoading(true);
      try {
        const params = new URLSearchParams();
        if (filters.tenantId && filters.tenantId !== ALL_TENANTS) {
          params.set("tenantId", filters.tenantId);
        }
        const res = await fetch(`/api/orders/dealers?${params.toString()}`);
        const json = await res.json();
        if (json.success && json.data) {
          setDealerOptions(json.data as Array<{ id: string; name: string }>);
        }
      } catch {
        // Silently fall back to no dealer filter options
      } finally {
        setIsDealerOptionsLoading(false);
      }
    })();
    // Re-fetch when tenant filter changes (dealer list depends on tenant scope)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFilterByDealer, filters.tenantId]);

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
    filters.dateTo !== "" ||
    (filters.dealerId !== undefined && filters.dealerId !== ALL_DEALERS);

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

      {/* OPH-18 + OPH-68: Tenant and dealer filter toolbar (same row) */}
      {(isPlatformAdmin && tenantOptions.length > 0 || canFilterByDealer) && (
        <div className="flex flex-wrap items-center gap-3">
          {/* Tenant filter — platform_admin only */}
          {isPlatformAdmin && tenantOptions.length > 0 && (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Mandant:</span>
              </div>
              <Select
                value={filters.tenantId ?? ALL_TENANTS}
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
                  {tenantOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          {/* Dealer filter — tenant_admin + platform_admin */}
          {canFilterByDealer && (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Store className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Händler:</span>
              </div>
              <Select
                value={filters.dealerId ?? ALL_DEALERS}
                onValueChange={handleDealerChange}
                disabled={isDealerOptionsLoading}
              >
                <SelectTrigger
                  className="w-[220px]"
                  aria-label="Händler filtern"
                >
                  <SelectValue placeholder="Alle Händler" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_DEALERS}>Alle Händler</SelectItem>
                  {dealerOptions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          {/* Result count when either filter is active */}
          {((filters.tenantId && filters.tenantId !== ALL_TENANTS) ||
            (filters.dealerId && filters.dealerId !== ALL_DEALERS)) && (
            <span className="text-xs text-muted-foreground">
              {total}{" "}
              {total === 1 ? "Bestellung" : "Bestellungen"}
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
                    Händler / Kunde
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
                {orders.length === 0 ? (
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
                  orders.map((order) => (
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
                        {order.source === "salesforce_app" && (
                          <Badge variant="secondary" className="mt-1 text-[10px] gap-1 w-fit">
                            <Smartphone className="h-3 w-3" />
                            Salesforce App
                          </Badge>
                        )}
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
                        {order.uploaded_by_name ?? (order.source === "salesforce_app" ? "Unbekannt" : "-")}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {order.status === "clarification" && order.clarification_note ? (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    variant={STATUS_VARIANTS[order.status]}
                                    className={`text-xs w-fit gap-1 cursor-default ${STATUS_CLASSNAMES[order.status] ?? ""}`}
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
                              className={`text-xs w-fit gap-1 ${STATUS_CLASSNAMES[order.status] ?? ""}`}
                            >
                              {(order.status === "uploaded" ||
                                order.status === "processing") && (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              )}
                              {STATUS_LABELS[order.status]}
                            </Badge>
                          )}
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
