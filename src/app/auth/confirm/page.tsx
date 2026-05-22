import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { confirmAuthToken } from "./actions";

export const metadata: Metadata = {
  title: "Bestätigen | IDS.online",
  description: "Bestätigen Sie Ihren Einladungs- oder Wiederherstellungslink.",
  // Defence-in-depth: prevent any caching of the page that contains the
  // token_hash query param. The token is per-user and time-limited.
  robots: { index: false, follow: false },
};

/**
 * OPH-111: Two-step confirmation page for invite & password-reset tokens.
 *
 * Replaces the old GET route handler that called `verifyOtp` directly — that
 * version was consumed by corporate email link-prefetch scanners (Microsoft
 * Defender Safe Links, Mimecast URL Protect, Google Workspace pre-scan,
 * Proofpoint URL Defense) before the human ever clicked.
 *
 * Now: GET shows a confirmation page with a "Bestätigen" button. Only the
 * button-triggered POST (via server action) consumes the token. Scanners
 * doing GETs see harmless HTML; the single-use token survives until the
 * intended user click.
 */
interface PageProps {
  searchParams: Promise<{
    token_hash?: string;
    type?: string;
    next?: string;
  }>;
}

const SUPPORTED_TYPES = new Set([
  "invite",
  "recovery",
  "email_change",
  "email",
  "signup",
  "magiclink",
]);

export default async function ConfirmPage({ searchParams }: PageProps) {
  const { token_hash, type, next } = await searchParams;

  // Validate inputs at render time so a malformed prefetch GET also lands
  // on the login page (instead of rendering an unclickable form).
  if (!token_hash || !type || !SUPPORTED_TYPES.has(type)) {
    redirect("/login?error=invalid_invite_link");
  }

  // Per-type labels — defaults to invite wording.
  let headline = "Einladung annehmen";
  let description = "Klicken Sie auf den Button, um Ihre Einladung anzunehmen und Ihr Passwort festzulegen.";
  let buttonLabel = "Einladung annehmen";

  if (type === "recovery") {
    headline = "Passwort zurücksetzen";
    description = "Klicken Sie auf den Button, um zur Passwort-Eingabe zu gelangen.";
    buttonLabel = "Weiter";
  } else if (type === "magiclink") {
    headline = "Anmelden";
    description = "Klicken Sie auf den Button, um sich anzumelden.";
    buttonLabel = "Anmelden";
  }

  return (
    <AuthLayout>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">{headline}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={confirmAuthToken} className="space-y-4">
            <input type="hidden" name="token_hash" value={token_hash} />
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="next" value={next ?? "/"} />
            <Button type="submit" className="w-full" size="lg">
              {buttonLabel}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Dieser Link ist einmalig verwendbar.
            </p>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
