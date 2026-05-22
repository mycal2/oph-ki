import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeForm } from "./code-form";

export const metadata: Metadata = {
  title: "Code eingeben | IDS.online",
  description: "Geben Sie den 6-stelligen Code aus Ihrer E-Mail ein.",
  // Page contains email + type query params — keep search engines out.
  robots: { index: false, follow: false },
};

/**
 * OPH-113: 6-digit OTP code entry page.
 *
 * Defender-resistant fallback for invite / password-reset / magic-link flows.
 * When corporate URL detonation (Microsoft Defender Plan 2) has burned the
 * primary `/auth/confirm` link before the human's click, the user lands here
 * to paste the 6-digit code from the email body.
 *
 * Reads `email`, `type`, `next` from query string. `error=token_already_used`
 * is set when redirected here by /auth/confirm after a failed POST (likely
 * because a detonator hit the URL first).
 */
interface PageProps {
  searchParams: Promise<{
    email?: string;
    type?: string;
    next?: string;
    error?: string;
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

export default async function CodePage({ searchParams }: PageProps) {
  const { email, type, next, error } = await searchParams;

  // Bare-minimum validation; if anything is wrong, send to login.
  if (!email || !type || !SUPPORTED_TYPES.has(type)) {
    redirect("/login?error=invalid_invite_link");
  }

  // Per-type headline (mirrors /auth/confirm for visual consistency).
  let headline = "Code eingeben";
  let description = "Geben Sie den 6-stelligen Code aus Ihrer E-Mail ein.";
  if (type === "recovery") {
    headline = "Passwort zurücksetzen";
    description = "Geben Sie den 6-stelligen Code aus Ihrer E-Mail ein, um Ihr Passwort zurückzusetzen.";
  } else if (type === "invite") {
    headline = "Einladung annehmen";
    description = "Geben Sie den 6-stelligen Code aus Ihrer E-Mail ein, um Ihre Einladung anzunehmen.";
  } else if (type === "magiclink") {
    headline = "Anmelden";
    description = "Geben Sie den 6-stelligen Code aus Ihrer E-Mail ein, um sich anzumelden.";
  }

  // Notice when the user was redirected here from /auth/confirm with a burnt token.
  const initialNotice =
    error === "token_already_used"
      ? "Der Link wurde bereits verwendet (oft durch E-Mail-Schutzsoftware Ihres Unternehmens). Geben Sie stattdessen den 6-stelligen Code aus Ihrer E-Mail ein."
      : undefined;

  return (
    <AuthLayout>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">{headline}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <CodeForm
            email={email}
            type={type}
            next={next ?? "/"}
            initialNotice={initialNotice}
          />
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
