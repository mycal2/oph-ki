"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LogOut, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { useBasket } from "@/hooks/use-basket";
import { useSfBasePath } from "@/hooks/use-sf-base-path";

interface SalesforceHeaderProps {
  tenantName: string;
  tenantLogoUrl: string | null;
  slug: string;
}

/**
 * OPH-72 + OPH-77: Mobile-first header for the Salesforce App.
 * Shows IDS.online logo (left), basket icon with count badge (center-right),
 * and tenant manufacturer logo + logout (right).
 */
export function SalesforceHeader({ tenantName, tenantLogoUrl, slug }: SalesforceHeaderProps) {
  const [logoError, setLogoError] = useState(false);
  const { itemCount } = useBasket();
  const basePath = useSfBasePath(slug);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = `${basePath}/login`;
  };

  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <div className="flex h-14 items-center justify-between px-4">
        {/* Left: IDS.online logo */}
        <div className="flex items-center gap-3">
          <Image
            src="/ids-logo.svg"
            alt="IDS.online"
            width={100}
            height={28}
            className="h-7 w-auto"
            priority
          />
        </div>

        {/* Right: Basket icon + Tenant logo + logout */}
        <div className="flex items-center gap-2">
          {/* Basket icon with count badge */}
          <Link href={`${basePath}/basket`} aria-label="Warenkorb anzeigen">
            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9"
              asChild
            >
              <span>
                <ShoppingCart className="h-5 w-5" />
                {itemCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold"
                  >
                    {itemCount > 99 ? "99+" : itemCount}
                  </Badge>
                )}
              </span>
            </Button>
          </Link>

          {tenantLogoUrl && !logoError && (
            <Image
              src={tenantLogoUrl}
              alt={tenantName}
              width={120}
              height={32}
              className="h-8 w-auto max-w-[120px] object-contain"
              onError={() => setLogoError(true)}
              unoptimized
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            aria-label="Abmelden"
            className="h-8 w-8"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
