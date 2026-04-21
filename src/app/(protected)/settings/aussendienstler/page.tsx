"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InviteUserDialog } from "@/components/team/invite-user-dialog";
import { UsersTable } from "@/components/team/users-table";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import { usePlatformTenantContext } from "@/hooks/use-platform-tenant-context";
import {
  TenantContextBanner,
  TenantContextRequired,
} from "@/components/layout/tenant-context-required";

/**
 * OPH-74: Aussendienstler management page.
 * Mirrors the team management page but filtered to sales_rep users only.
 * Visible only to tenant admins when salesforce_enabled = true.
 *
 * OPH-92: For platform admins, requires an active tenant context.
 */
export default function AussendienstlerPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { isPlatformAdmin } = useCurrentUserRole();
  const { activeTenant } = usePlatformTenantContext();

  function handleInvited() {
    setRefreshKey((prev) => prev + 1);
  }

  // OPH-92: Platform admin must select a tenant context for Stammdaten pages
  if (isPlatformAdmin && !activeTenant) {
    return <TenantContextRequired />;
  }

  return (
    <div className="space-y-6">
      {/* OPH-92: Show tenant context banner for platform admins */}
      {isPlatformAdmin && activeTenant && (
        <TenantContextBanner activeTenant={activeTenant} />
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Aussendienstler</h1>
          <p className="text-muted-foreground mt-1">
            Verwalten Sie die Aussendienstler Ihres Unternehmens.
          </p>
        </div>
        {!isPlatformAdmin && (
          <InviteUserDialog
            onInvited={handleInvited}
            fixedRole="sales_rep"
            buttonLabel="Aussendienstler einladen"
            dialogTitle="Aussendienstler einladen"
            dialogDescription="Senden Sie eine Einladung per E-Mail. Der eingeladene Aussendienstler erhaelt einen Link, um sein Konto einzurichten."
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aussendienstler</CardTitle>
          <CardDescription>
            Alle Aussendienstler Ihres Unternehmens mit Status und letztem Login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsersTable
            refreshKey={refreshKey}
            roleFilter="sales_rep"
            adminTenantId={isPlatformAdmin && activeTenant ? activeTenant.tenantId : undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}
