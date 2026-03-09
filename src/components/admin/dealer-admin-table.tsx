"use client";

import { useState, useMemo } from "react";
import { Search, Plus, Building2, MoreHorizontal, Power, PowerOff } from "lucide-react";
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
import type { DealerAdminListItem, DealerFormatType } from "@/lib/types";

const FORMAT_LABELS: Record<DealerFormatType, string> = {
  email_text: "E-Mail",
  pdf_table: "PDF",
  excel: "Excel",
  mixed: "Gemischt",
};

interface DealerAdminTableProps {
  dealers: DealerAdminListItem[];
  isLoading: boolean;
  onCreateNew: () => void;
  onEdit: (dealerId: string) => void;
  onDeactivate: (dealerId: string) => void;
}

export function DealerAdminTable({
  dealers,
  isLoading,
  onCreateNew,
  onEdit,
  onDeactivate,
}: DealerAdminTableProps) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const filtered = useMemo(() => {
    let list = dealers;
    if (!showInactive) {
      list = list.filter((d) => d.active);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.city?.toLowerCase().includes(q) ||
          d.country?.toLowerCase().includes(q) ||
          d.description?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [dealers, search, showInactive]);

  const inactiveCount = dealers.filter((d) => !d.active).length;

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
              placeholder="Händler suchen..."
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
        <Button onClick={onCreateNew} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Neuer Händler
        </Button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <Building2 className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {search ? "Keine Händler gefunden." : "Noch keine Händler vorhanden."}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Ort</TableHead>
                <TableHead className="hidden sm:table-cell">Format</TableHead>
                <TableHead className="text-right">Bestellungen</TableHead>
                <TableHead className="hidden lg:table-cell">Letzte Bestellung</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((dealer) => (
                <TableRow
                  key={dealer.id}
                  className="cursor-pointer"
                  onClick={() => onEdit(dealer.id)}
                >
                  <TableCell>
                    <span className="font-medium">{dealer.name}</span>
                    {dealer.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                        {dealer.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {[dealer.city, dealer.country].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="secondary" className="text-xs">
                      {FORMAT_LABELS[dealer.format_type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {dealer.order_count}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {dealer.last_order_at
                      ? new Date(dealer.last_order_at).toLocaleDateString("de-DE")
                      : "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {dealer.active ? (
                      <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                        Aktiv
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Inaktiv
                      </Badge>
                    )}
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
                        <DropdownMenuItem onClick={() => onEdit(dealer.id)}>
                          Bearbeiten
                        </DropdownMenuItem>
                        {dealer.active ? (
                          <DropdownMenuItem
                            onClick={() => onDeactivate(dealer.id)}
                            className="text-destructive"
                          >
                            <PowerOff className="mr-2 h-4 w-4" />
                            Deaktivieren
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => onDeactivate(dealer.id)}
                          >
                            <Power className="mr-2 h-4 w-4" />
                            Reaktivieren
                          </DropdownMenuItem>
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

      <p className="text-xs text-muted-foreground">
        {filtered.length} von {dealers.length} Händlern
      </p>
    </div>
  );
}
