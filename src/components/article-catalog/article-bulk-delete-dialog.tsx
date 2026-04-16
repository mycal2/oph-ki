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

interface ArticleBulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: () => Promise<{ ok: boolean; deleted?: number; error?: string }>;
}

export function ArticleBulkDeleteDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
}: ArticleBulkDeleteDialogProps) {
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

  const handleOpenChange = (value: boolean) => {
    if (!isDeleting) {
      setError(null);
      onOpenChange(value);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {count} {count === 1 ? "Artikel" : "Artikel"} loeschen?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Diese Aktion kann nicht rueckgaengig gemacht werden. Bereits
            verarbeitete Bestellungen sind davon nicht betroffen.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
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
            {count} {count === 1 ? "Artikel" : "Artikel"} loeschen
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
