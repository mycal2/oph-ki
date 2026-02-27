"use client";

import { useState } from "react";
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
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
            Passwort geaendert
          </CardTitle>
          <CardDescription>
            Ihr Passwort wurde erfolgreich zurueckgesetzt. Sie koennen sich jetzt
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
            <Label htmlFor="confirmPassword">Passwort bestaetigen</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Passwort wiederholen"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              disabled={isLoading}
              aria-label="Passwort bestaetigen"
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            className="w-full font-bold"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Speichern...
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
