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

/**
 * OPH-74: Außendienstler management page.
 * Mirrors the team management page but filtered to sales_rep users only.
 * Visible only to tenant admins when salesforce_enabled = true.
 */
export default function AussendienstlerPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  function handleInvited() {
    setRefreshKey((prev) => prev + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Außendienstler</h1>
          <p className="text-muted-foreground mt-1">
            Verwalten Sie die Außendienstler Ihres Unternehmens.
          </p>
        </div>
        <InviteUserDialog
          onInvited={handleInvited}
          fixedRole="sales_rep"
          buttonLabel="Außendienstler einladen"
          dialogTitle="Außendienstler einladen"
          dialogDescription="Senden Sie eine Einladung per E-Mail. Der eingeladene Außendienstler erhält einen Link, um sein Konto einzurichten."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Außendienstler</CardTitle>
          <CardDescription>
            Alle Außendienstler Ihres Unternehmens mit Status und letztem Login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsersTable refreshKey={refreshKey} roleFilter="sales_rep" />
        </CardContent>
      </Card>
    </div>
  );
}
