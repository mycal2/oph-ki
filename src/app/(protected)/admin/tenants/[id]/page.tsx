"use client";

import { use, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import { useAdminTenants } from "@/hooks/use-admin-tenants";
import { TenantProfileForm, TenantProfileFormSkeleton } from "@/components/admin/tenant-profile-form";
import { TenantUsersTab } from "@/components/admin/tenant-users-tab";
import { ArticleCatalogPage } from "@/components/article-catalog/article-catalog-page";
import type { Tenant, TenantStatus } from "@/lib/types";
import type { UpdateTenantInput } from "@/lib/validations";

const STATUS_BADGES: Record<TenantStatus, { label: string; className: string }> = {
  active: { label: "Aktiv", className: "bg-green-100 text-green-800" },
  inactive: { label: "Inaktiv", className: "text-muted-foreground" },
  trial: { label: "Testphase", className: "bg-yellow-100 text-yellow-800" },
};

const VALID_TABS = ["profile", "users", "articles"] as const;
type TabValue = (typeof VALID_TABS)[number];

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AdminTenantDetailPage({ params }: PageProps) {
  const { id: tenantId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isPlatformAdmin, userId: currentUserId, isLoading: isLoadingRole } = useCurrentUserRole();

  const {
    updateTenant,
    fetchTenant,
    fetchTenantUsers,
    inviteUser,
    toggleUserStatus,
    resendInvite,
    resetPassword,
    isMutating,
    mutationError,
  } = useAdminTenants();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab state from URL
  const tabParam = searchParams.get("tab");
  const activeTab: TabValue =
    tabParam && VALID_TABS.includes(tabParam as TabValue)
      ? (tabParam as TabValue)
      : "profile";

  // Confirmation dialog for tenant deactivation
  const [confirmDeactivate, setConfirmDeactivate] = useState<{
    action: "deactivate" | "reactivate";
  } | null>(null);

  // Load tenant data
  const loadTenant = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchTenant(tenantId);
      if (data) {
        setTenant(data);
      } else {
        setError("not_found");
      }
    } catch {
      setError("Verbindungsfehler beim Laden des Mandanten.");
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, fetchTenant]);

  useEffect(() => {
    loadTenant();
  }, [loadTenant]);

  // Update browser tab title
  useEffect(() => {
    if (tenant) {
      document.title = `${tenant.name} - Mandanten-Verwaltung`;
    }
    return () => {
      document.title = "Order Intelligence Platform";
    };
  }, [tenant]);

  // Tab change handler -- update URL
  const handleTabChange = (value: string) => {
    const url = new URL(window.location.href);
    if (value === "profile") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", value);
    }
    router.replace(url.pathname + url.search);
  };

  // Save profile
  const handleSaveProfile = useCallback(
    async (data: UpdateTenantInput) => {
      const result = await updateTenant(tenantId, data);
      if (result) {
        setTenant(result);
        toast.success("Mandant gespeichert.");
      }
      return result;
    },
    [tenantId, updateTenant]
  );

  // Toggle tenant status
  const handleToggleStatus = () => {
    if (!tenant) return;
    const action =
      tenant.status === "inactive" ? "reactivate" : "deactivate";
    setConfirmDeactivate({ action });
  };

  const confirmToggleStatus = async () => {
    if (!tenant || !confirmDeactivate) return;
    const newStatus: TenantStatus =
      tenant.status === "inactive" ? "active" : "inactive";
    const result = await updateTenant(tenantId, { status: newStatus });
    if (result) {
      setTenant(result);
      toast.success(
        confirmDeactivate.action === "deactivate"
          ? "Mandant deaktiviert."
          : "Mandant reaktiviert."
      );
    }
    setConfirmDeactivate(null);
  };

  // User management callbacks
  const handleInviteUser = useCallback(
    async (email: string, role: "tenant_user" | "tenant_admin") => {
      return inviteUser(tenantId, { email, role });
    },
    [tenantId, inviteUser]
  );

  const handleToggleUserStatus = useCallback(
    async (userId: string, status: "active" | "inactive") => {
      return toggleUserStatus(tenantId, userId, status);
    },
    [tenantId, toggleUserStatus]
  );

  const handleResendInvite = useCallback(
    async (userId: string) => {
      return resendInvite(tenantId, userId);
    },
    [tenantId, resendInvite]
  );

  const handleResetPassword = useCallback(
    async (userId: string) => {
      return resetPassword(tenantId, userId);
    },
    [tenantId, resetPassword]
  );

  // Loading state
  if (isLoadingRole || isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-10 w-72" />
        <TenantProfileFormSkeleton />
      </div>
    );
  }

  // Access denied
  if (!isPlatformAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Zugriff verweigert. Nur für Platform-Administratoren.
        </p>
      </div>
    );
  }

  // Not found
  if (error === "not_found") {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/admin/tenants")}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Mandanten
        </Button>
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-muted-foreground">
            Mandant nicht gefunden.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => router.push("/admin/tenants")}
          >
            Zurück zur Übersicht
          </Button>
        </div>
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
          onClick={() => router.push("/admin/tenants")}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Mandanten
        </Button>
        <Alert variant="destructive">
          <AlertDescription>
            {error}{" "}
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={loadTenant}
            >
              Erneut versuchen
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!tenant) return null;

  const statusBadge = STATUS_BADGES[tenant.status];

  return (
    <div className="space-y-6">
      {/* Back button + header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/admin/tenants")}
            aria-label="Zurück zu Mandanten"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {tenant.name}
              </h1>
              {tenant.status === "inactive" ? (
                <Badge
                  variant="outline"
                  className={`text-xs ${statusBadge.className}`}
                >
                  {statusBadge.label}
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className={`text-xs ${statusBadge.className}`}
                >
                  {statusBadge.label}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {tenant.slug} &middot; {tenant.contact_email}
            </p>
          </div>
        </div>

        {/* Deactivate/Reactivate button */}
        <div className="flex items-center gap-2">
          {tenant.status !== "inactive" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleStatus}
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <PowerOff className="mr-1.5 h-4 w-4" />
              Deaktivieren
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleStatus}
            >
              <Power className="mr-1.5 h-4 w-4" />
              Reaktivieren
            </Button>
          )}
        </div>
      </div>

      {/* Mutation error */}
      {mutationError && (
        <Alert variant="destructive">
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="profile">Profil</TabsTrigger>
          <TabsTrigger value="users">Benutzer</TabsTrigger>
          <TabsTrigger value="articles">Artikelstamm</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <TenantProfileForm
            tenant={tenant}
            onSave={handleSaveProfile}
            isMutating={isMutating}
          />
        </TabsContent>

        <TabsContent value="users" className="mt-6">
          <TenantUsersTab
            tenantId={tenantId}
            tenantName={tenant.name}
            currentUserId={currentUserId}
            onFetchUsers={fetchTenantUsers}
            onInviteUser={handleInviteUser}
            onToggleUserStatus={handleToggleUserStatus}
            onResendInvite={handleResendInvite}
            onResetPassword={handleResetPassword}
            isMutating={isMutating}
          />
        </TabsContent>

        <TabsContent value="articles" className="mt-6">
          <ArticleCatalogPage adminTenantId={tenantId} />
        </TabsContent>
      </Tabs>

      {/* Confirmation dialog for tenant deactivation/reactivation */}
      <AlertDialog
        open={!!confirmDeactivate}
        onOpenChange={(open) => {
          if (!open) setConfirmDeactivate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDeactivate?.action === "deactivate"
                ? "Mandant deaktivieren?"
                : "Mandant reaktivieren?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeactivate?.action === "deactivate" ? (
                <>
                  Sind Sie sicher, dass Sie{" "}
                  <span className="font-semibold">{tenant.name}</span>{" "}
                  deaktivieren möchten? Alle Benutzer dieses Mandanten
                  werden gesperrt und können sich nicht mehr einloggen.
                  {tenant.status === "trial" && (
                    <>
                      {" "}
                      <span className="font-semibold">
                        Hinweis: Dieser Mandant befindet sich in der
                        Testphase. Bei einer späteren Reaktivierung wird
                        der Status auf &quot;Aktiv&quot; gesetzt, nicht
                        zurück auf &quot;Testphase&quot;.
                      </span>
                    </>
                  )}
                </>
              ) : (
                <>
                  Möchten Sie{" "}
                  <span className="font-semibold">{tenant.name}</span>{" "}
                  reaktivieren? Alle Benutzer des Mandanten können sich
                  danach wieder einloggen. Der Status wird auf
                  &quot;Aktiv&quot; gesetzt.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmToggleStatus}
              className={
                confirmDeactivate?.action === "deactivate"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
            >
              {confirmDeactivate?.action === "deactivate"
                ? "Deaktivieren"
                : "Reaktivieren"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
