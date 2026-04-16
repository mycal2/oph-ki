"use client";

import Link from "next/link";
import { Users, Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface TeamOrActionTileProps {
  /** Active team member count. Pass null if user is not an admin. */
  teamMemberCount: number | null;
  /** Whether the user is a tenant_admin or platform_admin */
  isAdmin: boolean;
}

/**
 * Conditional tile on the dashboard:
 * - For tenant_admin / platform_admin: shows team member count.
 * - For tenant_user: shows a quick-action "Bestellung hochladen" tile.
 */
export function TeamOrActionTile({
  teamMemberCount,
  isAdmin,
}: TeamOrActionTileProps) {
  if (isAdmin && teamMemberCount !== null) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="shrink-0 rounded-md p-2 bg-muted text-muted-foreground">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold leading-none">
              {teamMemberCount}
            </p>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              Teammitglieder
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Link href="/orders/upload" className="block">
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="shrink-0 rounded-md p-2 bg-primary/10 text-primary">
            <Upload className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight">
              Bestellung hochladen
            </p>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              Neue Bestellung starten
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
