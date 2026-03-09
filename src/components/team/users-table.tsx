"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { TeamMember, UserRole, ApiResponse } from "@/lib/types";
import { Loader2, UserX, UserCheck, Users } from "lucide-react";

function getRoleLabel(role: UserRole): string {
  switch (role) {
    case "tenant_admin":
      return "Administrator";
    case "tenant_user":
      return "Mitarbeiter";
    case "platform_admin":
      return "Plattform-Admin";
    default:
      return role;
  }
}

function getRoleBadgeVariant(
  role: UserRole
): "default" | "secondary" | "outline" {
  switch (role) {
    case "tenant_admin":
      return "default";
    case "platform_admin":
      return "default";
    default:
      return "secondary";
  }
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "Nie";
  const date = new Date(dateString);
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface UsersTableProps {
  refreshKey?: number;
}

export function UsersTable({ refreshKey }: UsersTableProps) {
  const [users, setUsers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/team/members");
      const result: ApiResponse<TeamMember[]> = await response.json();

      if (result.success && result.data) {
        setUsers(result.data);
      } else {
        setError(result.error ?? "Teammitglieder konnten nicht geladen werden.");
      }
    } catch {
      setError("Teammitglieder konnten nicht geladen werden.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers, refreshKey]);

  async function handleToggleStatus(user: TeamMember) {
    const newStatus = user.status === "active" ? "inactive" : "active";
    setTogglingUserId(user.id);
    setError(null);

    try {
      const response = await fetch(`/api/team/${user.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const result: ApiResponse = await response.json();

      if (result.success) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === user.id ? { ...u, status: newStatus } : u
          )
        );
      } else if (result.error) {
        setError(result.error);
      }
    } catch {
      setError("Status konnte nicht geändert werden.");
    } finally {
      setTogglingUserId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (error && users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground text-sm mb-4">{error}</p>
        <Button variant="outline" onClick={loadUsers}>
          Erneut versuchen
        </Button>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground text-sm">
          Noch keine Teammitglieder vorhanden. Laden Sie Ihren ersten
          Mitarbeiter ein.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">E-Mail</TableHead>
              <TableHead>Rolle</TableHead>
              <TableHead className="hidden md:table-cell">
                Letzter Login
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const displayName =
                user.first_name && user.last_name
                  ? `${user.first_name} ${user.last_name}`
                  : user.email;

              return (
                <TableRow key={user.id}>
                  <TableCell>
                    <div>
                      <p className="font-semibold">{displayName}</p>
                      <p className="text-xs text-muted-foreground sm:hidden">
                        {user.email}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(user.role)}>
                      {getRoleLabel(user.role)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                    {formatDate(user.last_sign_in_at)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={user.status === "active" ? "secondary" : "outline"}
                      className={
                        user.status === "active"
                          ? "bg-green-100 text-green-700 border-green-200"
                          : "bg-red-50 text-red-600 border-red-200"
                      }
                    >
                      {user.status === "active" ? "Aktiv" : "Inaktiv"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleStatus(user)}
                      disabled={togglingUserId === user.id}
                      aria-label={
                        user.status === "active"
                          ? `${displayName} deaktivieren`
                          : `${displayName} reaktivieren`
                      }
                    >
                      {togglingUserId === user.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : user.status === "active" ? (
                        <>
                          <UserX className="h-4 w-4 text-destructive" />
                          <span className="hidden lg:inline text-destructive">
                            Deaktivieren
                          </span>
                        </>
                      ) : (
                        <>
                          <UserCheck className="h-4 w-4 text-green-600" />
                          <span className="hidden lg:inline text-green-600">
                            Reaktivieren
                          </span>
                        </>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
