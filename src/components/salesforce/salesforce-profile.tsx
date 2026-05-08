"use client";

import { User, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SalesforceOrderHistory } from "./salesforce-order-history";
import { UserLanguageSettings } from "@/components/user-language-settings";

interface SalesforceProfileProps {
  slug: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

/**
 * OPH-86: Salesforce App profile page.
 *
 * Shows the sales rep's personal info (name, email) at the top,
 * with the full order history list (OPH-81) below.
 */
export function SalesforceProfile({
  slug,
  firstName,
  lastName,
  email,
}: SalesforceProfileProps) {
  const t = useTranslations("salesforce.profile");
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || t("displayNameFallback");

  return (
    <div className="flex flex-col gap-6">
      {/* Profile info */}
      <div>
        <h1 className="text-lg font-semibold mb-3">{t("title")}</h1>
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{displayName}</p>
                {firstName && lastName ? (
                  <p className="text-xs text-muted-foreground">
                    {firstName} {lastName}
                  </p>
                ) : null}
              </div>
            </div>
            {email && (
              <>
                <Separator />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4 shrink-0" />
                  <span className="truncate">{email}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* OPH-100: Personal language override — sales reps can pick their UI language. */}
      <UserLanguageSettings />

      {/* Order history (reuses OPH-81 component) */}
      <SalesforceOrderHistory slug={slug} />
    </div>
  );
}
