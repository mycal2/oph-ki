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

export default function TeamManagementPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  function handleInvited() {
    // Trigger a refresh of the users table
    setRefreshKey((prev) => prev + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Teamverwaltung</h1>
          <p className="text-muted-foreground mt-1">
            Verwalten Sie die Mitarbeiter Ihres Unternehmens.
          </p>
        </div>
        <InviteUserDialog onInvited={handleInvited} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Teammitglieder</CardTitle>
          <CardDescription>
            Alle Mitarbeiter Ihres Mandanten mit ihren Rollen und Status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsersTable refreshKey={refreshKey} />
        </CardContent>
      </Card>
    </div>
  );
}
