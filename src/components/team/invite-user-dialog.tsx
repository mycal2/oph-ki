"use client";

import { useState } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, UserPlus, CheckCircle2 } from "lucide-react";
import type { ApiResponse } from "@/lib/types";

interface InviteUserDialogProps {
  onInvited?: () => void;
}

export function InviteUserDialog({ onInvited }: InviteUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function resetForm() {
    setEmail("");
    setRole("");
    setError(null);
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });

      const result: ApiResponse = await response.json();

      if (result.success) {
        setSuccess(true);
        onInvited?.();
        // Auto-close after showing success
        setTimeout(() => {
          setOpen(false);
          resetForm();
        }, 2000);
      } else {
        setError(result.error ?? "Ein unbekannter Fehler ist aufgetreten.");
      }
    } catch {
      setError("Verbindungsfehler. Bitte versuchen Sie es erneut.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button className="font-bold">
          <UserPlus className="h-4 w-4" />
          Mitarbeiter einladen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mitarbeiter einladen</DialogTitle>
          <DialogDescription>
            Senden Sie eine Einladung per E-Mail. Der eingeladene Mitarbeiter
            erhaelt einen Link, um sein Konto einzurichten.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-sm font-semibold">
              Einladung gesendet an {email}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="invite-email">E-Mail-Adresse</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="kollege@unternehmen.de"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  aria-label="E-Mail-Adresse des einzuladenden Mitarbeiters"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Rolle</Label>
                <Select value={role} onValueChange={setRole} required>
                  <SelectTrigger id="invite-role" aria-label="Rolle auswaehlen">
                    <SelectValue placeholder="Rolle auswaehlen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tenant_user">
                      Mitarbeiter
                    </SelectItem>
                    <SelectItem value="tenant_admin">
                      Administrator
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Administratoren koennen weitere Mitarbeiter einladen und
                  verwalten.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isLoading}
              >
                Abbrechen
              </Button>
              <Button
                type="submit"
                className="font-bold"
                disabled={isLoading || !role}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Senden...
                  </>
                ) : (
                  "Einladung senden"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
