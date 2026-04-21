"use client";

import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, PackagePlus } from "lucide-react";
import { useSfBasePath } from "@/hooks/use-sf-base-path";

interface SalesforceHomeDashboardProps {
  slug: string;
  /** User's first name (null if not set in profile). */
  firstName: string | null;
  /** Tenant display name (manufacturer). */
  tenantName: string;
  /** Tenant company logo URL (from tenants.logo_url). */
  tenantLogoUrl: string | null;
}

/**
 * OPH-91: Salesforce App home dashboard.
 *
 * Shows a personal greeting, tenant logo, and two large navigation tiles:
 * - "Bestellung erfassen" -> article search (/sf/[slug]/order)
 * - "Meine Bestellungen" -> order history (/sf/[slug]/orders)
 */
export function SalesforceHomeDashboard({
  slug,
  firstName,
  tenantName,
  tenantLogoUrl,
}: SalesforceHomeDashboardProps) {
  const basePath = useSfBasePath(slug);

  const greeting = firstName ? `Hallo ${firstName}!` : "Willkommen!";

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
          Willkommen bei der {tenantName} Bestellplattform.
        </p>
      </div>

      {/* Navigation tiles */}
      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href={`${basePath}/order`}
          className="block"
          aria-label="Bestellung erfassen"
        >
          <Card className="h-full cursor-pointer transition-colors hover:border-primary hover:bg-accent">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <PackagePlus className="h-6 w-6 text-primary" />
              </div>
              <span className="text-base font-semibold">Bestellung erfassen</span>
            </CardContent>
          </Card>
        </Link>

        <Link
          href={`${basePath}/orders`}
          className="block"
          aria-label="Meine Bestellungen"
        >
          <Card className="h-full cursor-pointer transition-colors hover:border-primary hover:bg-accent">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <ClipboardList className="h-6 w-6 text-primary" />
              </div>
              <span className="text-base font-semibold">Meine Bestellungen</span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
