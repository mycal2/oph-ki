"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, Download, FileText, Loader2, Mail, CheckCircle2, XCircle, Forward } from "lucide-react";
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
import type { ApiResponse, DataRetentionSettings } from "@/lib/types";

export default function DataProtectionSettingsPage() {
  const { role, isLoading: roleLoading } = useCurrentUserRole();
  const canEdit = role === "tenant_admin" || role === "platform_admin";

  // Data retention state
  const [retentionDays, setRetentionDays] = useState<number>(90);
  const [savedRetentionDays, setSavedRetentionDays] = useState<number>(90);
  const [isLoadingRetention, setIsLoadingRetention] = useState(true);
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // OPH-35: Email notification status (read-only)
  const [emailSettings, setEmailSettings] = useState<{
    emailConfirmationEnabled: boolean;
    emailResultsEnabled: boolean;
    emailResultsFormat: "standard_csv" | "tenant_format";
    emailResultsConfidenceEnabled: boolean;
    emailPostprocessEnabled: boolean;
    emailForwardingEnabled: boolean;
    emailForwardingAddress: string | null;
  } | null>(null);

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  const fetchRetention = useCallback(async () => {
    try {
      setIsLoadingRetention(true);
      setRetentionError(null);
      const res = await fetch("/api/settings/data-retention");
      const json = (await res.json()) as ApiResponse<DataRetentionSettings>;

      if (!json.success || !json.data) {
        setRetentionError(json.error ?? "Fehler beim Laden der Aufbewahrungseinstellungen.");
        return;
      }

      setRetentionDays(json.data.dataRetentionDays);
      setSavedRetentionDays(json.data.dataRetentionDays);
      setEmailSettings({
        emailConfirmationEnabled: json.data.emailConfirmationEnabled,
        emailResultsEnabled: json.data.emailResultsEnabled,
        emailResultsFormat: json.data.emailResultsFormat,
        emailResultsConfidenceEnabled: json.data.emailResultsConfidenceEnabled,
        emailPostprocessEnabled: json.data.emailPostprocessEnabled,
        emailForwardingEnabled: json.data.emailForwardingEnabled,
        emailForwardingAddress: json.data.emailForwardingAddress,
      });
    } catch {
      setRetentionError("Verbindungsfehler beim Laden der Einstellungen.");
    } finally {
      setIsLoadingRetention(false);
    }
  }, []);

  useEffect(() => {
    fetchRetention();
  }, [fetchRetention]);

  async function handleSaveRetention() {
    if (retentionDays < 30 || retentionDays > 365) {
      toast.error("Der Wert muss zwischen 30 und 365 Tagen liegen.");
      return;
    }

    try {
      setIsSaving(true);
      const res = await fetch("/api/settings/data-retention", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataRetentionDays: retentionDays }),
      });
      const json = (await res.json()) as ApiResponse<DataRetentionSettings>;

      if (!json.success) {
        toast.error(json.error ?? "Fehler beim Speichern.");
        return;
      }

      setSavedRetentionDays(retentionDays);
      toast.success("Aufbewahrungsfrist erfolgreich gespeichert.");
    } catch {
      toast.error("Verbindungsfehler beim Speichern.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleExportAll() {
    try {
      setIsExporting(true);
      const res = await fetch("/api/orders/export-all");

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        const message =
          (json as ApiResponse | null)?.error ?? "Fehler beim Exportieren der Daten.";
        toast.error(message);
        return;
      }

      // Download as JSON file
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") ??
        `bestelldaten-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Datenexport erfolgreich heruntergeladen.");
    } catch {
      toast.error("Verbindungsfehler beim Exportieren.");
    } finally {
      setIsExporting(false);
    }
  }

  const hasChanges = retentionDays !== savedRetentionDays;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Datenschutz</h1>
        <p className="text-muted-foreground mt-1">
          Verwalten Sie die Datenaufbewahrung, exportieren Sie Ihre Daten und
          finden Sie rechtliche Informationen.
        </p>
      </div>

      {/* Datenaufbewahrung Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Datenaufbewahrung
          </CardTitle>
          <CardDescription>
            Bestellungen und zugehörige Dateien werden nach Ablauf der
            Aufbewahrungsfrist automatisch gelöscht.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingRetention || roleLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-10 w-32" />
            </div>
          ) : retentionError ? (
            <Alert variant="destructive">
              <AlertDescription>{retentionError}</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="retention-days">
                  Aufbewahrungsfrist (Tage)
                </Label>
                {canEdit ? (
                  <div className="flex items-center gap-3">
                    <Input
                      id="retention-days"
                      type="number"
                      min={30}
                      max={365}
                      step={1}
                      value={retentionDays}
                      onChange={(e) =>
                        setRetentionDays(Number(e.target.value))
                      }
                      className="w-32"
                      aria-label="Aufbewahrungsfrist in Tagen"
                    />
                    <span className="text-sm text-muted-foreground">
                      Tage (min. 30, max. 365)
                    </span>
                  </div>
                ) : (
                  <p className="text-sm">
                    <span className="font-medium">{retentionDays} Tage</span>
                    <span className="text-muted-foreground ml-2">
                      (Nur Administratoren können diesen Wert ändern.)
                    </span>
                  </p>
                )}
              </div>

              {canEdit && (
                <Button
                  onClick={handleSaveRetention}
                  disabled={isSaving || !hasChanges}
                  size="sm"
                >
                  {isSaving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Speichern
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* OPH-35: E-Mail-Benachrichtigungen (read-only, 5 toggles) */}
      {emailSettings !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              E-Mail-Benachrichtigungen
            </CardTitle>
            <CardDescription>
              Automatische E-Mails bei Bestellungseingang und nach erfolgreicher Extraktion.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Bestätigungs-E-Mail", enabled: emailSettings.emailConfirmationEnabled },
              { label: "Ergebnis-E-Mail", enabled: emailSettings.emailResultsEnabled },
              {
                label: "Anhang-Format",
                value: emailSettings.emailResultsFormat === "tenant_format" ? "Mandanten-Format" : "Standard CSV",
              },
              { label: "Konfidenz-Score in Ergebnis-E-Mail", enabled: emailSettings.emailResultsConfidenceEnabled },
              { label: "Nachbearbeitung (in Vorbereitung)", enabled: emailSettings.emailPostprocessEnabled },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-2">
                {"enabled" in row ? (
                  row.enabled ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                  )
                ) : null}
                <span className="text-sm">
                  <span className="font-medium">{row.label}</span>
                  {"value" in row && (
                    <span className="text-muted-foreground ml-1">— {row.value}</span>
                  )}
                  {"enabled" in row && (
                    <span className={row.enabled ? "text-green-700 ml-1" : "text-muted-foreground ml-1"}>
                      — {row.enabled ? "Aktiv" : "Inaktiv"}
                    </span>
                  )}
                </span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground mt-2">
              Diese Einstellungen werden von Ihrem Plattform-Administrator verwaltet.
            </p>
          </CardContent>
        </Card>
      )}

      {/* OPH-63: E-Mail-Weiterleitung (read-only) */}
      {emailSettings !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Forward className="h-5 w-5" />
              E-Mail-Weiterleitung
            </CardTitle>
            <CardDescription>
              Automatische Weiterleitung eingehender Bestell-E-Mails an eine weitere Adresse.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              {emailSettings.emailForwardingEnabled ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className="text-sm">
                <span className="font-medium">E-Mail-Weiterleitung</span>
                <span className={emailSettings.emailForwardingEnabled ? "text-green-700 ml-1" : "text-muted-foreground ml-1"}>
                  — {emailSettings.emailForwardingEnabled ? "Aktiv" : "Inaktiv"}
                </span>
              </span>
            </div>
            {emailSettings.emailForwardingEnabled && emailSettings.emailForwardingAddress && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm">
                  <span className="font-medium">Weiterleitungs-Adresse</span>
                  <span className="text-muted-foreground ml-1">
                    — {emailSettings.emailForwardingAddress}
                  </span>
                </span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Diese Einstellung wird von Ihrem Plattform-Administrator verwaltet.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Datenexport Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Datenexport
          </CardTitle>
          <CardDescription>
            Exportieren Sie alle Bestelldaten Ihres Mandanten als JSON-Datei
            (DSGVO Art. 20 - Recht auf Datenübertragbarkeit).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleExportAll}
            disabled={isExporting}
            variant="outline"
          >
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Alle Bestelldaten exportieren
          </Button>
        </CardContent>
      </Card>

      {/* Rechtliches Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Rechtliches
          </CardTitle>
          <CardDescription>
            Informationen zum Datenschutz und zur Auftragsverarbeitung.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            <li>
              <a
                href="#"
                className="text-sm font-medium text-primary hover:underline"
              >
                Datenschutzerklärung
              </a>
              <p className="text-xs text-muted-foreground mt-0.5">
                Informationen zur Verarbeitung Ihrer personenbezogenen Daten.
              </p>
            </li>
            <li>
              <a
                href="#"
                className="text-sm font-medium text-primary hover:underline"
              >
                Auftragsverarbeitungsvertrag (AVV)
              </a>
              <p className="text-xs text-muted-foreground mt-0.5">
                Vertrag zur Auftragsverarbeitung gemäß Art. 28 DSGVO.
              </p>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
