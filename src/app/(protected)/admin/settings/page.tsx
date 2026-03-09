"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, Loader2, Plus, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";

interface NotificationEmailsData {
  emails: string[];
  updatedAt: string;
}

const MAX_EMAILS = 3;

export default function AdminSettingsPage() {
  const { isPlatformAdmin, isLoading: isLoadingRole } = useCurrentUserRole();

  const [emails, setEmails] = useState<string[]>([""]);
  const [savedEmails, setSavedEmails] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchEmails = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const res = await fetch("/api/admin/settings/notifications");
      const json = await res.json();

      if (!json.success || !json.data) {
        setLoadError(json.error ?? "Einstellungen konnten nicht geladen werden.");
        return;
      }

      const data = json.data as NotificationEmailsData;
      const loaded = data.emails.length > 0 ? data.emails : [""];
      setEmails(loaded);
      setSavedEmails(data.emails);
    } catch {
      setLoadError("Verbindungsfehler beim Laden der Einstellungen.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPlatformAdmin) {
      fetchEmails();
    }
  }, [isPlatformAdmin, fetchEmails]);

  function handleEmailChange(index: number, value: string) {
    setEmails((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleAddEmail() {
    if (emails.length >= MAX_EMAILS) return;
    setEmails((prev) => [...prev, ""]);
  }

  function handleRemoveEmail(index: number) {
    setEmails((prev) => {
      if (prev.length <= 1) return [""];
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSave() {
    // Filter out empty entries for the API call
    const filtered = emails.map((e) => e.trim()).filter((e) => e.length > 0);

    // Client-side email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = filtered.find((e) => !emailRegex.test(e));
    if (invalid) {
      toast.error(`Ungültige E-Mail-Adresse: ${invalid}`);
      return;
    }

    try {
      setIsSaving(true);
      const res = await fetch("/api/admin/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: filtered }),
      });
      const json = await res.json();

      if (!json.success) {
        toast.error(json.error ?? "Fehler beim Speichern.");
        return;
      }

      const saved = (json.data?.emails as string[]) ?? filtered;
      const display = saved.length > 0 ? saved : [""];
      setEmails(display);
      setSavedEmails(saved);
      toast.success("Benachrichtigungs-E-Mails gespeichert.");
    } catch {
      toast.error("Verbindungsfehler beim Speichern.");
    } finally {
      setIsSaving(false);
    }
  }

  // Check if there are unsaved changes
  const currentFiltered = emails.map((e) => e.trim()).filter((e) => e.length > 0);
  const hasChanges =
    JSON.stringify(currentFiltered.sort()) !== JSON.stringify([...savedEmails].sort());

  // Loading state
  if (isLoadingRole) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Access denied
  if (!isPlatformAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Zugriff verweigert. Nur für Platform-Administratoren.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
        <p className="text-sm text-muted-foreground">
          Plattform-weite Konfiguration für Administratoren.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Fehler-Benachrichtigungen
          </CardTitle>
          <CardDescription>
            E-Mail-Adressen, die bei Systemfehlern (z.B. fehlgeschlagene Extraktion,
            E-Mail-Ingestion, ERP-Export) benachrichtigt werden. Maximal {MAX_EMAILS} Adressen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-10 w-full max-w-md" />
              <Skeleton className="h-10 w-full max-w-md" />
            </div>
          ) : loadError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {loadError}{" "}
                <Button variant="link" className="h-auto p-0" onClick={fetchEmails}>
                  Erneut versuchen
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="space-y-3">
                <Label>Benachrichtigungs-E-Mails</Label>
                {emails.map((email, index) => (
                  <div key={index} className="flex items-center gap-2 max-w-md">
                    <Input
                      type="email"
                      placeholder="admin@example.com"
                      value={email}
                      onChange={(e) => handleEmailChange(index, e.target.value)}
                      aria-label={`Benachrichtigungs-E-Mail ${index + 1}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveEmail(index)}
                      aria-label={`E-Mail ${index + 1} entfernen`}
                      className="shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {emails.length < MAX_EMAILS && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddEmail}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  E-Mail hinzufügen
                </Button>
              )}

              <div className="pt-2">
                <Button
                  onClick={handleSave}
                  disabled={isSaving || !hasChanges}
                  size="sm"
                >
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Speichern
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
