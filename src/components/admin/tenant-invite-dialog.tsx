"use client";

import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TenantInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantName: string;
  onInvite: (email: string, role: "tenant_user" | "tenant_admin") => Promise<{ ok: boolean; error?: string }>;
  isMutating: boolean;
}

export function TenantInviteDialog({
  open,
  onOpenChange,
  tenantName,
  onInvite,
  isMutating,
}: TenantInviteDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"tenant_user" | "tenant_admin">("tenant_user");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setEmail("");
    setRole("tenant_user");
    setError(null);
    setSuccess(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) reset();
    onOpenChange(newOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!email.trim()) {
      setError("E-Mail-Adresse ist erforderlich.");
      return;
    }

    const result = await onInvite(email.trim(), role);
    if (result.ok) {
      setSuccess(true);
    } else {
      setError(result.error ?? "Einladung konnte nicht gesendet werden.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Benutzer einladen</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Einladung im Namen von <span className="font-medium">{tenantName}</span>
          </p>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            </div>
            <p className="text-center font-semibold text-green-700">
              Einladung wurde erfolgreich gesendet.
            </p>
            <p className="text-center text-sm text-muted-foreground">{email}</p>
            <DialogFooter className="mt-2 w-full">
              <Button className="w-full" onClick={() => handleOpenChange(false)}>
                Schließen
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="invite-email">E-Mail-Adresse *</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="benutzer@beispiel.de"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-role">Rolle *</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "tenant_user" | "tenant_admin")}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant_user">Benutzer</SelectItem>
                  <SelectItem value="tenant_admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isMutating}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={isMutating || !email.trim()}>
                {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Einladung senden
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
