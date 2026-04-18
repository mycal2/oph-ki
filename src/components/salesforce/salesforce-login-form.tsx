"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2, Mail } from "lucide-react";

interface SalesforceLoginFormProps {
  tenantName: string;
  /** The Salesforce subdomain slug (e.g. "meisinger") */
  slug: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed:
    "Der Anmelde-Link ist abgelaufen oder ungültig. Bitte fordern Sie einen neuen Link an.",
  wrong_tenant:
    "Zugang nicht möglich. Bitte wenden Sie sich an Ihren Administrator.",
  account_inactive:
    "Ihr Konto ist deaktiviert. Bitte kontaktieren Sie Ihren Administrator.",
  salesforce_not_configured:
    "Zugang nicht möglich. Bitte wenden Sie sich an Ihren Administrator.",
};

/**
 * OPH-75: Salesforce App magic link login form.
 *
 * Sales reps enter their email address and receive a one-click login link.
 * After sending, the form shows a confirmation message.
 */
export function SalesforceLoginForm({ tenantName, slug }: SalesforceLoginFormProps) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  // Show error from URL params (e.g., after middleware redirect)
  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError && ERROR_MESSAGES[urlError]) {
      setError(ERROR_MESSAGES[urlError]);
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // OPH-84: Determine the callback URL based on environment
      const isLocal = window.location.hostname === "localhost";
      const host = window.location.hostname;
      const envSuffix = host.includes("-dev.ids.online") ? "-dev"
        : host.includes("-staging.ids.online") ? "-staging"
        : "";
      const callbackUrl = isLocal
        ? `${window.location.origin}/sf/${slug}/auth/callback?next=/`
        : `https://${slug}${envSuffix}.ids.online/auth/callback?next=/`;

      // OPH-84: Send magic link via server-side API route (domain validation)
      const res = await fetch(`/api/sf/${slug}/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          callbackUrl,
        }),
      });

      if (!res.ok && res.status === 429) {
        setError(
          "Zu viele Anfragen. Bitte warten Sie einen Moment und versuchen Sie es erneut."
        );
        return;
      }

      // Always show success — server returns 200 regardless of domain/user validity
      setIsSent(true);
    } catch {
      setError("Verbindungsfehler. Bitte versuchen Sie es erneut.");
    } finally {
      setIsLoading(false);
    }
  }

  // Success state: email was sent (or appears to be sent)
  if (isSent) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl font-bold">
            E-Mail gesendet
          </CardTitle>
          <CardDescription className="mt-2">
            Falls ein Konto mit dieser E-Mail-Adresse existiert, haben wir Ihnen
            einen Anmelde-Link gesendet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/50 p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span className="font-medium">{email}</span>
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Prüfen Sie Ihren Posteingang und klicken Sie auf den Link, um sich
            anzumelden. Der Link ist einige Minuten gültig.
          </p>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setIsSent(false);
              setEmail("");
              setError(null);
            }}
          >
            Andere E-Mail-Adresse verwenden
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Default state: login form
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-xl font-bold">
          Willkommen bei {tenantName}
        </CardTitle>
        <CardDescription>
          Wir senden Ihnen einen Anmelde-Link per E-Mail.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="sf-email">E-Mail-Adresse</Label>
            <Input
              id="sf-email"
              type="email"
              placeholder="name@beispiel.de"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="email"
              autoFocus
              aria-label="E-Mail-Adresse"
            />
          </div>
          <Button
            type="submit"
            className="w-full font-bold"
            disabled={isLoading || !email.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird gesendet...
              </>
            ) : (
              "Magic Link senden"
            )}
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}
