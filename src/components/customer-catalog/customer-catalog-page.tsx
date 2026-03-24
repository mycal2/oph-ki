"use client";

import { useState, useCallback } from "react";
import {
  Plus,
  Upload,
  Download,
  FileDown,
  Search,
  Users,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCustomerCatalog } from "@/hooks/use-customer-catalog";
import { CustomerFormDialog } from "@/components/customer-catalog/customer-form-dialog";
import { CustomerDeleteDialog } from "@/components/customer-catalog/customer-delete-dialog";
import { CustomerImportDialog } from "@/components/customer-catalog/customer-import-dialog";
import type { CustomerCatalogItem } from "@/lib/types";
import type { CreateCustomerInput, UpdateCustomerInput } from "@/lib/validations";

interface CustomerCatalogPageProps {
  /** When provided, use admin API mode for this tenant. */
  adminTenantId?: string | null;
  /** When true, hide the page-level heading (used when embedded in a sheet/tab). */
  compact?: boolean;
  /** When true, hide add/edit/delete/import buttons (read-only view for tenant_user). */
  readOnly?: boolean;
}

export function CustomerCatalogPage({
  adminTenantId,
  compact = false,
  readOnly = false,
}: CustomerCatalogPageProps) {
  const {
    customers,
    total,
    page,
    pageSize,
    search,
    isLoading,
    error,
    setPage,
    setSearch,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    importFile,
    exportCsv,
    refetch,
  } = useCustomerCatalog({ adminTenantId });

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerCatalogItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState<CustomerCatalogItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const totalPages = Math.ceil(total / pageSize);

  const handleAddNew = useCallback(() => {
    setEditingCustomer(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((customer: CustomerCatalogItem) => {
    setEditingCustomer(customer);
    setFormOpen(true);
  }, []);

  const handleDeleteClick = useCallback((customer: CustomerCatalogItem) => {
    setDeletingCustomer(customer);
    setDeleteDialogOpen(true);
  }, []);

  const handleSave = useCallback(
    async (
      data: CreateCustomerInput | UpdateCustomerInput,
      isNew: boolean,
      customerId?: string
    ) => {
      if (isNew) {
        const result = await createCustomer(data as CreateCustomerInput);
        if (result.ok) {
          toast.success("Kunde wurde erstellt.");
        }
        return result;
      } else if (customerId) {
        const result = await updateCustomer(customerId, data as UpdateCustomerInput);
        if (result.ok) {
          toast.success("Kunde wurde aktualisiert.");
        }
        return result;
      }
      return { ok: false, error: "Keine Kunden-ID." };
    },
    [createCustomer, updateCustomer]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingCustomer) return { ok: false, error: "Kein Kunde ausgewaehlt." };
    const result = await deleteCustomer(deletingCustomer.id);
    if (result.ok) {
      toast.success("Kunde wurde geloescht.");
    }
    return result;
  }, [deletingCustomer, deleteCustomer]);

  const handleImport = useCallback(
    async (file: File) => {
      const result = await importFile(file);
      if (result.ok && result.data) {
        const { created, updated, skipped } = result.data;
        toast.success(
          `Import abgeschlossen: ${created} neu, ${updated} aktualisiert${
            skipped > 0 ? `, ${skipped} uebersprungen` : ""
          }.`
        );
      }
      return result;
    },
    [importFile]
  );

  const handleExport = useCallback(async () => {
    await exportCsv();
    toast.success("Kundenstamm wurde als CSV exportiert.");
  }, [exportCsv]);

  const handleDownloadSample = useCallback(() => {
    const BOM = "\uFEFF";
    const header =
      "Kundennummer;Firma;Strasse;PLZ;Stadt;Land;E-Mail;Telefon;Suchbegriffe / Aliase";
    const row1 =
      "10001;Dental Muster GmbH;Hauptstrasse 12;80331;Muenchen;Deutschland;info@dental-muster.de;+49 89 12345678;Dental Muster, DM GmbH";
    const row2 =
      "10002;Zahntechnik Schmidt AG;Bahnhofstr. 5;60311;Frankfurt;Deutschland;bestellung@schmidt-dental.de;+49 69 9876543;Schmidt, Schmidt Dental";
    const row3 =
      "10003;Praxis Dr. Weber;Lindenallee 8;10115;Berlin;Deutschland;;+49 30 1112233;Weber, Dr. Weber";
    const content = BOM + [header, row1, row2, row3].join("\n");

    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kundenstamm-beispiel.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="space-y-4">
      {/* Page heading (only in full-page mode) */}
      {!compact && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kundenstamm</h1>
          <p className="text-muted-foreground">
            Verwalten Sie den Kundenkatalog Ihres Unternehmens.
          </p>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}{" "}
            <Button variant="link" className="h-auto p-0" onClick={refetch}>
              Erneut versuchen
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Kunden suchen"
          />
        </div>

        {/* Action buttons */}
        {!readOnly && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" variant="outline" size="sm" onClick={handleDownloadSample}>
              <FileDown className="mr-2 h-4 w-4" />
              Beispiel-CSV
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Importieren
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={total === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportieren
            </Button>
            <Button type="button" size="sm" onClick={handleAddNew}>
              <Plus className="mr-2 h-4 w-4" />
              Kunde hinzufuegen
            </Button>
          </div>
        )}
      </div>

      {/* Customer count */}
      {!isLoading && total > 0 && (
        <p className="text-sm text-muted-foreground">
          {total} Kunden
          {search && ` fuer "${search}"`}
        </p>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && customers.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
          {search ? (
            <>
              <p className="text-sm font-medium">Keine Kunden gefunden</p>
              <p className="text-sm text-muted-foreground mt-1">
                Fuer &quot;{search}&quot; wurden keine Kunden gefunden.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Noch keine Kunden vorhanden</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                {readOnly
                  ? "Der Kundenstamm ist leer. Kontaktieren Sie Ihren Administrator."
                  : "Fuegen Sie Kunden einzeln hinzu oder importieren Sie eine CSV-/Excel-Datei, um den Kundenstamm zu befuellen."}
              </p>
              {!readOnly && (
                <div className="flex gap-2 mt-4">
                  <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                    <Upload className="mr-2 h-4 w-4" />
                    CSV/Excel importieren
                  </Button>
                  <Button type="button" size="sm" onClick={handleAddNew}>
                    <Plus className="mr-2 h-4 w-4" />
                    Kunde hinzufuegen
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Customer table */}
      {!isLoading && customers.length > 0 && (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[130px]">Kundennummer</TableHead>
                  <TableHead className="min-w-[200px]">Firma</TableHead>
                  <TableHead className="hidden md:table-cell">PLZ</TableHead>
                  <TableHead className="hidden md:table-cell">Stadt</TableHead>
                  <TableHead className="hidden lg:table-cell">E-Mail</TableHead>
                  <TableHead className="hidden lg:table-cell">Telefon</TableHead>
                  {!readOnly && <TableHead className="w-[80px] text-right">Aktionen</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">
                      {customer.customer_number}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="line-clamp-1">
                                {customer.company_name}
                              </span>
                            </TooltipTrigger>
                            {customer.company_name.length > 40 && (
                              <TooltipContent>
                                <p className="max-w-xs">{customer.company_name}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                        {customer.dealer_id && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="secondary" className="shrink-0 text-xs">
                                  Haendler
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Automatisch aus globalem Haendlerprofil erstellt</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {customer.postal_code ?? <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {customer.city ?? <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs">
                      {customer.email ?? <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs">
                      {customer.phone ?? <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    {!readOnly && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(customer)}
                            aria-label={`Kunde ${customer.customer_number} bearbeiten`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteClick(customer)}
                            aria-label={`Kunde ${customer.customer_number} loeschen`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Seite {page} von {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Zurueck
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                >
                  Weiter
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        customer={editingCustomer}
        onSave={handleSave}
      />

      <CustomerDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        customerNumber={deletingCustomer?.customer_number ?? ""}
        companyName={deletingCustomer?.company_name ?? ""}
        onConfirm={handleDeleteConfirm}
      />

      <CustomerImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={handleImport}
      />
    </div>
  );
}
