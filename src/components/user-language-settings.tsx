"use client";

import { useState, useEffect, useCallback } from "react";
import { Languages, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiResponse } from "@/lib/types";

/**
 * OPH-100: User-Level Language Override card.
 *
 * Lets any authenticated user pick a personal UI language that overrides the
 * tenant default (OPH-99). Selecting "Use company setting" clears the personal
 * override so the tenant default takes over again.
 *
 * Persists via PATCH /api/settings/user-language, which also writes the
 * `user_locale` cookie so the change takes effect on the next navigation
 * without a hard reload.
 */

type LocaleValue = "de" | "en" | null;

interface UserLanguageSettingsResponse {
  preferred_locale: "de" | "en" | null;
}

const NOT_SET_VALUE = "__not_set__";

export function UserLanguageSettings() {
  const t = useTranslations("settings.userLanguage");
  const tCommon = useTranslations("common");

  const [savedLocale, setSavedLocale] = useState<LocaleValue>(null);
  const [selectedLocale, setSelectedLocale] = useState<LocaleValue>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSavedDialog, setShowSavedDialog] = useState(false);

  const fetchLocale = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch("/api/settings/user-language");
      const json = (await res.json()) as ApiResponse<UserLanguageSettingsResponse>;

      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? t("loadError"));
        return;
      }

      setSavedLocale(json.data.preferred_locale);
      setSelectedLocale(json.data.preferred_locale);
    } catch {
      setError(t("loadConnectionError"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchLocale();
  }, [fetchLocale]);

  const handleSave = useCallback(async () => {
    try {
      setIsSaving(true);
      const res = await fetch("/api/settings/user-language", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferred_locale: selectedLocale }),
      });
      const json = (await res.json()) as ApiResponse<UserLanguageSettingsResponse>;

      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error ?? t("saveError"));
        return;
      }

      setSavedLocale(json.data.preferred_locale);
      setSelectedLocale(json.data.preferred_locale);
      setShowSavedDialog(true);
    } catch {
      toast.error(t("saveConnectionError"));
    } finally {
      setIsSaving(false);
    }
  }, [selectedLocale, t]);

  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  const handleSelectChange = useCallback((value: string) => {
    setSelectedLocale(value === NOT_SET_VALUE ? null : (value as "de" | "en"));
  }, []);

  const hasChanges = selectedLocale !== savedLocale;
  const selectValue = selectedLocale ?? NOT_SET_VALUE;

  return (
    <>
      <Card className="max-w-lg">
        <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
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
                {tCommon("tryAgain")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="user-language-select">{t("selectLabel")}</Label>
              <Select
                value={selectValue}
                onValueChange={handleSelectChange}
                disabled={isSaving}
              >
                <SelectTrigger
                  id="user-language-select"
                  aria-label={t("selectAriaLabel")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOT_SET_VALUE}>
                    {t("notSetOption")}
                  </SelectItem>
                  <SelectItem value="de">{t("optionGerman")}</SelectItem>
                  <SelectItem value="en">{t("optionEnglish")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("helper")}</p>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
              >
                {isSaving && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {tCommon("save")}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>

    <AlertDialog open={showSavedDialog} onOpenChange={setShowSavedDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("savedDialogTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("savedDialogDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("savedDialogLater")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleReload}>
            {t("savedDialogReload")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
}
