"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { loginAction } from "@/lib/auth-actions";
import { Loader2, AlertCircle, Mail, Info } from "lucide-react";
import type { TrialCheckResponse, ApiResponse } from "@/lib/types";

const ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed:
    "Authentifizierung fehlgeschlagen. Bitte versuchen Sie es erneut.",
  account_inactive:
    "Ihr Konto ist deaktiviert. Bitte kontaktieren Sie Ihren Administrator.",
  tenant_inactive:
    "Ihr Mandant ist deaktiviert. Bitte kontaktieren Sie den Plattform-Support.",
  session_expired:
    "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
};

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTrialTenant, setIsTrialTenant] = useState(false);
  const searchParams = useSearchParams();

  // Show error from URL params (e.g., after middleware redirect)
  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError && ERROR_MESSAGES[urlError]) {
      setError(ERROR_MESSAGES[urlError]);
    }
  }, [searchParams]);

  // OPH-16: Reset trial banner when email changes
  useEffect(() => {
    setIsTrialTenant(false);
  }, [email]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setIsTrialTenant(false);

    try {
      // OPH-16: Check if this email belongs to a trial tenant before attempting login
      const checkRes = await fetch("/api/auth/check-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (checkRes.ok) {
        const checkJson = (await checkRes.json()) as ApiResponse<TrialCheckResponse>;
        if (checkJson.success && checkJson.data?.isTrial) {
          setIsTrialTenant(true);
          setIsLoading(false);
          return;
        }
      }

      const result = await loginAction(email, password);
      if (result.success) {
        // Use window.location.href for post-login redirect (not router.push)
        // This ensures the middleware runs and the session cookie is read correctly
        window.location.href = "/dashboard";
      } else {
        setError(result.error ?? "Ein unbekannter Fehler ist aufgetreten.");
      }
    } catch {
      setError("Verbindungsfehler. Bitte versuchen Sie es erneut.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Anmelden</CardTitle>
        <CardDescription>
          Melden Sie sich mit Ihrer E-Mail und Ihrem Passwort an.
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
          {/* OPH-16: Trial tenant banner */}
          {isTrialTenant && (
            <Alert className="border-primary/30 bg-primary/5">
              <Info className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm">
                <span className="font-semibold">Ihr Konto ist ein Trial-Konto.</span>{" "}
                Bitte nutzen Sie die E-Mail-Weiterleitung, um Bestellungen zu verarbeiten.
                Ein Web-Login ist während der Testphase nicht verfügbar.
                <span className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  Leiten Sie Bestellungs-E-Mails an Ihre zugewiesene Adresse weiter.
                </span>
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">E-Mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@unternehmen.de"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              aria-label="E-Mail-Adresse"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              type="password"
              placeholder="Ihr Passwort"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              aria-label="Passwort"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button
            type="submit"
            className="w-full font-bold"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Anmelden...
              </>
            ) : (
              "Anmelden"
            )}
          </Button>
          <Link
            href="/forgot-password"
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            Passwort vergessen?
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
