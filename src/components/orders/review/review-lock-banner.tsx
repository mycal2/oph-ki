"use client";

import { useState } from "react";
import { Lock, ShieldAlert, Unlock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ReviewLockBannerProps {
  lockedByName: string | null;
  lockedAt: string;
  canOverride: boolean;
  onReleaseLock: () => Promise<boolean>;
}

function formatLockedTime(lockedAt: string): string {
  const date = new Date(lockedAt);
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function ReviewLockBanner({
  lockedByName,
  lockedAt,
  canOverride,
  onReleaseLock,
}: ReviewLockBannerProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);

  const handleRelease = async () => {
    setIsReleasing(true);
    const success = await onReleaseLock();
    setIsReleasing(false);
    if (success) {
      setShowConfirm(false);
    }
  };

  return (
    <>
      <Alert className="border-amber-300 bg-amber-50 text-amber-800">
        <Lock className="h-4 w-4 text-amber-600" />
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>
            Wird gerade von <strong>{lockedByName || "einem anderen Benutzer"}</strong> bearbeitet.
            Die Seite ist schreibgeschützt.
            <span className="text-amber-600 ml-2 text-xs">
              Gesperrt seit {formatLockedTime(lockedAt)} Uhr
            </span>
          </span>
          {canOverride && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100"
              onClick={() => setShowConfirm(true)}
            >
              <Unlock className="h-3.5 w-3.5" />
              Sperre aufheben
            </Button>
          )}
        </AlertDescription>
      </Alert>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Sperre aufheben
            </DialogTitle>
            <DialogDescription>
              Sperre von <strong>{lockedByName || "diesem Benutzer"}</strong> aufheben?
              Diese Person verliert ungespeicherte Änderungen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
              disabled={isReleasing}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleRelease}
              disabled={isReleasing}
            >
              {isReleasing ? "Wird aufgehoben..." : "Sperre aufheben"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface LockExpiredBannerProps {
  onReload: () => void;
}

export function LockExpiredBanner({ onReload }: LockExpiredBannerProps) {
  return (
    <Alert className="border-red-300 bg-red-50 text-red-800">
      <ShieldAlert className="h-4 w-4 text-red-600" />
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>
          Ihre Sitzung ist abgelaufen. Bitte laden Sie die Seite neu, um die Bestellung erneut zu sperren.
        </span>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 border-red-300 text-red-700 hover:bg-red-100"
          onClick={onReload}
        >
          Seite neu laden
        </Button>
      </AlertDescription>
    </Alert>
  );
}
