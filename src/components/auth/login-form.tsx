"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { loginAction } from "@/lib/auth-actions";
import { Loader2, AlertCircle, Mail, Info } from "lucide-react";
import type { TrialCheckResponse, ApiResponse } from "@/lib/types";

const ERROR_KEYS = [
  "auth_callback_failed",
  "account_inactive",
  "tenant_inactive",
  "session_expired",
  "invite_link_expired",
  "invalid_invite_link",
] as const;
type LoginErrorKey = (typeof ERROR_KEYS)[number];

function isLoginErrorKey(value: string | null): value is LoginErrorKey {
  return value !== null && (ERROR_KEYS as readonly string[]).includes(value);
}

export function LoginForm() {
  const t = useTranslations("auth.login");
  const tCommon = useTranslations("common");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTrialTenant, setIsTrialTenant] = useState(false);
  const searchParams = useSearchParams();

  // If user lands on /login with a hash fragment from Supabase auth emails,
  // redirect to the correct page (handles already-sent emails with old redirectTo)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("access_token")) {
      if (hash.includes("type=invite")) {
        window.location.href = `/invite/accept${hash}`;
        return;
      }
      if (hash.includes("type=recovery")) {
        window.location.href = `/reset-password${hash}`;
        return;
      }
    }
  }, []);

  // Show error from URL params (e.g., after middleware redirect)
  useEffect(() => {
    const urlError = searchParams.get("error");
    if (isLoginErrorKey(urlError)) {
      setError(t(`errors.${urlError}`));
    }
  }, [searchParams, t]);

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
        setError(result.error ?? tCommon("unknownError"));
      }
    } catch {
      setError(tCommon("connectionError"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
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
                <span className="font-semibold">{t("trialBannerTitle")}</span>{" "}
                {t("trialBannerBody")}
                <span className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  {t("trialBannerHint")}
                </span>
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">{t("emailLabel")}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              aria-label={t("emailAriaLabel")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("passwordLabel")}</Label>
            <Input
              id="password"
              type="password"
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              aria-label={t("passwordAriaLabel")}
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
                {t("submitting")}
              </>
            ) : (
              t("submit")
            )}
          </Button>
          <Link
            href="/forgot-password"
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            {t("forgotPassword")}
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
