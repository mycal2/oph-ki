"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, PackagePlus } from "lucide-react";
import { useSfBasePath } from "@/hooks/use-sf-base-path";

interface SalesforceHomeDashboardProps {
  slug: string;
  firstName: string | null;
  tenantName: string;
  tenantLogoUrl: string | null;
}

export function SalesforceHomeDashboard({
  slug,
  firstName,
  tenantName,
  tenantLogoUrl,
}: SalesforceHomeDashboardProps) {
  const t = useTranslations("salesforce.home");
  const basePath = useSfBasePath(slug);

  const greeting = firstName
    ? t("greetingNamed", { name: firstName })
    : t("greetingFallback");

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {/* Tenant logo */}
      {tenantLogoUrl && (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={tenantLogoUrl}
            alt={tenantName}
            className="h-16 w-auto max-w-[200px] object-contain sm:h-20 sm:max-w-[240px]"
          />
        </div>
      )}

      {/* Greeting */}
      <div className="text-center">
        <h1 className="text-2xl font-bold">{greeting}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("subtitle", { tenant: tenantName })}
        </p>
      </div>

      {/* Navigation tiles */}
      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href={`${basePath}/order`}
          className="block"
          aria-label={t("tilePlaceOrderAriaLabel")}
        >
          <Card className="h-full cursor-pointer transition-colors hover:border-primary hover:bg-accent">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <PackagePlus className="h-6 w-6 text-primary" />
              </div>
              <span className="text-base font-semibold">{t("tilePlaceOrder")}</span>
            </CardContent>
          </Card>
        </Link>

        <Link
          href={`${basePath}/orders`}
          className="block"
          aria-label={t("tileMyOrdersAriaLabel")}
        >
          <Card className="h-full cursor-pointer transition-colors hover:border-primary hover:bg-accent">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <ClipboardList className="h-6 w-6 text-primary" />
              </div>
              <span className="text-base font-semibold">{t("tileMyOrders")}</span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
