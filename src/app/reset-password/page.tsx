import { AuthLayout } from "@/components/auth/auth-layout";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Neues Passwort | IDS.online",
  description: "Setzen Sie Ihr neues Passwort bei IDS.online.",
};

export default function ResetPasswordPage() {
  return (
    <AuthLayout>
      <ResetPasswordForm />
    </AuthLayout>
  );
}
