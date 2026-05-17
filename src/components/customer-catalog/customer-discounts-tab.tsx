"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Loader2,
  Percent,
  Search,
  ChevronLeft,
  ChevronRight,
  Package,
  Trash2,
  Tag,
  Download,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { useCustomerDiscounts } from "@/hooks/use-customer-discounts";
import { DiscountOverrideDialog } from "@/components/customer-catalog/discount-override-dialog";
import { DiscountImportDialog } from "@/components/customer-catalog/discount-import-dialog";
import type {
  CustomerDiscountTableRow,
  DiscountImportResult,
  ApiResponse,
} from "@/lib/types";

interface CustomerDiscountsTabProps {
  customerId: string;
  readOnly?: boolean;
}

/**
 * OPH-106: Customer Discount Rates tab — default rate + per-article overrides.
 *
 * Only mounted when the tenant's price_lookup_enabled flag is true (gated by
 * the parent detail page).
 */
export function CustomerDiscountsTab({
  customerId,
  readOnly = false,
}: CustomerDiscountsTabProps) {
  const {
    rows,
    total,
    page,
    pageSize,
    search,
    defaultRate,
    isLoading,
    isMutating,
    error,
    setPage,
    setSearch,
    saveDefaultRate,
    deleteDefaultRate,
    saveOverride,
    deleteOverride,
    refetch,
  } = useCustomerDiscounts({ customerId });

  // Default-rate input local state
  const [defaultInput, setDefaultInput] = useState<string>("");
  const [defaultInputError, setDefaultInputError] = useState<string | null>(null);
  const [confirmDeleteDefault, setConfirmDeleteDefault] = useState(false);

  // Override dialog state
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideRow, setOverrideRow] = useState<CustomerDiscountTableRow | null>(null);

  // OPH-107: Excel export / import state
  const [importOpen, setImportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    // German decimal format ("15,00") for display in the input.
    setDefaultInput(
      defaultRate === null ? "" : defaultRate.toFixed(2).replace(".", ",")
    );
    setDefaultInputError(null);
  }, [defaultRate]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleSaveDefault = useCallback(async () => {
    setDefaultInputError(null);
    const parsed = parseRate(defaultInput);
    if (parsed === null) {
      setDefaultInputError("Bitte geben Sie einen Wert zwischen 0 und 100 ein.");
      return;
    }
    const result = await saveDefaultRate(parsed);
    if (result.ok) {
      toast.success("Standardrabatt gespeichert.");
    } else {
      setDefaultInputError(result.error ?? "Fehler beim Speichern.");
    }
  }, [defaultInput, saveDefaultRate]);

  const handleDeleteDefault = useCallback(async () => {
    const result = await deleteDefaultRate();
    setConfirmDeleteDefault(false);
    if (result.ok) {
      toast.success("Standardrabatt entfernt.");
    } else {
      toast.error(result.error ?? "Fehler beim Loeschen.");
    }
  }, [deleteDefaultRate]);

  const handleRowClick = useCallback(
    (row: CustomerDiscountTableRow) => {
      if (readOnly) return;
      setOverrideRow(row);
      setOverrideOpen(true);
    },
    [readOnly]
  );

  const handleOverrideSave = useCallback(
    async (rate: number) => {
      if (!overrideRow) return { ok: false, error: "Kein Artikel ausgewaehlt." };
      const result = await saveOverride(overrideRow.article_id, rate);
      if (result.ok) toast.success("Rabatt-Override gespeichert.");
      return result;
    },
    [overrideRow, saveOverride]
  );

  const handleOverrideReset = useCallback(async () => {
    if (!overrideRow) return { ok: false, error: "Kein Artikel ausgewaehlt." };
    const result = await deleteOverride(overrideRow.article_id);
    if (result.ok) toast.success("Override entfernt.");
    return result;
  }, [overrideRow, deleteOverride]);

  // OPH-107: Trigger an XLSX download for the current customer.
  const handleExport = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/discounts/export`);

      if (!res.ok) {
        // Server returns JSON error envelope on failure.
        let msg = "Export fehlgeschlagen.";
        try {
          const json = (await res.json()) as { error?: string };
          if (json.error) msg = json.error;
        } catch {
          // ignore — fall back to generic message
        }
        toast.error(msg);
        return;
      }

      const blob = await res.blob();

      // Filename: prefer the server-provided one (Content-Disposition).
      let filename = "discount_rates.xlsx";
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      if (match?.[1]) {
        filename = match[1];
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Excel-Datei wurde heruntergeladen.");
    } catch {
      toast.error("Netzwerkfehler beim Export.");
    } finally {
      setIsExporting(false);
    }
  }, [customerId, isExporting]);

  // OPH-107: Upload an edited XLSX and refresh the table on success.
  const handleImport = useCallback(
    async (
      file: File
    ): Promise<{
      ok: boolean;
      data?: DiscountImportResult;
      error?: string;
    }> => {
      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`/api/customers/${customerId}/discounts/import`, {
          method: "POST",
          body: formData,
        });

        const json = (await res.json()) as ApiResponse<DiscountImportResult>;

        if (!res.ok || !json.success || !json.data) {
          return { ok: false, error: json.error ?? "Import fehlgeschlagen." };
        }

        const { updated, skipped, total_errors } = json.data;

        // Toast outside the dialog so it stays visible after the user closes it.
        toast.success(
          `Import abgeschlossen: ${updated} aktualisiert${
            skipped > 0 ? `, ${skipped} uebersprungen` : ""
          }${total_errors > 0 ? `, ${total_errors} Fehler` : ""}.`
        );

        // Refresh the displayed table so updates are visible immediately.
        await refetch();

        return { ok: true, data: json.data };
      } catch {
        return { ok: false, error: "Netzwerkfehler beim Import." };
      }
    },
    [customerId, refetch]
  );

  return (
    <div className="space-y-6">
      {/* Default Discount Rate Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="h-4 w-4" />
            Standardrabatt
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Dieser Satz wird auf alle Artikel angewendet, fuer die kein
            individueller Override gesetzt ist. Lassen Sie das Feld leer und
            klicken Sie auf &quot;Entfernen&quot;, um den Standardrabatt zu loeschen.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1.5 sm:max-w-[200px]">
              <Label htmlFor="default-discount-rate">Rabattsatz (%)</Label>
              <Input
                id="default-discount-rate"
                type="text"
                inputMode="decimal"
                value={defaultInput}
                onChange={(e) => setDefaultInput(e.target.value)}
                placeholder="z.B. 15,00"
                disabled={isMutating || readOnly}
              />
            </div>

            {!readOnly && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={handleSaveDefault}
                  disabled={isMutating}
                >
                  {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Speichern
                </Button>
                {defaultRate !== null && (
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmDeleteDefault(true)}
                    disabled={isMutating}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Entfernen
                  </Button>
                )}
              </div>
            )}
          </div>

          {defaultInputError && (
            <p className="text-sm text-destructive">{defaultInputError}</p>
          )}

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Aktueller Wert:</span>
            {defaultRate === null ? (
              <Badge variant="secondary">Nicht gesetzt</Badge>
            ) : (
              <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                {defaultRate.toFixed(2).replace(".", ",")} %
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Article Discount Table */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4" />
            Artikel-Rabatte
          </CardTitle>
          {!readOnly && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={isExporting || isLoading || (total === 0 && search.length === 0)}
                aria-label="Rabatte als Excel exportieren"
              >
                {isExporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Excel exportieren
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setImportOpen(true)}
                disabled={isMutating}
                aria-label="Rabatte aus Excel importieren"
              >
                <Upload className="mr-2 h-4 w-4" />
                Excel importieren
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Klicken Sie auf eine Zeile, um einen artikelspezifischen Override zu
            setzen oder zu entfernen. Artikel ohne expliziten Override folgen
            automatisch dem Standardrabatt.
          </p>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {error}{" "}
                <Button
                  variant="link"
                  className="h-auto p-0"
                  onClick={refetch}
                >
                  Erneut versuchen
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Artikel suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Artikel suchen"
            />
          </div>

          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )}

          {!isLoading && rows.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-10 w-10 text-muted-foreground/30 mb-3" />
              {search ? (
                <>
                  <p className="text-sm font-medium">Keine Artikel gefunden</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Fuer &quot;{search}&quot; wurden keine Artikel gefunden.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">Noch keine Artikel im Stamm</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md">
                    Pflegen Sie zuerst Artikel im Artikelstamm. Diese erscheinen
                    dann automatisch hier und uebernehmen den Standardrabatt.
                  </p>
                </>
              )}
            </div>
          )}

          {!isLoading && rows.length > 0 && (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[110px]">Art.-Nr.</TableHead>
                      <TableHead className="min-w-[180px]">Bezeichnung</TableHead>
                      <TableHead className="hidden md:table-cell text-right">UVP</TableHead>
                      <TableHead className="text-right">Eff. Rabatt</TableHead>
                      <TableHead className="hidden lg:table-cell text-right">
                        Diskont. Preis
                      </TableHead>
                      <TableHead className="min-w-[110px]">Quelle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const isOverride = row.source === "override";
                      return (
                        <TableRow
                          key={row.article_id}
                          onClick={() => handleRowClick(row)}
                          className={
                            readOnly
                              ? undefined
                              : "cursor-pointer hover:bg-muted/50"
                          }
                          aria-label={
                            readOnly
                              ? undefined
                              : `Rabatt fuer ${row.article_number} bearbeiten`
                          }
                        >
                          <TableCell className="font-mono text-sm">
                            {row.article_number}
                          </TableCell>
                          <TableCell>
                            <span className="line-clamp-1">{row.article_name}</span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-right tabular-nums">
                            {formatCurrency(row.rrp)}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${
                              isOverride ? "font-semibold" : ""
                            }`}
                          >
                            {formatPercent(row.effective_rate)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-right tabular-nums">
                            {formatCurrency(row.discounted_price)}
                          </TableCell>
                          <TableCell>
                            <SourceBadge source={row.source} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {total} Artikel{search && ` fuer "${search}"`} &middot; Seite{" "}
                  {page} von {totalPages}
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Override dialog */}
      <DiscountOverrideDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        row={overrideRow}
        defaultRate={defaultRate}
        onSave={handleOverrideSave}
        onResetToDefault={handleOverrideReset}
        isMutating={isMutating}
      />

      {/* OPH-107: Excel import dialog */}
      <DiscountImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={handleImport}
      />

      {/* Confirm delete default-rate */}
      <AlertDialog
        open={confirmDeleteDefault}
        onOpenChange={setConfirmDeleteDefault}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Standardrabatt entfernen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der kundenseitige Standardrabatt wird entfernt. Artikel ohne
              expliziten Override fallen anschliessend auf &quot;kein Rabatt&quot;
              zurueck. Bestehende Artikel-Overrides bleiben erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDefault}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SourceBadge({ source }: { source: CustomerDiscountTableRow["source"] }) {
  if (source === "override") {
    return (
      <Badge variant="default" className="bg-indigo-600 hover:bg-indigo-600">
        Override
      </Badge>
    );
  }
  if (source === "default") {
    return <Badge variant="secondary">Standard</Badge>;
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      —
    </Badge>
  );
}

const currencyFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(val: number | null): React.ReactNode {
  if (val === null || val === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  return currencyFormatter.format(val);
}

function formatPercent(rate: number | null): React.ReactNode {
  if (rate === null || rate === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  // German decimal format: "25,00 %" instead of "25.00 %".
  return `${rate.toFixed(2).replace(".", ",")} %`;
}

function parseRate(input: string): number | null {
  const trimmed = input.trim().replace(",", ".");
  if (trimmed.length === 0) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  if (value < 0 || value > 100) return null;
  if (Math.round(value * 100) !== value * 100) return null;
  return value;
}
