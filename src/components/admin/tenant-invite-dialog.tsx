"use client";

import { useRef, useState } from "react";
import { Loader2, CheckCircle2, Mail, Link as LinkIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";

/** OPH-97: Two ways to deliver an invite. */
type InviteMode = "send" | "link";

/** Roles the platform admin may assign through this dialog. */
type InvitableRole = "tenant_user" | "tenant_admin" | "sales_rep";

export interface TenantInviteDialogResult {
  ok: boolean;
  error?: string;
  /** OPH-97: Present only when `generateLinkOnly` was true. */
  inviteLink?: string;
}

interface TenantInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantName: string;
  /** Invites are blocked for trial / inactive tenants — pass status so the dialog can disable itself. */
  tenantStatus?: "active" | "inactive" | "trial";
  /** When true, "Außendienst" (sales_rep) becomes selectable as a role. */
  salesforceEnabled?: boolean;
  onInvite: (
    email: string,
    role: InvitableRole,
    generateLinkOnly: boolean
  ) => Promise<TenantInviteDialogResult>;
  /**
   * OPH-97: Called after a successful link generation so the parent can open
   * the copy-to-clipboard dialog.
   */
  onLinkGenerated?: (inviteLink: string, email: string) => void;
  isMutating: boolean;
}

export function TenantInviteDialog({
  open,
  onOpenChange,
  tenantName,
  tenantStatus = "active",
  salesforceEnabled = false,
  onInvite,
  onLinkGenerated,
  isMutating,
}: TenantInviteDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("tenant_user");
  const [mode, setMode] = useState<InviteMode>("send");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // BUG-7: refs to support arrow-key navigation between mode buttons.
  const sendBtnRef = useRef<HTMLButtonElement>(null);
  const linkBtnRef = useRef<HTMLButtonElement>(null);

  // BUG-4: Trial / inactive tenants cannot have invited team members.
  const inviteBlocked = tenantStatus === "trial" || tenantStatus === "inactive";
  const blockedReason =
    tenantStatus === "inactive"
      ? "Mandant ist deaktiviert. Einladungen sind nicht möglich."
      : tenantStatus === "trial"
      ? "Team-Einladungen sind während der Testphase nicht verfügbar."
      : null;

  const reset = () => {
    setEmail("");
    setRole("tenant_user");
    setMode("send");
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

    if (inviteBlocked) {
      setError(blockedReason ?? "Einladungen sind nicht möglich.");
      return;
    }

    if (!email.trim()) {
      setError("E-Mail-Adresse ist erforderlich.");
      return;
    }

    const trimmedEmail = email.trim();
    const result = await onInvite(trimmedEmail, role, mode === "link");

    if (!result.ok) {
      setError(result.error ?? "Einladung konnte nicht gesendet werden.");
      return;
    }

    if (mode === "link") {
      // Hand off to the InviteLinkDialog. Close this dialog without showing the
      // email-success state.
      if (result.inviteLink) {
        onLinkGenerated?.(result.inviteLink, trimmedEmail);
      }
      handleOpenChange(false);
      return;
    }

    setSuccess(true);
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
            {inviteBlocked && blockedReason && (
              <Alert>
                <AlertDescription>{blockedReason}</AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <fieldset
              disabled={inviteBlocked}
              className="space-y-4 disabled:opacity-50"
            >
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
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as InvitableRole)}
                  disabled={inviteBlocked}
                >
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tenant_user">Benutzer</SelectItem>
                    <SelectItem value="tenant_admin">Administrator</SelectItem>
                    {salesforceEnabled && (
                      <SelectItem value="sales_rep">Außendienst</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* OPH-97: Mode selector — choose between automatic email or copyable link. */}
              <div className="space-y-2">
                <Label>Versand</Label>
                <div
                  role="radiogroup"
                  aria-label="Versandart wählen"
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                  onKeyDown={(e) => {
                    // BUG-7: ARIA radiogroup keyboard support — arrow keys move between options.
                    if (
                      e.key === "ArrowLeft" ||
                      e.key === "ArrowUp" ||
                      e.key === "ArrowRight" ||
                      e.key === "ArrowDown"
                    ) {
                      e.preventDefault();
                      const next = mode === "send" ? "link" : "send";
                      setMode(next);
                      (next === "link" ? linkBtnRef : sendBtnRef).current?.focus();
                    }
                  }}
                >
                  <button
                    ref={sendBtnRef}
                    type="button"
                    role="radio"
                    aria-checked={mode === "send"}
                    tabIndex={mode === "send" ? 0 : -1}
                    onClick={() => setMode("send")}
                    className={cn(
                      "flex items-start gap-2 rounded-md border p-3 text-left transition-colors",
                      "hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      mode === "send"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-input"
                    )}
                  >
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium leading-none">
                        Einladung senden
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Per E-Mail an den Benutzer
                      </p>
                    </div>
                  </button>

                  <button
                    ref={linkBtnRef}
                    type="button"
                    role="radio"
                    aria-checked={mode === "link"}
                    tabIndex={mode === "link" ? 0 : -1}
                    onClick={() => setMode("link")}
                    className={cn(
                      "flex items-start gap-2 rounded-md border p-3 text-left transition-colors",
                      "hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      mode === "link"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-input"
                    )}
                  >
                    <LinkIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium leading-none">
                        Link generieren
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Zum Kopieren – keine E-Mail
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </fieldset>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isMutating}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={isMutating || inviteBlocked || !email.trim()}>
                {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "link" ? "Link erstellen" : "Einladung senden"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
