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
  newRole: "tenant_user" | "tenant_admin";
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
  const newRoleLabel =
    request?.newRole === "tenant_admin" ? "Administrator" : "Benutzer";

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
            {request?.newRole === "tenant_admin" ? (
              <>
                <span className="font-semibold">{request?.userName}</span>{" "}
                erhält Administrator-Rechte und kann Teammitglieder verwalten.
                Der Benutzer muss sich neu anmelden, damit die Änderung wirksam
                wird.
              </>
            ) : (
              <>
                <span className="font-semibold">{request?.userName}</span>{" "}
                verliert Administrator-Rechte und kann keine Teammitglieder mehr
                verwalten. Der Benutzer muss sich neu anmelden, damit die
                Änderung wirksam wird.
              </>
            )}
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
