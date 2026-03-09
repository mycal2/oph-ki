"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import { useErpConfigDetail } from "@/hooks/use-erp-configs";
import { ErpConfigEditor } from "@/components/admin/erp-config-editor";

interface PageProps {
  params: Promise<{ configId: string }>;
}

export default function AdminErpConfigDetailPage({ params }: PageProps) {
  const { configId } = use(params);
  const router = useRouter();
  const { isPlatformAdmin, isLoading: isLoadingRole } = useCurrentUserRole();
  const {
    detail,
    isLoading,
    error,
    refetch,
    saveConfig,
    rollbackToVersion,
    testConfig,
    fetchApprovedOrders,
    isMutating,
    mutationError,
    clearMutationError,
  } = useErpConfigDetail(configId);

  // Loading state
  if (isLoadingRole || isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
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

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/admin/erp-configs")}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Zurueck zur Uebersicht
        </Button>
        <Alert variant="destructive">
          <AlertDescription>
            {error}{" "}
            <Button variant="link" className="h-auto p-0" onClick={refetch}>
              Erneut versuchen
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/admin/erp-configs")}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Zurueck zur Uebersicht
        </Button>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Konfiguration nicht gefunden.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button + header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/admin/erp-configs")}
          aria-label="Zurueck zur Uebersicht"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {detail.config.name}
          </h1>
          {detail.config.description && (
            <p className="text-sm text-muted-foreground">
              {detail.config.description}
            </p>
          )}
          {detail.assigned_tenants.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Zugewiesen an: {detail.assigned_tenants.map((t) => t.name).join(", ")}
            </p>
          )}
        </div>
      </div>

      {/* Mutation error */}
      {mutationError && (
        <Alert variant="destructive">
          <AlertDescription>
            {mutationError}{" "}
            <Button variant="link" className="h-auto p-0" onClick={clearMutationError}>
              Schliessen
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Main editor */}
      <ErpConfigEditor
        detail={detail}
        onSave={saveConfig}
        onRollback={rollbackToVersion}
        onTest={testConfig}
        onFetchOrders={fetchApprovedOrders}
        isMutating={isMutating}
        mutationError={mutationError}
      />
    </div>
  );
}
