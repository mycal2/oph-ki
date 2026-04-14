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

type CatalogType = "Artikelstamm" | "Kundenstamm";

interface CatalogResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogType: CatalogType;
  tenantName: string;
  recordCount: number;
  onConfirm: () => Promise<{ ok: boolean; deleted?: number; error?: string }>;
}

const CATALOG_LABELS: Record<CatalogType, { singular: string; plural: string }> = {
  Artikelstamm: { singular: "Artikel", plural: "Artikel" },
  Kundenstamm: { singular: "Kunde", plural: "Kunden" },
};

export function CatalogResetDialog({
  open,
  onOpenChange,
  catalogType,
  tenantName,
  recordCount,
  onConfirm,
}: CatalogResetDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labels = CATALOG_LABELS[catalogType];
  const recordLabel = recordCount === 1 ? labels.singular : labels.plural;

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
    // Prevent closing while deletion is in progress
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
            Gesamten {catalogType} loeschen?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Alle {recordCount.toLocaleString("de-DE")} {recordLabel} von{" "}
            <span className="font-medium">{tenantName}</span> werden
            unwiderruflich geloescht. Diese Aktion kann nicht rueckgaengig
            gemacht werden.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isDeleting}
            autoFocus
          >
            Abbrechen
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Alles loeschen
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
