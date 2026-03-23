"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface CustomerDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerNumber: string;
  companyName: string;
  onConfirm: () => Promise<{ ok: boolean; error?: string }>;
}

export function CustomerDeleteDialog({
  open,
  onOpenChange,
  customerNumber,
  companyName,
  onConfirm,
}: CustomerDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsDeleting(true);
    setError(null);

    const result = await onConfirm();

    if (result.ok) {
      onOpenChange(false);
    } else {
      setError(result.error ?? "Fehler beim Loeschen.");
    }

    setIsDeleting(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Kunde loeschen?</AlertDialogTitle>
          <AlertDialogDescription>
            Moechten Sie den Kunden{" "}
            <span className="font-semibold">{customerNumber}</span> ({companyName})
            wirklich loeschen? Bereits verarbeitete Bestellungen sind davon nicht
            betroffen.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Abbrechen
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Loeschen
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
