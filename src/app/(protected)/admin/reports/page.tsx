"use client";

import { useState, useEffect, useCallback } from "react";
import { startOfMonth, format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { FileSpreadsheet, FileText, FileDown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import { useBillingReport } from "@/hooks/use-billing-report";
import { DateRangePicker } from "@/components/admin/date-range-picker";
import { TenantMultiSelect } from "@/components/admin/tenant-multi-select";
import type { TenantOption } from "@/components/admin/tenant-multi-select";
import { BillingReportTable } from "@/components/admin/billing-report-table";
import { exportCsv, exportXls, exportPdf } from "@/lib/billing-report-exports";
import type { BillingReportMultiTenantRow } from "@/lib/types";

export default function AdminReportsPage() {
  const { isPlatformAdminOrViewer, isLoading: isLoadingRole } = useCurrentUserRole();
  const { report, isLoading, error, warning, generate } = useBillingReport();

  // Filter state
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
  const [includePrices, setIncludePrices] = useState(false);

  // Tenant list for the multi-select
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);

  // Export loading states
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingXls, setExportingXls] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Load tenants for the selector
  useEffect(() => {
    async function loadTenants() {
      try {
        const res = await fetch("/api/admin/tenants");
        const json = await res.json();
        if (json.success && json.data) {
          const options: TenantOption[] = json.data.map(
            (t: { id: string; name: string }) => ({
              id: t.id,
              name: t.name,
            })
          );
          setTenants(options);
        }
      } catch {
        // Silently fail — the user will see an empty dropdown
      } finally {
        setTenantsLoading(false);
      }
    }
    loadTenants();
  }, []);

  const canGenerate =
    dateRange?.from && dateRange?.to && selectedTenantIds.length > 0 && !isLoading;

  const handleGenerate = useCallback(() => {
    if (!dateRange?.from || !dateRange?.to) return;
    generate({
      from: format(dateRange.from, "yyyy-MM-dd"),
      to: format(dateRange.to, "yyyy-MM-dd"),
      tenantIds: selectedTenantIds,
      includePrices,
    });
  }, [dateRange, selectedTenantIds, includePrices, generate]);

  // Get tenant names for exports
  const getSelectedTenantNames = useCallback((): string[] => {
    if (!report) return [];
    if (report.mode === "multi-tenant") {
      return (report.rows as BillingReportMultiTenantRow[]).map((r) => r.tenantName);
    }
    // Single tenant — find the name from the selector
    const tenant = tenants.find((t) => selectedTenantIds.includes(t.id));
    return tenant ? [tenant.name] : [];
  }, [report, tenants, selectedTenantIds]);

  const handleExportCsv = useCallback(async () => {
    if (!report) return;
    setExportingCsv(true);
    try {
      exportCsv(report, includePrices, getSelectedTenantNames());
    } finally {
      setExportingCsv(false);
    }
  }, [report, includePrices, getSelectedTenantNames]);

  const handleExportXls = useCallback(async () => {
    if (!report) return;
    setExportingXls(true);
    try {
      await exportXls(report, includePrices, getSelectedTenantNames());
    } finally {
      setExportingXls(false);
    }
  }, [report, includePrices, getSelectedTenantNames]);

  const handleExportPdf = useCallback(async () => {
    if (!report) return;
    setExportingPdf(true);
    try {
      await exportPdf(report, includePrices, getSelectedTenantNames());
    } finally {
      setExportingPdf(false);
    }
  }, [report, includePrices, getSelectedTenantNames]);

  // Loading role
  if (isLoadingRole) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // Access denied
  if (!isPlatformAdminOrViewer) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Zugriff verweigert. Nur fuer Platform-Administratoren und -Betrachter.
        </p>
      </div>
    );
  }

  const hasData = report && report.rows.length > 0;
  const isEmpty = report && report.rows.length === 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Abrechnungsbericht</h1>
        <p className="text-sm text-muted-foreground">
          Erstellen Sie einen Abrechnungsbericht fuer ausgewaehlte Mandanten und Zeitraeume.
        </p>
      </div>

      {/* Filter Panel */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            {/* Date Range */}
            <div className="space-y-2">
              <Label htmlFor="date-range">Zeitraum</Label>
              <DateRangePicker
                value={dateRange}
                onChange={setDateRange}
                disabled={isLoading}
              />
            </div>

            {/* Tenant Selector */}
            <div className="space-y-2">
              <Label htmlFor="tenant-select">Mandanten</Label>
              <TenantMultiSelect
                tenants={tenants}
                selected={selectedTenantIds}
                onChange={setSelectedTenantIds}
                disabled={isLoading}
                isLoading={tenantsLoading}
              />
            </div>

            {/* Include Prices Toggle */}
            <div className="flex items-center gap-2 pb-0.5">
              <Switch
                id="include-prices"
                checked={includePrices}
                onCheckedChange={setIncludePrices}
                disabled={isLoading}
                aria-label="Preise anzeigen"
              />
              <Label htmlFor="include-prices" className="cursor-pointer">
                Preise anzeigen
              </Label>
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="lg:ml-auto"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Bericht anzeigen
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Warning */}
      {warning && (
        <Alert>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      )}

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileSpreadsheet className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">
              Keine Bestellungen im gewaehlten Zeitraum fuer die ausgewaehlten Mandanten.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Report Table */}
      {hasData && (
        <>
          <BillingReportTable report={report} includePrices={includePrices} />

          {/* Export Row */}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={exportingCsv}
            >
              {exportingCsv ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-2 h-4 w-4" />
              )}
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportXls}
              disabled={exportingXls}
            >
              {exportingXls ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              Export XLS
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={exportingPdf}
            >
              {exportingPdf ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Export PDF
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
