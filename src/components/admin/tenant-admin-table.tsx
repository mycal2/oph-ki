"use client";

import { useState, useMemo } from "react";
import { Search, Plus, Building2, MoreHorizontal, Power, PowerOff, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { TenantAdminListItem, TenantStatus, ErpType } from "@/lib/types";

const STATUS_BADGES: Record<TenantStatus, { label: string; className: string }> = {
  active: { label: "Aktiv", className: "bg-green-100 text-green-800" },
  inactive: { label: "Inaktiv", className: "text-muted-foreground" },
  trial: { label: "Testphase", className: "bg-yellow-100 text-yellow-800" },
};

const ERP_LABELS: Record<ErpType, string> = {
  SAP: "SAP",
  Dynamics365: "Dynamics 365",
  Sage: "Sage",
  Custom: "Custom",
};

interface TenantAdminTableProps {
  tenants: TenantAdminListItem[];
  isLoading: boolean;
  onCreateNew: () => void;
  onEdit: (tenantId: string) => void;
  onToggleStatus: (tenantId: string) => void;
  onExportCsv: () => void;
}

export function TenantAdminTable({
  tenants,
  isLoading,
  onCreateNew,
  onEdit,
  onToggleStatus,
  onExportCsv,
}: TenantAdminTableProps) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const filtered = useMemo(() => {
    let list = tenants;
    if (!showInactive) {
      list = list.filter((t) => t.status !== "inactive");
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.slug.toLowerCase().includes(q) ||
          t.contact_email.toLowerCase().includes(q)
      );
    }
    return list;
  }, [tenants, search, showInactive]);

  const inactiveCount = tenants.filter((t) => t.status === "inactive").length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Mandanten suchen..."
              className="w-64 pl-9"
            />
          </div>
          {inactiveCount > 0 && (
            <Button
              variant={showInactive ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowInactive(!showInactive)}
            >
              {showInactive ? "Inaktive ausblenden" : `+ ${inactiveCount} inaktive`}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onExportCsv}>
            <Download className="mr-1.5 h-4 w-4" />
            CSV exportieren
          </Button>
          <Button onClick={onCreateNew} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Neuer Mandant
          </Button>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <Building2 className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {search ? "Keine Mandanten gefunden." : "Noch keine Mandanten vorhanden."}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Slug</TableHead>
                <TableHead className="hidden sm:table-cell">ERP-Typ</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="text-right">Bestellungen</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Letzter Monat</TableHead>
                <TableHead className="hidden lg:table-cell">Letzter Upload</TableHead>
                <TableHead className="hidden lg:table-cell">Erstellt am</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((tenant) => {
                const statusBadge = STATUS_BADGES[tenant.status];
                return (
                  <TableRow
                    key={tenant.id}
                    className="cursor-pointer"
                    onClick={() => onEdit(tenant.id)}
                  >
                    <TableCell>
                      <span className="font-medium">{tenant.name}</span>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                        {tenant.contact_email}
                      </p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground font-mono">
                      {tenant.slug}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="secondary" className="text-xs">
                        {ERP_LABELS[tenant.erp_type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {tenant.status === "inactive" ? (
                        <Badge variant="outline" className={`text-xs ${statusBadge.className}`}>
                          {statusBadge.label}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className={`text-xs ${statusBadge.className}`}>
                          {statusBadge.label}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {tenant.order_count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums hidden sm:table-cell">
                      {tenant.orders_last_month}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {tenant.last_upload_at
                        ? new Date(tenant.last_upload_at).toLocaleDateString("de-DE")
                        : "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {new Date(tenant.created_at).toLocaleDateString("de-DE")}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(tenant.id)}>
                            Bearbeiten
                          </DropdownMenuItem>
                          {tenant.status !== "inactive" ? (
                            <DropdownMenuItem
                              onClick={() => onToggleStatus(tenant.id)}
                              className="text-destructive"
                            >
                              <PowerOff className="mr-2 h-4 w-4" />
                              Deaktivieren
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => onToggleStatus(tenant.id)}
                            >
                              <Power className="mr-2 h-4 w-4" />
                              Reaktivieren
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {filtered.length} von {tenants.length} Mandanten
      </p>
    </div>
  );
}
