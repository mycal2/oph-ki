"use client";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import { useErpConfigs } from "@/hooks/use-erp-configs";
import { ErpConfigListTable } from "@/components/admin/erp-config-list-table";

export default function AdminErpConfigsPage() {
  const { isPlatformAdmin, isLoading: isLoadingRole } = useCurrentUserRole();
  const { configs, isLoading, error, refetch, mutationError } = useErpConfigs();

  // Loading state
  if (isLoadingRole) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Access denied
  if (!isPlatformAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Zugriff verweigert. Nur fuer Platform-Administratoren.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ERP-Mapping-Konfiguration</h1>
          <p className="text-sm text-muted-foreground">
            Exportformate, Spalten-Mappings und Transformationen pro Mandant konfigurieren.
          </p>
        </div>
      </div>

      {/* Error states */}
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
      {mutationError && (
        <Alert variant="destructive">
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      )}

      {/* Config list table */}
      <ErpConfigListTable configs={configs} isLoading={isLoading} />
    </div>
  );
}
