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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { RoleChangeConfirmDialog } from "@/components/admin/role-change-confirm-dialog";
import type { RoleChangeRequest } from "@/components/admin/role-change-confirm-dialog";
import type { TeamMember, UserRole, ApiResponse } from "@/lib/types";
import {
  Loader2,
  UserX,
  UserCheck,
  Users,
  MoreHorizontal,
  Shield,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

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

  // OPH-41: Current user info for role change guards
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);

  // OPH-41: Confirmation dialog state for role change
  const [confirmRoleChange, setConfirmRoleChange] = useState<RoleChangeRequest | null>(null);

  // OPH-41: Load current user info
  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          setCurrentUserId(user.id);
          const role =
            (user.app_metadata?.role as UserRole) ?? "tenant_user";
          setCurrentUserRole(role);
        }
      } catch {
        // Ignore — role change UI just won't show
      }
    }

    loadCurrentUser();
  }, []);

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

  // OPH-41: Confirm role change
  async function confirmRoleChangeHandler() {
    if (!confirmRoleChange) return;
    const { userId, newRole } = confirmRoleChange;

    try {
      const response = await fetch(`/api/team/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      const result: ApiResponse = await response.json();

      if (result.success) {
        toast.success(
          "Rolle erfolgreich geändert. Der Benutzer muss sich neu anmelden."
        );
        loadUsers();
      } else {
        toast.error(result.error ?? "Rolle konnte nicht geändert werden.");
      }
    } catch {
      toast.error("Rolle konnte nicht geändert werden.");
    }

    setConfirmRoleChange(null);
  }

  // OPH-41: Whether the current user can change roles
  const canChangeRoles =
    currentUserRole === "tenant_admin" || currentUserRole === "platform_admin";

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
    <>
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

                // OPH-41: Can this user's role be changed?
                const canChangeThisUserRole =
                  canChangeRoles &&
                  user.status === "active" &&
                  user.role !== "platform_admin" &&
                  user.id !== currentUserId;

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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            type="button"
                            disabled={togglingUserId === user.id}
                          >
                            {togglingUserId === user.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreHorizontal className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {/* OPH-41: Role change option */}
                          {canChangeThisUserRole && (
                            <DropdownMenuItem
                              onClick={() =>
                                setConfirmRoleChange({
                                  userId: user.id,
                                  userName: displayName,
                                  currentRole: user.role,
                                  newRole:
                                    user.role === "tenant_user"
                                      ? "tenant_admin"
                                      : "tenant_user",
                                })
                              }
                            >
                              {user.role === "tenant_user" ? (
                                <>
                                  <Shield className="mr-2 h-4 w-4" />
                                  Zu Administrator machen
                                </>
                              ) : (
                                <>
                                  <ShieldOff className="mr-2 h-4 w-4" />
                                  Zu Benutzer machen
                                </>
                              )}
                            </DropdownMenuItem>
                          )}
                          {user.status === "active" ? (
                            <DropdownMenuItem
                              onClick={() => handleToggleStatus(user)}
                              className="text-destructive"
                            >
                              <UserX className="mr-2 h-4 w-4" />
                              Deaktivieren
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => handleToggleStatus(user)}
                            >
                              <UserCheck className="mr-2 h-4 w-4" />
                              Reaktivieren
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* OPH-41: Confirmation dialog for role change */}
      <RoleChangeConfirmDialog
        request={confirmRoleChange}
        onOpenChange={(open) => {
          if (!open) setConfirmRoleChange(null);
        }}
        onConfirm={confirmRoleChangeHandler}
      />
    </>
  );
}
