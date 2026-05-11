"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
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
  /** OPH-87: Tenant company logo URL (from tenants.logo_url) */
  logoUrl: string | null;
}

/** OPH-87: Read the sf_user cookie to get the returning user's name. */
function readSfUserCookie(): { firstName: string; lastName: string } | null {
  try {
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith("sf_user="));
    if (!match) return null;
    const value = decodeURIComponent(match.split("=").slice(1).join("="));
    const parsed = JSON.parse(value);
    if (
      typeof parsed.firstName === "string" &&
      typeof parsed.lastName === "string" &&
      (parsed.firstName.trim() || parsed.lastName.trim())
    ) {
      return { firstName: parsed.firstName, lastName: parsed.lastName };
    }
    return null;
  } catch {
    return null;
  }
}

type UrlErrorKey =
  | "auth_callback_failed"
  | "wrong_tenant"
  | "account_inactive"
  | "salesforce_not_configured";

const URL_ERROR_KEYS = new Set<UrlErrorKey>([
  "auth_callback_failed",
  "wrong_tenant",
  "account_inactive",
  "salesforce_not_configured",
]);

export function SalesforceLoginForm({ tenantName, slug, logoUrl }: SalesforceLoginFormProps) {
  const t = useTranslations("salesforce.login");
  const tErr = useTranslations("salesforce.login.errors");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [returningUser, setReturningUser] = useState<{ firstName: string; lastName: string } | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const sfUser = readSfUserCookie();
    if (sfUser) {
      setReturningUser(sfUser);
    }
  }, []);

  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError && URL_ERROR_KEYS.has(urlError as UrlErrorKey)) {
      setError(tErr(urlError as UrlErrorKey));
    }
  }, [searchParams, tErr]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const isLocal = window.location.hostname === "localhost";
      const host = window.location.hostname;
      const envSuffix = host.includes("-dev.ids.online") ? "-dev"
        : host.includes("-staging.ids.online") ? "-staging"
        : "";
      const callbackUrl = isLocal
        ? `${window.location.origin}/sf/${slug}/auth/callback?next=/`
        : `https://${slug}${envSuffix}.ids.online/auth/callback?next=/`;

      const res = await fetch(`/api/sf/${slug}/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          callbackUrl,
        }),
      });

      if (!res.ok && res.status === 429) {
        setError(tErr("rateLimit"));
        return;
      }

      setIsSent(true);
    } catch {
      setError(tErr("connection"));
    } finally {
      setIsLoading(false);
    }
  }

  if (isSent) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl font-bold">
            {t("sentTitle")}
          </CardTitle>
          <CardDescription className="mt-2">
            {t("sentDescription")}
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
            {t("sentHint")}
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
            {t("useDifferentEmail")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const greeting = returningUser
    ? t("greetingReturning", {
        name: [returningUser.firstName, returningUser.lastName].filter(Boolean).join(" ").trim(),
        tenant: tenantName,
      })
    : t("greetingNew", { tenant: tenantName });

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        {logoUrl && !logoError && (
          <div className="mb-2 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt={tenantName}
              className="h-20 w-auto max-w-[240px] object-contain"
              onError={() => setLogoError(true)}
            />
          </div>
        )}
        <CardTitle className="text-xl font-bold">
          {greeting}
        </CardTitle>
        <CardDescription>
          {t("description")}
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
            <Label htmlFor="sf-email">{t("emailLabel")}</Label>
            <Input
              id="sf-email"
              type="email"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="email"
              autoFocus
              aria-label={t("emailAriaLabel")}
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
                {t("submitting")}
              </>
            ) : (
              t("submit")
            )}
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}
