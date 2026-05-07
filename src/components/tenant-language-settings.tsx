"use client";

import { useState, useEffect, useCallback } from "react";
import { Languages, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiResponse } from "@/lib/types";

/**
 * OPH-99: Tenant-Level Language Preference card.
 *
 * Lets a tenant_admin (or platform_admin) pick the default UI language for the
 * entire tenant. The selection is persisted via PATCH /api/settings/language,
 * which also writes the `tenant_locale` cookie so the change takes effect on
 * the next navigation without a hard reload.
 */

type LocaleValue = "de" | "en" | null;

interface LanguageSettingsResponse {
  preferred_locale: "de" | "en" | null;
}

interface TenantLanguageSettingsProps {
  /** When false, the selector is shown read-only (non-admin viewer). */
  canEdit: boolean;
}

/**
 * Renders both the native and English form of each option for clarity, e.g.
 * "Deutsch (German)". The "not set" option lets admins clear the value to
 * fall back to the system default.
 */
const LANGUAGE_OPTIONS: { value: "de" | "en"; native: string; english: string }[] = [
  { value: "de", native: "Deutsch", english: "German" },
  { value: "en", native: "English", english: "English" },
];

const NOT_SET_VALUE = "__not_set__";

export function TenantLanguageSettings({ canEdit }: TenantLanguageSettingsProps) {
  const [savedLocale, setSavedLocale] = useState<LocaleValue>(null);
  const [selectedLocale, setSelectedLocale] = useState<LocaleValue>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLocale = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch("/api/settings/language");
      const json = (await res.json()) as ApiResponse<LanguageSettingsResponse>;

      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? "Sprache konnte nicht geladen werden.");
        return;
      }

      setSavedLocale(json.data.preferred_locale);
      setSelectedLocale(json.data.preferred_locale);
    } catch {
      setError("Verbindungsfehler beim Laden der Sprache.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocale();
  }, [fetchLocale]);

  const handleSave = useCallback(async () => {
    if (!canEdit) return;

    try {
      setIsSaving(true);
      const res = await fetch("/api/settings/language", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferred_locale: selectedLocale }),
      });
      const json = (await res.json()) as ApiResponse<LanguageSettingsResponse>;

      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error ?? "Sprache konnte nicht gespeichert werden.");
        return;
      }

      setSavedLocale(json.data.preferred_locale);
      setSelectedLocale(json.data.preferred_locale);
      toast.success(
        "Sprache gespeichert. Die Änderung wird beim nächsten Seitenwechsel aktiv."
      );
    } catch {
      toast.error("Verbindungsfehler beim Speichern der Sprache.");
    } finally {
      setIsSaving(false);
    }
  }, [canEdit, selectedLocale]);

  const handleSelectChange = useCallback((value: string) => {
    setSelectedLocale(value === NOT_SET_VALUE ? null : (value as "de" | "en"));
  }, []);

  const hasChanges = selectedLocale !== savedLocale;
  const selectValue = selectedLocale ?? NOT_SET_VALUE;

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-5 w-5" />
          Sprache / Language
        </CardTitle>
        <CardDescription>
          Standard-Sprache der Benutzeroberfläche für alle Benutzer dieses
          Mandanten. Einzelne Benutzer können diese Voreinstellung überschreiben.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error}{" "}
              <Button
                variant="link"
                className="h-auto p-0"
                onClick={fetchLocale}
              >
                Erneut versuchen
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="tenant-language-select">Sprache</Label>
              <Select
                value={selectValue}
                onValueChange={handleSelectChange}
                disabled={!canEdit || isSaving}
              >
                <SelectTrigger
                  id="tenant-language-select"
                  aria-label="Sprache des Mandanten auswählen"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOT_SET_VALUE}>
                    Nicht festgelegt (System-Standard: Deutsch)
                  </SelectItem>
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.native} ({opt.english})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {canEdit
                  ? "Diese Einstellung gilt für alle Benutzer Ihres Mandanten, sofern sie keine persönliche Sprache gewählt haben."
                  : "Nur Administratoren können diese Einstellung ändern."}
              </p>
            </div>

            {canEdit && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={!hasChanges || isSaving}
                >
                  {isSaving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Speichern
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
