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
import { Loader2, AlertCircle } from "lucide-react";

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
