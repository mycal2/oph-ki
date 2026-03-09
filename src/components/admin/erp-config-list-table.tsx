"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, FileSpreadsheet, Settings, MoreHorizontal, Copy, Trash2 } from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Skeleton } from "@/components/ui/skeleton";
import type { ErpConfigListItem, ExportFormat, ErpFallbackMode } from "@/lib/types";

const FORMAT_LABELS: Record<ExportFormat, string> = {
  csv: "CSV",
  xml: "XML",
  json: "JSON",
};

const FALLBACK_LABELS: Record<ErpFallbackMode, { label: string; className: string }> = {
  block: { label: "Block", className: "bg-red-100 text-red-800" },
  fallback_csv: { label: "Fallback CSV", className: "bg-yellow-100 text-yellow-800" },
};

interface ErpConfigListTableProps {
  configs: ErpConfigListItem[];
  isLoading: boolean;
  onDuplicate?: (configId: string) => Promise<string | null>;
  onDelete?: (configId: string) => Promise<boolean>;
}

export function ErpConfigListTable({
  configs,
  isLoading,
  onDuplicate,
  onDelete,
}: ErpConfigListTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ErpConfigListItem | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return configs;
    const q = search.toLowerCase();
    return configs.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description?.toLowerCase().includes(q) ?? false) ||
        c.format.toLowerCase().includes(q)
    );
  }, [configs, search]);

  async function handleDuplicate(configId: string) {
    if (!onDuplicate) return;
    const newId = await onDuplicate(configId);
    if (newId) {
      router.push(`/admin/erp-configs/${newId}`);
    }
  }

  async function handleDeleteConfirm() {
    if (!onDelete || !deleteTarget) return;
    await onDelete(deleteTarget.id);
    setDeleteTarget(null);
  }

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
              placeholder="Konfigurationen suchen..."
              className="w-64 pl-9"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {configs.length} Konfiguration{configs.length !== 1 ? "en" : ""}
        </p>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <FileSpreadsheet className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {search ? "Keine Konfigurationen gefunden." : "Noch keine ERP-Konfigurationen vorhanden."}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Format</TableHead>
                <TableHead className="hidden md:table-cell">Fallback</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Mandanten</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Versionen</TableHead>
                <TableHead className="hidden lg:table-cell">Letzte Änderung</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/admin/erp-configs/${item.id}`)}
                >
                  <TableCell>
                    <div>
                      <span className="font-medium">{item.name}</span>
                      {item.description && (
                        <p className="text-xs text-muted-foreground truncate max-w-xs">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {FORMAT_LABELS[item.format]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge
                      variant="outline"
                      className={`text-xs ${FALLBACK_LABELS[item.fallback_mode].className}`}
                    >
                      {FALLBACK_LABELS[item.fallback_mode].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums hidden sm:table-cell">
                    {item.assigned_tenant_count}
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Aktionen"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          onClick={() => router.push(`/admin/erp-configs/${item.id}`)}
                        >
                          <Settings className="mr-2 h-4 w-4" />
                          Bearbeiten
                        </DropdownMenuItem>
                        {onDuplicate && (
                          <DropdownMenuItem onClick={() => handleDuplicate(item.id)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Duplizieren
                          </DropdownMenuItem>
                        )}
                        {onDelete && item.assigned_tenant_count === 0 && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(item)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Löschen
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfiguration löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Sind Sie sicher, dass Sie die Konfiguration &quot;{deleteTarget?.name}&quot; löschen möchten?
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
