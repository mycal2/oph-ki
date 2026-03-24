"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MoreHorizontal,
  Power,
  PowerOff,
  UserPlus,
  MailPlus,
  KeyRound,
  Shield,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { TenantInviteDialog } from "@/components/admin/tenant-invite-dialog";
import { RoleChangeConfirmDialog } from "@/components/admin/role-change-confirm-dialog";
import type { RoleChangeRequest } from "@/components/admin/role-change-confirm-dialog";
import type { TenantUserListItem, UserRole, UserStatus } from "@/lib/types";

const ROLE_LABELS: Record<UserRole, string> = {
  tenant_user: "Benutzer",
  tenant_admin: "Administrator",
  platform_admin: "Platform-Admin",
  platform_viewer: "Platform-Viewer",
};

const STATUS_BADGES: Record<
  UserStatus,
  { label: string; className: string }
> = {
  active: { label: "Aktiv", className: "bg-green-100 text-green-800" },
  inactive: { label: "Inaktiv", className: "text-muted-foreground" },
};

interface TenantUsersTabProps {
  tenantId: string;
  tenantName: string;
  /** Current logged-in user's ID — used to hide self-targeted actions (BUG-2). */
  currentUserId?: string | null;
  onFetchUsers: (tenantId: string) => Promise<TenantUserListItem[]>;
  onInviteUser: (
    email: string,
    role: "tenant_user" | "tenant_admin"
  ) => Promise<{ ok: boolean; error?: string }>;
  onToggleUserStatus: (
    userId: string,
    status: "active" | "inactive"
  ) => Promise<boolean>;
  onResendInvite: (
    userId: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onResetPassword: (
    userId: string
  ) => Promise<{ ok: boolean; error?: string }>;
  isMutating: boolean;
}

export function TenantUsersTab({
  tenantId,
  tenantName,
  currentUserId,
  onFetchUsers,
  onInviteUser,
  onToggleUserStatus,
  onResendInvite,
  onResetPassword,
  isMutating,
}: TenantUsersTabProps) {
  const [users, setUsers] = useState<TenantUserListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);

  // BUG-6: Confirmation dialog state for user deactivation
  const [confirmUserToggle, setConfirmUserToggle] = useState<{
    userId: string;
    userName: string;
    currentStatus: UserStatus;
    action: "deactivate" | "reactivate";
  } | null>(null);

  // OPH-38: Confirmation dialog state for resend invite / password reset
  const [confirmUserAction, setConfirmUserAction] = useState<{
    userId: string;
    userName: string;
    userEmail: string;
    action: "resend-invite" | "reset-password";
  } | null>(null);

  // OPH-41: Confirmation dialog state for role change
  const [confirmRoleChange, setConfirmRoleChange] = useState<RoleChangeRequest | null>(null);

  const loadUsers = useCallback(() => {
    setIsLoading(true);
    onFetchUsers(tenantId).then((u) => {
      setUsers(u);
      setIsLoading(false);
    });
  }, [tenantId, onFetchUsers]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // BUG-6: Show confirmation dialog before toggling user status
  const handleToggleUser = (
    userId: string,
    currentStatus: UserStatus,
    userName: string
  ) => {
    const action = currentStatus === "active" ? "deactivate" : "reactivate";
    setConfirmUserToggle({ userId, userName, currentStatus, action });
  };

  // BUG-6: Confirm user toggle
  const confirmToggleUser = async () => {
    if (!confirmUserToggle) return;
    const { userId, currentStatus } = confirmUserToggle;
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    const ok = await onToggleUserStatus(userId, newStatus);
    if (ok) {
      loadUsers();
    }
    setConfirmUserToggle(null);
  };

  // OPH-38: Execute the confirmed user action
  const confirmUserActionHandler = async () => {
    if (!confirmUserAction) return;
    const { userId, userEmail, action } = confirmUserAction;

    if (action === "resend-invite") {
      const result = await onResendInvite(userId);
      if (result.ok) {
        toast.success(`Einladung erneut gesendet an ${userEmail}.`);
      } else {
        toast.error(
          result.error ?? "Einladung konnte nicht gesendet werden."
        );
      }
    } else {
      const result = await onResetPassword(userId);
      if (result.ok) {
        toast.success(`Passwort-Reset E-Mail gesendet an ${userEmail}.`);
      } else {
        toast.error(
          result.error ??
            "Passwort-Reset konnte nicht ausgelost werden."
        );
      }
    }

    setConfirmUserAction(null);
    loadUsers();
  };

  // OPH-41: Confirm role change
  const confirmRoleChangeHandler = async () => {
    if (!confirmRoleChange) return;
    const { userId, newRole } = confirmRoleChange;

    try {
      const response = await fetch(
        `/api/admin/tenants/${tenantId}/users/${userId}/role`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        }
      );

      const result = await response.json();

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
  };

  const handleInvite = async (
    email: string,
    role: "tenant_user" | "tenant_admin"
  ) => {
    const result = await onInviteUser(email, role);
    if (result.ok) {
      loadUsers();
    }
    return result;
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">
            Benutzer von {tenantName}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setInviteOpen(true)}
          >
            <UserPlus className="mr-1.5 h-4 w-4" />
            Einladen
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Noch keine Benutzer vorhanden.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Rolle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Letzter Login
                  </TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const sBadge = STATUS_BADGES[u.status];
                  const displayName =
                    [u.first_name, u.last_name]
                      .filter(Boolean)
                      .join(" ") || u.email;
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <span className="font-medium text-sm">
                          {displayName}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {u.email}
                        </p>
                        {/* BUG-2: Show role and last login on mobile */}
                        <div className="flex items-center gap-2 mt-1 sm:hidden">
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {ROLE_LABELS[u.role]}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {u.last_sign_in_at
                              ? new Date(
                                  u.last_sign_in_at
                                ).toLocaleDateString("de-DE")
                              : "Nie eingeloggt"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="secondary" className="text-xs">
                          {ROLE_LABELS[u.role]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {u.status === "inactive" ? (
                            <Badge
                              variant="outline"
                              className={`text-xs ${sBadge.className}`}
                            >
                              {sBadge.label}
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className={`text-xs ${sBadge.className}`}
                            >
                              {sBadge.label}
                            </Badge>
                          )}
                          {/* OPH-38: Show pending indicator */}
                          {!u.email_confirmed_at &&
                            u.status === "active" && (
                              <span className="flex items-center gap-1 text-[11px] text-amber-600">
                                <MailPlus className="h-3 w-3" />
                                Einladung ausstehend
                              </span>
                            )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                        {u.last_sign_in_at
                          ? new Date(
                              u.last_sign_in_at
                            ).toLocaleDateString("de-DE")
                          : !u.email_confirmed_at && u.created_at
                            ? (
                                <span title="Einladung gesendet am">
                                  Eingeladen:{" "}
                                  {new Date(
                                    u.created_at
                                  ).toLocaleDateString("de-DE")}
                                </span>
                              )
                            : "\u2014"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              type="button"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {/* OPH-38: Resend invite */}
                            {!u.email_confirmed_at &&
                              u.status === "active" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setConfirmUserAction({
                                      userId: u.id,
                                      userName: displayName,
                                      userEmail: u.email,
                                      action: "resend-invite",
                                    })
                                  }
                                >
                                  <MailPlus className="mr-2 h-4 w-4" />
                                  Einladung erneut senden
                                </DropdownMenuItem>
                              )}
                            {/* OPH-38: Password reset */}
                            {u.status === "active" && (
                              <DropdownMenuItem
                                onClick={() =>
                                  setConfirmUserAction({
                                    userId: u.id,
                                    userName: displayName,
                                    userEmail: u.email,
                                    action: "reset-password",
                                  })
                                }
                              >
                                <KeyRound className="mr-2 h-4 w-4" />
                                Passwort zurucksetzen
                              </DropdownMenuItem>
                            )}
                            {/* OPH-41: Role change option for active, non-platform_admin, non-self users */}
                            {u.status === "active" &&
                              u.role !== "platform_admin" &&
                              u.id !== currentUserId && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setConfirmRoleChange({
                                      userId: u.id,
                                      userName: displayName,
                                      currentRole: u.role,
                                      newRole:
                                        u.role === "tenant_user"
                                          ? "tenant_admin"
                                          : "tenant_user",
                                    })
                                  }
                                >
                                  {u.role === "tenant_user" ? (
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
                            {u.status === "active" ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleToggleUser(
                                    u.id,
                                    u.status,
                                    displayName
                                  )
                                }
                                className="text-destructive"
                              >
                                <PowerOff className="mr-2 h-4 w-4" />
                                Deaktivieren
                              </DropdownMenuItem>
                            ) : (
                              <>
                                <DropdownMenuItem
                                  disabled
                                  title="Benutzer ist deaktiviert"
                                >
                                  <MailPlus className="mr-2 h-4 w-4" />
                                  Einladung erneut senden
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled
                                  title="Benutzer ist deaktiviert"
                                >
                                  <KeyRound className="mr-2 h-4 w-4" />
                                  Passwort zurucksetzen
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleToggleUser(
                                      u.id,
                                      u.status,
                                      displayName
                                    )
                                  }
                                >
                                  <Power className="mr-2 h-4 w-4" />
                                  Reaktivieren
                                </DropdownMenuItem>
                              </>
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
        )}
      </div>

      {/* Invite dialog */}
      <TenantInviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        tenantName={tenantName}
        onInvite={handleInvite}
        isMutating={isMutating}
      />

      {/* BUG-6: Confirmation dialog for user deactivation/reactivation */}
      <AlertDialog
        open={!!confirmUserToggle}
        onOpenChange={(open) => {
          if (!open) setConfirmUserToggle(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmUserToggle?.action === "deactivate"
                ? "Benutzer deaktivieren?"
                : "Benutzer reaktivieren?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmUserToggle?.action === "deactivate" ? (
                <>
                  Sind Sie sicher, dass Sie{" "}
                  <span className="font-semibold">
                    {confirmUserToggle?.userName}
                  </span>{" "}
                  deaktivieren mochten? Der Benutzer kann sich danach nicht
                  mehr einloggen.
                </>
              ) : (
                <>
                  Mochten Sie{" "}
                  <span className="font-semibold">
                    {confirmUserToggle?.userName}
                  </span>{" "}
                  reaktivieren? Der Benutzer kann sich danach wieder
                  einloggen.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmToggleUser}
              className={
                confirmUserToggle?.action === "deactivate"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
            >
              {confirmUserToggle?.action === "deactivate"
                ? "Deaktivieren"
                : "Reaktivieren"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* OPH-38: Confirmation dialog for resend invite / password reset */}
      <AlertDialog
        open={!!confirmUserAction}
        onOpenChange={(open) => {
          if (!open) setConfirmUserAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmUserAction?.action === "resend-invite"
                ? "Einladung erneut senden?"
                : "Passwort zurucksetzen?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmUserAction?.action === "resend-invite" ? (
                <>
                  Eine neue Einladungs-E-Mail wird an{" "}
                  <span className="font-semibold">
                    {confirmUserAction?.userEmail}
                  </span>{" "}
                  gesendet. Der Benutzer kann damit sein Konto aktivieren.
                </>
              ) : (
                <>
                  Eine Passwort-Reset-E-Mail wird an{" "}
                  <span className="font-semibold">
                    {confirmUserAction?.userEmail}
                  </span>{" "}
                  gesendet. Der Benutzer kann damit ein neues Passwort
                  festlegen.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUserActionHandler}>
              {confirmUserAction?.action === "resend-invite"
                ? "Einladung senden"
                : "Reset senden"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
