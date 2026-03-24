"use client";

import { useState, useEffect } from "react";
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
import { createClient } from "@/lib/supabase/client";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export function AcceptInviteForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [tenantName, setTenantName] = useState<string | null>(null);

  // Process the hash fragment from Supabase invite links to establish a session.
  // The #access_token is only visible client-side; the server action needs an active session.
  useEffect(() => {
    const supabase = createClient();
    const hash = window.location.hash;

    if (hash && hash.includes("access_token")) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (accessToken && refreshToken) {
        supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ data, error: sessionError }) => {
            if (!sessionError && data.user) {
              setSessionReady(true);
              if (data.user.user_metadata?.tenant_name) {
                setTenantName(data.user.user_metadata.tenant_name);
              }
              window.history.replaceState(null, "", window.location.pathname);
            } else {
              console.error("Failed to set session from hash:", sessionError?.message);
              setError("Sitzung konnte nicht hergestellt werden. Bitte fordern Sie eine neue Einladung an.");
            }
          });
      } else {
        setError("Ungültiger Einladungslink. Bitte fordern Sie eine neue Einladung an.");
      }
    } else {
      // No hash — user may already have a session (e.g., page refresh)
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setSessionReady(true);
          if (data.session.user?.user_metadata?.tenant_name) {
            setTenantName(data.session.user.user_metadata.tenant_name);
          }
        } else {
          setError("Keine gültige Sitzung. Bitte verwenden Sie den Link aus Ihrer Einladungs-E-Mail.");
        }
      });
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwörter stimmen nicht überein.");
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen lang sein.");
      setIsLoading(false);
      return;
    }

    try {
      // Use client-side Supabase to update password — the session from the hash
      // fragment is only available client-side and may not have synced to server cookies yet.
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        console.error("Accept invite error:", updateError.message);
        setError("Konto konnte nicht eingerichtet werden. Bitte versuchen Sie es erneut.");
      } else {
        setSuccess(true);
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 2000);
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
            Willkommen im Team!
          </CardTitle>
          <CardDescription>
            Ihr Konto wurde erfolgreich eingerichtet. Sie werden zum Dashboard
            weitergeleitet...
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">
          Einladung annehmen
        </CardTitle>
        <CardDescription>
          {tenantName ? (
            <>
              Sie wurden zur <strong>{tenantName}</strong> eingeladen. Setzen Sie
              Ihr Passwort, um Ihr Konto zu aktivieren.
            </>
          ) : (
            <>
              Setzen Sie Ihr Passwort, um Ihr Konto zu aktivieren.
            </>
          )}
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
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              type="password"
              placeholder="Mindestens 8 Zeichen"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              disabled={isLoading || !sessionReady}
              aria-label="Passwort"
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
              disabled={isLoading || !sessionReady}
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
                Konto einrichten...
              </>
            ) : !sessionReady ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sitzung wird hergestellt...
              </>
            ) : (
              "Konto einrichten"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
