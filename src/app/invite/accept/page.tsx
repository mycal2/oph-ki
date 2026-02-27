import { AuthLayout } from "@/components/auth/auth-layout";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Einladung annehmen | IDS.online",
  description: "Nehmen Sie Ihre Einladung bei IDS.online an.",
};

export default function AcceptInvitePage() {
  return (
    <AuthLayout>
      <AcceptInviteForm />
    </AuthLayout>
  );
}
