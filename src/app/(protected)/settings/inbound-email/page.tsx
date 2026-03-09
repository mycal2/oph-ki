"use client";

import { useState, useEffect, useCallback } from "react";
import { Copy, Check, Mail, Info } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiResponse, InboundEmailSettingsResponse } from "@/lib/types";

export default function InboundEmailSettingsPage() {
  const [inboundAddress, setInboundAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchAddress = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/settings/inbound-email");
      const json = (await res.json()) as ApiResponse<InboundEmailSettingsResponse>;

      if (!json.success || !json.data) {
        setError(json.error ?? "Fehler beim Laden der Einstellungen.");
        return;
      }

      setInboundAddress(json.data.inboundEmailAddress);
    } catch {
      setError("Verbindungsfehler beim Laden der Einstellungen.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAddress();
  }, [fetchAddress]);

  async function handleCopy() {
    if (!inboundAddress) return;
    try {
      await navigator.clipboard.writeText(inboundAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = inboundAddress;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Eingangs-E-Mail</h1>
        <p className="text-muted-foreground mt-1">
          Leiten Sie Bestellungs-E-Mails an diese Adresse weiter, um sie
          automatisch zu verarbeiten.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Ihre Weiterleitungs-Adresse
          </CardTitle>
          <CardDescription>
            Leiten Sie Bestellungs-E-Mails aus Ihrem E-Mail-Programm (Outlook,
            Gmail etc.) an diese Adresse weiter.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : inboundAddress ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-md border bg-muted/50 px-4 py-3 font-mono text-sm select-all">
                {inboundAddress}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                aria-label="Adresse kopieren"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          ) : (
            <Alert>
              <AlertDescription>
                Die E-Mail-Weiterleitung ist noch nicht konfiguriert. Bitte
                wenden Sie sich an den Administrator.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            So funktioniert es
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-3 text-sm text-muted-foreground">
            <li>
              <span className="text-foreground font-medium">
                Bestellungs-E-Mail weiterleiten
              </span>{" "}
              — Leiten Sie die E-Mail mit einem Klick an die obige Adresse
              weiter. Alle Anhänge (PDF, Excel, CSV) werden automatisch
              erkannt.
            </li>
            <li>
              <span className="text-foreground font-medium">
                Automatische Verarbeitung
              </span>{" "}
              — Das System erkennt den Händler, extrahiert die Bestelldaten per
              KI und erstellt eine Bestellung.
            </li>
            <li>
              <span className="text-foreground font-medium">
                Bestätigungs-E-Mail
              </span>{" "}
              — Sie erhalten eine Bestätigung mit einem Link zur Bestellung in
              der Plattform.
            </li>
            <li>
              <span className="text-foreground font-medium">
                Prüfen und exportieren
              </span>{" "}
              — Prüfen Sie die extrahierten Daten und exportieren Sie die
              Bestellung in Ihr ERP-System.
            </li>
          </ol>

          <div className="mt-6 rounded-md border bg-muted/30 p-4">
            <p className="text-sm font-medium mb-2">
              Unterstützte Dateiformate
            </p>
            <div className="flex flex-wrap gap-2">
              {[".pdf", ".xlsx", ".xls", ".csv", ".eml"].map((ext) => (
                <span
                  key={ext}
                  className="inline-flex items-center rounded-md bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                >
                  {ext}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Maximale Anhangsgröße: 25 MB pro Datei
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
