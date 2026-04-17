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
  Mail,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

function getRoleLabel(role: UserRole): string {
  switch (role) {
    case "tenant_admin":
      return "Administrator";
    case "tenant_user":
      return "Mitarbeiter";
    case "sales_rep":
      return "Außendienstler";
    case "platform_admin":
      return "Plattform-Admin";
    case "platform_viewer":
      return "Plattform-Viewer";
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
    case "platform_viewer":
      return "secondary";
    default:
      return "secondary";
  }
}

/** OPH-48: Whether a user is a platform team member. */
function isPlatformRole(role: UserRole): boolean {
  return role === "platform_admin" || role === "platform_viewer";
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
  /** OPH-74: Optional role filter — only show users with this role. */
  roleFilter?: UserRole;
}

export function UsersTable({ refreshKey, roleFilter }: UsersTableProps) {
  const [users, setUsers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // OPH-41: Current user info for role change guards
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);

  // OPH-41: Confirmation dialog state for role change
  const [confirmRoleChange, setConfirmRoleChange] = useState<RoleChangeRequest | null>(null);

  // OPH-48: Confirmation dialog states for resend invite and reset password
  const [confirmResendInvite, setConfirmResendInvite] = useState<{ userId: string; userName: string } | null>(null);
  const [confirmResetPassword, setConfirmResetPassword] = useState<{ userId: string; userName: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
      const url = roleFilter
        ? `/api/team/members?role=${encodeURIComponent(roleFilter)}`
        : "/api/team/members";
      const response = await fetch(url);
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
  }, [roleFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers, refreshKey, roleFilter]);

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

  // OPH-48: Resend invite handler
  async function handleResendInvite() {
    if (!confirmResendInvite) return;
    setActionLoading(confirmResendInvite.userId);
    try {
      const response = await fetch(`/api/team/${confirmResendInvite.userId}/resend-invite`, {
        method: "POST",
      });
      const result: ApiResponse = await response.json();
      if (result.success) {
        toast.success("Einladung wurde erneut gesendet.");
      } else {
        toast.error(result.error ?? "Einladung konnte nicht gesendet werden.");
      }
    } catch {
      toast.error("Einladung konnte nicht gesendet werden.");
    }
    setActionLoading(null);
    setConfirmResendInvite(null);
  }

  // OPH-48: Reset password handler
  async function handleResetPassword() {
    if (!confirmResetPassword) return;
    setActionLoading(confirmResetPassword.userId);
    try {
      const response = await fetch(`/api/team/${confirmResetPassword.userId}/reset-password`, {
        method: "POST",
      });
      const result: ApiResponse = await response.json();
      if (result.success) {
        toast.success("Passwort-Reset-E-Mail wurde gesendet.");
      } else {
        toast.error(result.error ?? "Passwort-Reset konnte nicht ausgelöst werden.");
      }
    } catch {
      toast.error("Passwort-Reset konnte nicht ausgelöst werden.");
    }
    setActionLoading(null);
    setConfirmResetPassword(null);
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
          {roleFilter === "sales_rep"
            ? "Noch keine Außendienstler vorhanden. Laden Sie Ihren ersten Außendienstler ein."
            : "Noch keine Teammitglieder vorhanden. Laden Sie Ihren ersten Mitarbeiter ein."}
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

                // OPH-41/48: Can this user's role be changed?
                const isSelf = user.id === currentUserId;
                const isTargetPlatform = isPlatformRole(user.role);
                const canChangeThisUserRole =
                  canChangeRoles &&
                  user.status === "active" &&
                  !isSelf &&
                  // Platform users: only platform_admin can change
                  (isTargetPlatform ? currentUserRole === "platform_admin" : !isPlatformRole(user.role));

                // OPH-48: Pending user = never signed in (proxy for unconfirmed)
                const isPending = user.last_sign_in_at === null;
                // OPH-48/74: Can resend invite (platform_admin or tenant_admin, not self, pending, active)
                const canResendInvite =
                  (currentUserRole === "platform_admin" || currentUserRole === "tenant_admin") && !isSelf && isPending && user.status === "active";
                // OPH-48: Can reset password (platform_admin, not self, active, confirmed)
                const canResetPassword =
                  currentUserRole === "platform_admin" && !isSelf && !isPending && user.status === "active";

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
                          {/* OPH-48: Resend invite (pending users only) */}
                          {canResendInvite && (
                            <DropdownMenuItem
                              onClick={() => setConfirmResendInvite({ userId: user.id, userName: displayName })}
                            >
                              <Mail className="mr-2 h-4 w-4" />
                              Einladung erneut senden
                            </DropdownMenuItem>
                          )}
                          {/* OPH-48: Reset password (confirmed, active users) */}
                          {canResetPassword && (
                            <DropdownMenuItem
                              onClick={() => setConfirmResetPassword({ userId: user.id, userName: displayName })}
                            >
                              <KeyRound className="mr-2 h-4 w-4" />
                              Passwort zurücksetzen
                            </DropdownMenuItem>
                          )}
                          {/* OPH-41/48: Role change option */}
                          {canChangeThisUserRole && (
                            <DropdownMenuItem
                              onClick={() => {
                                const newRole = isTargetPlatform
                                  ? (user.role === "platform_admin" ? "platform_viewer" : "platform_admin")
                                  : (user.role === "tenant_user" ? "tenant_admin" : "tenant_user");
                                setConfirmRoleChange({
                                  userId: user.id,
                                  userName: displayName,
                                  currentRole: user.role,
                                  newRole,
                                });
                              }}
                            >
                              {(user.role === "tenant_user" || user.role === "platform_viewer") ? (
                                <>
                                  <Shield className="mr-2 h-4 w-4" />
                                  {isTargetPlatform ? "Zu Plattform-Admin machen" : "Zu Administrator machen"}
                                </>
                              ) : (
                                <>
                                  <ShieldOff className="mr-2 h-4 w-4" />
                                  {isTargetPlatform ? "Zu Plattform-Viewer machen" : "Zu Benutzer machen"}
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

      {/* OPH-48: Confirmation dialog for resend invite */}
      <AlertDialog
        open={!!confirmResendInvite}
        onOpenChange={(open) => { if (!open) setConfirmResendInvite(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Einladung erneut senden?</AlertDialogTitle>
            <AlertDialogDescription>
              Eine neue Einladungs-E-Mail wird an{" "}
              <span className="font-semibold">{confirmResendInvite?.userName}</span>{" "}
              gesendet. Der vorherige Einladungslink wird ungültig.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!actionLoading}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleResendInvite} disabled={!!actionLoading}>
              {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Einladung senden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* OPH-48: Confirmation dialog for reset password */}
      <AlertDialog
        open={!!confirmResetPassword}
        onOpenChange={(open) => { if (!open) setConfirmResetPassword(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Passwort zurücksetzen?</AlertDialogTitle>
            <AlertDialogDescription>
              Eine Passwort-Reset-E-Mail wird an{" "}
              <span className="font-semibold">{confirmResetPassword?.userName}</span>{" "}
              gesendet. Der Benutzer kann dann ein neues Passwort festlegen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!actionLoading}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetPassword} disabled={!!actionLoading}>
              {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Passwort zurücksetzen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
