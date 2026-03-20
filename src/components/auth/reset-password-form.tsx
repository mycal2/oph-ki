"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
import { resetPasswordAction } from "@/lib/auth-actions";
import { createClient } from "@/lib/supabase/client";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Process the hash fragment from Supabase recovery links to establish a session.
  // The #access_token is only visible client-side; the server action needs an active session.
  useEffect(() => {
    const supabase = createClient();
    const hash = window.location.hash;

    if (hash && hash.includes("access_token")) {
      // Parse tokens from hash fragment and set session explicitly
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (accessToken && refreshToken) {
        supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ error: sessionError }) => {
            if (!sessionError) {
              setSessionReady(true);
              window.history.replaceState(null, "", window.location.pathname);
            } else {
              console.error("Failed to set session from hash:", sessionError.message);
              setError("Sitzung konnte nicht hergestellt werden. Bitte fordern Sie einen neuen Link an.");
            }
          });
      } else {
        setError("Ungültiger Reset-Link. Bitte fordern Sie einen neuen Link an.");
      }
    } else {
      // No hash — user may already have a session (e.g., page refresh)
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setSessionReady(true);
        }
      });
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await resetPasswordAction(password, confirmPassword);
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error ?? "Ein unbekannter Fehler ist aufgetreten.");
      }
    } catch {
      setError("Verbindungsfehler. Bitte versuchen Sie es erneut.");
    } finally {
      setIsLoading(false);
    }
  }

  if (success) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-bold">
            Passwort geändert
          </CardTitle>
          <CardDescription>
            Ihr Passwort wurde erfolgreich zurückgesetzt. Sie können sich jetzt
            mit Ihrem neuen Passwort anmelden.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/login">
            <Button className="font-bold">Zur Anmeldung</Button>
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">
          Neues Passwort setzen
        </CardTitle>
        <CardDescription>
          Geben Sie Ihr neues Passwort ein.
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
            <Label htmlFor="password">Neues Passwort</Label>
            <Input
              id="password"
              type="password"
              placeholder="Mindestens 8 Zeichen"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              disabled={isLoading}
              aria-label="Neues Passwort"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Passwort wiederholen"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              disabled={isLoading}
              aria-label="Passwort bestätigen"
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            className="w-full font-bold"
            disabled={isLoading || !sessionReady}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Speichern...
              </>
            ) : !sessionReady ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sitzung wird hergestellt...
              </>
            ) : (
              "Passwort speichern"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
