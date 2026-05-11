"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("auth.acceptInvite");
  const tCommon = useTranslations("common");
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
              // Detect expired-token errors and show a clearer message that
              // points the user to their administrator. Supabase reports these
              // as either a 'otp_expired' code or a message containing 'expired'.
              const errMessage = sessionError?.message?.toLowerCase() ?? "";
              const errCode = (sessionError as { code?: string } | null)?.code;
              if (errCode === "otp_expired" || errMessage.includes("expired")) {
                setError(t("errors.linkExpired"));
              } else {
                setError(t("errors.sessionFailed"));
              }
            }
          });
      } else {
        setError(t("errors.invalidLink"));
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
          setError(t("errors.noSession"));
        }
      });
    }
  }, [t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError(t("errors.passwordsMismatch"));
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError(t("errors.passwordTooShort"));
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
        setError(t("errors.accountSetupFailed"));
      } else {
        setSuccess(true);
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 2000);
      }
    } catch {
      setError(tCommon("connectionError"));
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
            {t("successTitle")}
          </CardTitle>
          <CardDescription>{t("successDescription")}</CardDescription>
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
        <CardTitle className="text-2xl font-bold">{t("title")}</CardTitle>
        <CardDescription>
          {tenantName
            ? t.rich("descriptionWithTenant", {
                tenant: tenantName,
                strong: (chunks) => <strong>{chunks}</strong>,
              })
            : t("descriptionPlain")}
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
            <Label htmlFor="password">{t("passwordLabel")}</Label>
            <Input
              id="password"
              type="password"
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              disabled={isLoading || !sessionReady}
              aria-label={t("passwordAriaLabel")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t("confirmPasswordLabel")}</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder={t("confirmPasswordPlaceholder")}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              disabled={isLoading || !sessionReady}
              aria-label={t("confirmPasswordAriaLabel")}
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
                {t("submitting")}
              </>
            ) : !sessionReady ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("establishingSession")}
              </>
            ) : (
              t("submit")
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
