"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, FileSpreadsheet, Settings } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import type { ErpConfigListItem, ExportFormat, ErpFallbackMode, TenantStatus } from "@/lib/types";

const FORMAT_LABELS: Record<ExportFormat, string> = {
  csv: "CSV",
  xml: "XML",
  json: "JSON",
};

const FALLBACK_LABELS: Record<ErpFallbackMode, { label: string; className: string }> = {
  block: { label: "Block", className: "bg-red-100 text-red-800" },
  fallback_csv: { label: "Fallback CSV", className: "bg-yellow-100 text-yellow-800" },
};

const STATUS_BADGES: Record<TenantStatus, { label: string; className: string }> = {
  active: { label: "Aktiv", className: "bg-green-100 text-green-800" },
  inactive: { label: "Inaktiv", className: "text-muted-foreground" },
  trial: { label: "Testphase", className: "bg-yellow-100 text-yellow-800" },
};

interface ErpConfigListTableProps {
  configs: ErpConfigListItem[];
  isLoading: boolean;
}

export function ErpConfigListTable({ configs, isLoading }: ErpConfigListTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return configs;
    const q = search.toLowerCase();
    return configs.filter(
      (c) =>
        c.tenant_name.toLowerCase().includes(q) ||
        c.erp_type.toLowerCase().includes(q)
    );
  }, [configs, search]);

  const configuredCount = configs.filter((c) => c.has_config).length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-64" />
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
        </div>
        <p className="text-xs text-muted-foreground">
          {configuredCount} von {configs.length} Mandanten konfiguriert
        </p>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <FileSpreadsheet className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {search ? "Keine Mandanten gefunden." : "Noch keine Mandanten vorhanden."}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mandant</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden sm:table-cell">ERP-Typ</TableHead>
                <TableHead>Format</TableHead>
                <TableHead className="hidden md:table-cell">Fallback</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Versionen</TableHead>
                <TableHead className="hidden lg:table-cell">Letzte Aenderung</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => {
                const statusBadge = STATUS_BADGES[item.tenant_status];
                return (
                  <TableRow
                    key={item.tenant_id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/admin/erp-configs/${item.tenant_id}`)}
                  >
                    <TableCell>
                      <span className="font-medium">{item.tenant_name}</span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge
                        variant={item.tenant_status === "inactive" ? "outline" : "secondary"}
                        className={`text-xs ${statusBadge.className}`}
                      >
                        {statusBadge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="secondary" className="text-xs">
                        {item.erp_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.has_config && item.format ? (
                        <Badge variant="secondary" className="text-xs">
                          {FORMAT_LABELS[item.format]}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {item.has_config && item.fallback_mode ? (
                        <Badge
                          variant="outline"
                          className={`text-xs ${FALLBACK_LABELS[item.fallback_mode].className}`}
                        >
                          {FALLBACK_LABELS[item.fallback_mode].label}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums hidden sm:table-cell">
                      {item.version_count}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {item.last_updated
                        ? new Date(item.last_updated).toLocaleDateString("de-DE", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "--"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/admin/erp-configs/${item.tenant_id}`);
                        }}
                        aria-label="Konfigurieren"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
