"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import { useAdminTenants } from "@/hooks/use-admin-tenants";
import { TenantAdminTable } from "@/components/admin/tenant-admin-table";
import { TenantFormSheet } from "@/components/admin/tenant-form-sheet";
import type { CreateTenantInput, UpdateTenantInput } from "@/lib/validations";

export default function AdminTenantsPage() {
  const { isPlatformAdmin, isLoading: isLoadingRole } = useCurrentUserRole();
  const {
    tenants,
    isLoading,
    error,
    refetch,
    createTenant,
    updateTenant,
    fetchTenant,
    fetchTenantUsers,
    inviteUser,
    toggleUserStatus,
    exportCsv,
    isMutating,
    mutationError,
  } = useAdminTenants();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);

  const handleCreateNew = useCallback(() => {
    setEditingTenantId(null);
    setSheetOpen(true);
  }, []);

  const handleEdit = useCallback((tenantId: string) => {
    setEditingTenantId(tenantId);
    setSheetOpen(true);
  }, []);

  const handleToggleStatus = useCallback(
    async (tenantId: string) => {
      const tenant = tenants.find((t) => t.id === tenantId);
      if (!tenant) return;

      const newStatus = tenant.status === "inactive" ? "active" : "inactive";
      await updateTenant(tenantId, { status: newStatus });
    },
    [tenants, updateTenant]
  );

  const handleSave = useCallback(
    async (data: CreateTenantInput | UpdateTenantInput, isNew: boolean) => {
      if (isNew) {
        return createTenant(data as CreateTenantInput);
      } else if (editingTenantId) {
        return updateTenant(editingTenantId, data as UpdateTenantInput);
      }
      return null;
    },
    [createTenant, updateTenant, editingTenantId]
  );

  const handleInviteUser = useCallback(
    async (email: string, role: "tenant_user" | "tenant_admin") => {
      if (!editingTenantId) return { ok: false, error: "Kein Mandant ausgewaehlt." };
      return inviteUser(editingTenantId, { email, role });
    },
    [editingTenantId, inviteUser]
  );

  const handleToggleUserStatus = useCallback(
    async (userId: string, status: "active" | "inactive") => {
      if (!editingTenantId) return false;
      return toggleUserStatus(editingTenantId, userId, status);
    },
    [editingTenantId, toggleUserStatus]
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
          <h1 className="text-2xl font-bold tracking-tight">Mandanten-Verwaltung</h1>
          <p className="text-sm text-muted-foreground">
            Mandanten anlegen, bearbeiten und deren Benutzer verwalten.
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

      {/* Tenant table */}
      <TenantAdminTable
        tenants={tenants}
        isLoading={isLoading}
        onCreateNew={handleCreateNew}
        onEdit={handleEdit}
        onToggleStatus={handleToggleStatus}
        onExportCsv={exportCsv}
      />

      {/* Form sheet */}
      <TenantFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        tenantId={editingTenantId}
        onSave={handleSave}
        onFetchTenant={fetchTenant}
        onFetchUsers={fetchTenantUsers}
        onInviteUser={handleInviteUser}
        onToggleUserStatus={handleToggleUserStatus}
        isMutating={isMutating}
      />
    </div>
  );
}
