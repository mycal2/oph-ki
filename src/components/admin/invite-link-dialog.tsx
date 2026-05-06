"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface InviteLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The full invite URL to display and copy. */
  inviteLink: string | null;
  /** The email address the link was generated for, shown for context. */
  email?: string | null;
}

/**
 * OPH-97: Shown after a platform admin generates a copyable invite link.
 * The user account has already been created at this point — this dialog only
 * surfaces the action_link so it can be forwarded through the admin's own
 * channel.
 */
export function InviteLinkDialog({
  open,
  onOpenChange,
  inviteLink,
  email,
}: InviteLinkDialogProps) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the "Kopiert!" feedback whenever the dialog re-opens for a new link.
  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  // BUG-6: Auto-focus and select the link when the dialog opens so Ctrl+C works
  // immediately. Defer one tick to wait for the dialog mount + animation.
  useEffect(() => {
    if (!open || !inviteLink) return;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [open, inviteLink]);

  const handleCopy = async () => {
    if (!inviteLink) return;
    let success = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteLink);
        success = true;
      } else {
        // Fallback for older browsers / non-secure contexts.
        const textarea = document.createElement("textarea");
        textarea.value = inviteLink;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        try {
          success = document.execCommand("copy");
        } finally {
          document.body.removeChild(textarea);
        }
      }
    } catch {
      success = false;
    }

    if (success) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      // BUG-5: Surface failure visibly. The field stays selected so the admin
      // can still copy manually with Ctrl+C / Cmd+C.
      toast.error(
        "Link konnte nicht kopiert werden. Bitte markieren und manuell kopieren."
      );
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Einladungs-Link erstellt</DialogTitle>
          {email && (
            <p className="text-sm text-muted-foreground">
              Für <span className="font-medium">{email}</span>
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-link-url">Einladungs-Link</Label>
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                id="invite-link-url"
                value={inviteLink ?? ""}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
                aria-label="Einladungs-Link"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleCopy}
                disabled={!inviteLink}
                aria-label="Link kopieren"
                className="shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="mr-1.5 h-4 w-4" />
                    Kopiert!
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 h-4 w-4" />
                    Kopieren
                  </>
                )}
              </Button>
            </div>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Dieser Link ist einmalig verwendbar und läuft nach 24 Stunden ab.
              Es wurde keine E-Mail versendet — leiten Sie den Link bitte
              selbst an den eingeladenen Benutzer weiter.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
