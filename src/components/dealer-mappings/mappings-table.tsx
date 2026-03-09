"use client";

import { useState, useCallback } from "react";
import { Plus, Trash2, Upload, Download, Loader2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CsvImportDialog } from "./csv-import-dialog";
import type { DealerDataMappingListItem, MappingType } from "@/lib/types";

interface MappingsTableProps {
  dealerId: string;
  dealerName: string;
  mappingType: MappingType;
  mappings: DealerDataMappingListItem[];
  isLoading: boolean;
  error: string | null;
  onCreateMapping: (data: {
    dealerId: string;
    mappingType: MappingType;
    dealerValue: string;
    erpValue: string;
    conversionFactor?: number;
    description?: string;
    isGlobal?: boolean;
  }) => Promise<unknown>;
  onDeleteMapping: (id: string) => Promise<void>;
  onImportCsv: (csvContent: string, dealerId: string, mappingType: MappingType, isGlobal?: boolean) => Promise<{ created: number; updated: number; errors: string[] }>;
  /** Platform admin: create new entries as global (tenant_id = null). */
  isGlobalMode?: boolean;
  /** Whether the current user is a platform admin. */
  isPlatformAdmin?: boolean;
}

const TYPE_LABELS: Record<MappingType, { dealerCol: string; erpCol: string; placeholder: [string, string] }> = {
  article_number: {
    dealerCol: "Händler-Artikelnr.",
    erpCol: "ERP-Artikelnr.",
    placeholder: ["z.B. HS-12345", "z.B. MFG-6789"],
  },
  unit_conversion: {
    dealerCol: "Händler-Einheit",
    erpCol: "ERP-Einheit",
    placeholder: ["z.B. Karton", "z.B. Stück"],
  },
  field_label: {
    dealerCol: "Händler-Feldname",
    erpCol: "ERP-Feldname",
    placeholder: ["z.B. PO-Nr.", "z.B. Bestellreferenz"],
  },
};

export function MappingsTable({
  dealerId,
  dealerName,
  mappingType,
  mappings,
  isLoading,
  error,
  onCreateMapping,
  onDeleteMapping,
  onImportCsv,
  isGlobalMode = false,
  isPlatformAdmin = false,
}: MappingsTableProps) {
  const [newDealerValue, setNewDealerValue] = useState("");
  const [newErpValue, setNewErpValue] = useState("");
  const [newFactor, setNewFactor] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const labels = TYPE_LABELS[mappingType];
  const isUnitType = mappingType === "unit_conversion";

  const filteredMappings = mappings.filter((m) => m.mapping_type === mappingType);

  const handleAdd = useCallback(async () => {
    if (!newDealerValue.trim() || !newErpValue.trim()) {
      setFormError("Beide Werte sind erforderlich.");
      return;
    }

    setIsCreating(true);
    setFormError(null);

    try {
      await onCreateMapping({
        dealerId,
        mappingType,
        dealerValue: newDealerValue.trim(),
        erpValue: newErpValue.trim(),
        conversionFactor: isUnitType && newFactor ? parseFloat(newFactor) : undefined,
        isGlobal: isGlobalMode || undefined,
      });
      setNewDealerValue("");
      setNewErpValue("");
      setNewFactor("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Fehler beim Erstellen.");
    } finally {
      setIsCreating(false);
    }
  }, [dealerId, mappingType, newDealerValue, newErpValue, newFactor, isUnitType, isGlobalMode, onCreateMapping]);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await onDeleteMapping(id);
      } catch {
        // Error handled by parent
      } finally {
        setDeletingId(null);
      }
    },
    [onDeleteMapping]
  );

  const handleOverride = useCallback((mapping: DealerDataMappingListItem) => {
    setNewDealerValue(mapping.dealer_value);
    setNewErpValue(mapping.erp_value);
    if (isUnitType && mapping.conversion_factor != null) {
      setNewFactor(String(mapping.conversion_factor));
    }
    setFormError(null);
  }, [isUnitType]);

  const handleExport = useCallback(() => {
    const params = new URLSearchParams({ dealerId, mappingType });
    window.open(`/api/dealer-mappings/export?${params}`, "_blank");
  }, [dealerId, mappingType]);

  /** Whether a row's action should be a delete button. */
  const canDelete = (mapping: DealerDataMappingListItem) => {
    if (mapping.is_global) {
      // Platform admin in global mode can delete global rows
      return isPlatformAdmin && isGlobalMode;
    }
    // Tenant rows are always deletable by the owner
    return true;
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex items-center gap-2 justify-end">
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setImportOpen(true)}>
          <Upload className="h-3.5 w-3.5" />
          CSV Import
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={handleExport}
          disabled={filteredMappings.length === 0}
        >
          <Download className="h-3.5 w-3.5" />
          CSV Export
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{labels.dealerCol}</TableHead>
              <TableHead>{labels.erpCol}</TableHead>
              {isUnitType && <TableHead className="w-[100px]">Faktor</TableHead>}
              <TableHead className="hidden sm:table-cell">Quelle</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMappings.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={isUnitType ? 5 : 4}
                  className="text-center text-muted-foreground py-8"
                >
                  Keine Zuordnungen für {dealerName} vorhanden.
                </TableCell>
              </TableRow>
            )}
            {filteredMappings.map((mapping) => (
              <TableRow key={mapping.id}>
                <TableCell className="font-mono text-sm">{mapping.dealer_value}</TableCell>
                <TableCell className="font-mono text-sm">{mapping.erp_value}</TableCell>
                {isUnitType && (
                  <TableCell className="font-mono text-sm">
                    {mapping.conversion_factor ?? "-"}
                  </TableCell>
                )}
                <TableCell className="hidden sm:table-cell">
                  <Badge
                    variant={mapping.is_global ? "secondary" : "outline"}
                    className="text-[10px]"
                  >
                    {mapping.is_global ? "Global" : "Eigene"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {canDelete(mapping) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(mapping.id)}
                      disabled={deletingId === mapping.id}
                      aria-label="Zuordnung löschen"
                    >
                      {deletingId === mapping.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  ) : mapping.is_global ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                      onClick={() => handleOverride(mapping)}
                      aria-label="Globale Zuordnung überschreiben"
                      title="Überschreiben"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}

            {/* Add new row */}
            <TableRow>
              <TableCell>
                <Input
                  placeholder={labels.placeholder[0]}
                  value={newDealerValue}
                  onChange={(e) => setNewDealerValue(e.target.value)}
                  className="h-8 text-sm font-mono"
                  disabled={isCreating}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
              </TableCell>
              <TableCell>
                <Input
                  placeholder={labels.placeholder[1]}
                  value={newErpValue}
                  onChange={(e) => setNewErpValue(e.target.value)}
                  className="h-8 text-sm font-mono"
                  disabled={isCreating}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
              </TableCell>
              {isUnitType && (
                <TableCell>
                  <Input
                    placeholder="z.B. 10"
                    value={newFactor}
                    onChange={(e) => setNewFactor(e.target.value)}
                    className="h-8 text-sm font-mono"
                    type="number"
                    step="0.01"
                    disabled={isCreating}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  />
                </TableCell>
              )}
              <TableCell className="hidden sm:table-cell" />
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-primary"
                  onClick={handleAdd}
                  disabled={isCreating}
                  aria-label="Zuordnung hinzufügen"
                >
                  {isCreating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        dealerId={dealerId}
        dealerName={dealerName}
        mappingType={mappingType}
        onImport={onImportCsv}
        isGlobalMode={isGlobalMode}
      />
    </div>
  );
}
