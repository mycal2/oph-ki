"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
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
import { toast } from "sonner";
import type { ApiResponse, OrderDeleteResponse } from "@/lib/types";

interface DeleteOrderDialogProps {
  orderId: string;
  fileName: string;
  fileCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function DeleteOrderDialog({
  orderId,
  fileName,
  fileCount,
  open,
  onOpenChange,
  onDeleted,
}: DeleteOrderDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    try {
      setIsDeleting(true);
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as ApiResponse<OrderDeleteResponse>;

      if (!json.success) {
        toast.error(json.error ?? "Fehler beim Löschen der Bestellung.");
        return;
      }

      toast.success("Bestellung erfolgreich gelöscht.");
      onOpenChange(false);
      onDeleted();
    } catch {
      toast.error("Verbindungsfehler beim Löschen der Bestellung.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bestellung endgültig löschen?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Sie sind dabei, die Bestellung{" "}
                <span className="font-medium text-foreground">{fileName}</span>{" "}
                zu löschen.
              </p>
              <p>
                Diese Bestellung und alle zugehörigen Dateien ({fileCount}{" "}
                {fileCount === 1 ? "Datei" : "Dateien"}) werden unwiderruflich
                gelöscht.
              </p>
              <p>Dieser Vorgang kann nicht rückgängig gemacht werden.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            Abbrechen
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Endgültig löschen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
