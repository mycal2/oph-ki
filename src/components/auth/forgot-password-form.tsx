"use client";

import { useState } from "react";
import Link from "next/link";
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
import { forgotPasswordAction } from "@/lib/auth-actions";
import { Loader2, AlertCircle, Mail, ArrowLeft } from "lucide-react";

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgotPassword");
  const tLogin = useTranslations("auth.login");
  const tCommon = useTranslations("common");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await forgotPasswordAction(email);
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error ?? tCommon("unknownError"));
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
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">
            {t("successTitle")}
          </CardTitle>
          <CardDescription>
            {t.rich("successDescription", {
              email,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/login">
            <Button variant="ghost">
              <ArrowLeft className="h-4 w-4" />
              {t("backToLogin")}
            </Button>
          </Link>
        </CardFooter>
      </Card>
    );
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
          <div className="space-y-2">
            <Label htmlFor="email">{tLogin("emailLabel")}</Label>
            <Input
              id="email"
              type="email"
              placeholder={tLogin("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              aria-label={tLogin("emailAriaLabel")}
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
            href="/login"
            className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" />
            {t("backToLogin")}
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
