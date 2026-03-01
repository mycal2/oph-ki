"use client";

import { useState, useCallback } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import { useAdminDealers } from "@/hooks/use-admin-dealers";
import { DealerAdminTable } from "@/components/admin/dealer-admin-table";
import { DealerFormSheet } from "@/components/admin/dealer-form-sheet";
import { DealerTestDialog } from "@/components/admin/dealer-test-dialog";
import type { CreateDealerInput, UpdateDealerInput } from "@/lib/validations";

export default function AdminDealersPage() {
  const { isPlatformAdmin, isLoading: isLoadingRole } = useCurrentUserRole();
  const {
    dealers,
    isLoading,
    error,
    refetch,
    createDealer,
    updateDealer,
    deleteDealer,
    fetchDealer,
    fetchAuditLog,
    testRecognition,
    isMutating,
    mutationError,
  } = useAdminDealers();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingDealerId, setEditingDealerId] = useState<string | null>(null);

  const handleCreateNew = useCallback(() => {
    setEditingDealerId(null);
    setSheetOpen(true);
  }, []);

  const handleEdit = useCallback((dealerId: string) => {
    setEditingDealerId(dealerId);
    setSheetOpen(true);
  }, []);

  const handleDeactivate = useCallback(
    async (dealerId: string) => {
      const dealer = dealers.find((d) => d.id === dealerId);
      if (!dealer) return;

      if (dealer.active) {
        await deleteDealer(dealerId);
      } else {
        await updateDealer(dealerId, { active: true });
      }
    },
    [dealers, deleteDealer, updateDealer]
  );

  const handleSave = useCallback(
    async (data: CreateDealerInput | UpdateDealerInput, isNew: boolean) => {
      if (isNew) {
        return createDealer(data as CreateDealerInput);
      } else if (editingDealerId) {
        return updateDealer(editingDealerId, data as UpdateDealerInput);
      }
      return null;
    },
    [createDealer, updateDealer, editingDealerId]
  );

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
          <h1 className="text-2xl font-bold tracking-tight">Haendler-Verwaltung</h1>
          <p className="text-sm text-muted-foreground">
            Globale Haendlerprofile und Erkennungsregeln verwalten.
          </p>
        </div>
        <DealerTestDialog onTest={testRecognition} isMutating={isMutating}>
          <Button variant="outline" size="sm">
            <FlaskConical className="mr-1.5 h-4 w-4" />
            Erkennung testen
          </Button>
        </DealerTestDialog>
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

      {/* Dealer table */}
      <DealerAdminTable
        dealers={dealers}
        isLoading={isLoading}
        onCreateNew={handleCreateNew}
        onEdit={handleEdit}
        onDeactivate={handleDeactivate}
      />

      {/* Form sheet */}
      <DealerFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        dealerId={editingDealerId}
        onSave={handleSave}
        onFetchDealer={fetchDealer}
        onFetchAuditLog={fetchAuditLog}
        isMutating={isMutating}
      />
    </div>
  );
}
