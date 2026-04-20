"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle } from "lucide-react";
import type { ApiResponse } from "@/lib/types";

interface EditNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  email: string;
  currentFirstName: string;
  currentLastName: string;
  onSaved: (firstName: string, lastName: string) => void;
}

export function EditNameDialog({
  open,
  onOpenChange,
  userId,
  email,
  currentFirstName,
  currentLastName,
  onSaved,
}: EditNameDialogProps) {
  const [firstName, setFirstName] = useState(currentFirstName);
  const [lastName, setLastName] = useState(currentLastName);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens with new data
  useEffect(() => {
    if (open) {
      setFirstName(currentFirstName);
      setLastName(currentLastName);
      setError(null);
    }
  }, [open, currentFirstName, currentLastName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    // Client-side validation
    if (!trimmedFirst) {
      setError("Vorname darf nicht leer sein.");
      setIsLoading(false);
      return;
    }
    if (!trimmedLast) {
      setError("Nachname darf nicht leer sein.");
      setIsLoading(false);
      return;
    }
    if (trimmedFirst.length > 100) {
      setError("Vorname darf maximal 100 Zeichen lang sein.");
      setIsLoading(false);
      return;
    }
    if (trimmedLast.length > 100) {
      setError("Nachname darf maximal 100 Zeichen lang sein.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/team/${userId}/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: trimmedFirst,
          last_name: trimmedLast,
        }),
      });

      const result: ApiResponse = await response.json();

      if (result.success) {
        onSaved(trimmedFirst, trimmedLast);
        onOpenChange(false);
      } else {
        setError(result.error ?? "Name konnte nicht geändert werden.");
      }
    } catch {
      setError("Verbindungsfehler. Bitte versuchen Sie es erneut.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Name bearbeiten</DialogTitle>
          <DialogDescription>
            Ändern Sie den Vor- und Nachnamen dieses Benutzers.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Read-only email for context */}
            <div className="space-y-2">
              <Label className="text-muted-foreground">E-Mail</Label>
              <p className="text-sm">{email}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-first-name">Vorname</Label>
              <Input
                id="edit-first-name"
                type="text"
                placeholder="Vorname"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                maxLength={100}
                disabled={isLoading}
                aria-label="Vorname"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-last-name">Nachname</Label>
              <Input
                id="edit-last-name"
                type="text"
                placeholder="Nachname"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                maxLength={100}
                disabled={isLoading}
                aria-label="Nachname"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Abbrechen
            </Button>
            <Button type="submit" className="font-bold" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Speichern...
                </>
              ) : (
                "Speichern"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
