"use client";

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

export interface RoleChangeRequest {
  userId: string;
  userName: string;
  currentRole: string;
  newRole: "tenant_user" | "tenant_admin" | "platform_admin" | "platform_viewer";
}

interface RoleChangeConfirmDialogProps {
  request: RoleChangeRequest | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function RoleChangeConfirmDialog({
  request,
  onOpenChange,
  onConfirm,
}: RoleChangeConfirmDialogProps) {
  const ROLE_LABELS: Record<string, string> = {
    tenant_admin: "Administrator",
    tenant_user: "Benutzer",
    platform_admin: "Plattform-Admin",
    platform_viewer: "Plattform-Viewer",
  };
  const newRoleLabel = ROLE_LABELS[request?.newRole ?? ""] ?? request?.newRole;

  return (
    <AlertDialog
      open={!!request}
      onOpenChange={onOpenChange}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Rolle von {request?.userName} zu {newRoleLabel} ändern?
          </AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-semibold">{request?.userName}</span>{" "}
            wird von {ROLE_LABELS[request?.currentRole ?? ""] ?? request?.currentRole}{" "}
            zu {newRoleLabel} geändert. Der Benutzer muss sich neu anmelden,
            damit die Änderung wirksam wird.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Rolle ändern
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
