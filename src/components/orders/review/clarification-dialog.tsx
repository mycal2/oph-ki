"use client";

import { useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const MAX_NOTE_LENGTH = 500;

interface ClarificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user confirms. Passes the optional note text. */
  onConfirm: (note: string | null) => void;
  /** Whether the confirm action is currently in progress. */
  isSubmitting: boolean;
  /** Pre-fill the note field with an existing note (for re-editing). */
  existingNote?: string | null;
}

/**
 * OPH-93: Dialog for setting clarification status on an order.
 * Contains an optional free-text note field (max 500 chars) and confirm/cancel buttons.
 */
export function ClarificationDialog({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting,
  existingNote,
}: ClarificationDialogProps) {
  const [note, setNote] = useState(existingNote ?? "");

  // Reset note when dialog opens with a new existingNote
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (newOpen) {
        setNote(existingNote ?? "");
      }
      onOpenChange(newOpen);
    },
    [existingNote, onOpenChange]
  );

  const handleConfirm = useCallback(() => {
    const trimmed = note.trim();
    onConfirm(trimmed.length > 0 ? trimmed : null);
  }, [note, onConfirm]);

  const charsRemaining = MAX_NOTE_LENGTH - note.length;
  const isOverLimit = charsRemaining < 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Klärung markieren</DialogTitle>
          <DialogDescription>
            Markieren Sie diese Bestellung als klärungsbedürftig.
            Optional können Sie eine Notiz hinzufügen, um den Grund zu beschreiben.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="clarification-note">
            Klärungsnotiz <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea
            id="clarification-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z.B. Artikelnummer 330-104 unbekannt — Rückfrage an Henry Schein gestellt"
            rows={3}
            maxLength={MAX_NOTE_LENGTH + 10}
            disabled={isSubmitting}
            aria-describedby="clarification-note-counter"
            className={isOverLimit ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          <p
            id="clarification-note-counter"
            className={`text-xs text-right ${
              isOverLimit
                ? "text-destructive"
                : charsRemaining <= 50
                  ? "text-amber-600"
                  : "text-muted-foreground"
            }`}
          >
            {note.length}/{MAX_NOTE_LENGTH} Zeichen
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || isOverLimit}
            className="gap-1.5 border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
            variant="outline"
          >
            {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Bestätigen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
