"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ClipboardList, LogOut, ShoppingCart, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { useBasket } from "@/hooks/use-basket";
import { useSfBasePath } from "@/hooks/use-sf-base-path";

interface SalesforceHeaderProps {
  tenantName: string;
  tenantLogoUrl: string | null;
  slug: string;
  /** OPH-85: Display name for the logged-in user (first + last, or email fallback). */
  userName: string | null;
}

/**
 * OPH-72 + OPH-77 + OPH-85: Mobile-first header for the Salesforce App.
 * Shows IDS.online logo (left), basket icon with count badge, user name dropdown,
 * and tenant manufacturer logo (right).
 */
export function SalesforceHeader({ tenantName, tenantLogoUrl, slug, userName }: SalesforceHeaderProps) {
  const [logoError, setLogoError] = useState(false);
  const { itemCount } = useBasket();
  const basePath = useSfBasePath(slug);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = `${basePath}/login`;
  };

  // Truncate long names for mobile
  const displayName = userName
    ? (userName.length > 20 ? userName.slice(0, 18) + "…" : userName)
    : "Mein Konto";

  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <div className="flex h-14 items-center justify-between px-4">
        {/* Left: IDS.online logo — links to home (OPH-91) */}
        <div className="flex items-center gap-3">
          <Link href={basePath || "/"} aria-label="Zur Startseite">
            <Image
              src="/ids-logo.svg"
              alt="IDS.online"
              width={100}
              height={28}
              className="h-7 w-auto"
              priority
            />
          </Link>
        </div>

        {/* Right: Basket icon + User dropdown + Tenant logo */}
        <div className="flex items-center gap-1">
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

          {/* OPH-85: User name dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-9 gap-1 px-2 text-xs font-medium max-w-[160px]"
              >
                <span className="truncate">{displayName}</span>
                <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href={`${basePath}/profile`} className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Profil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`${basePath}/orders`} className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Bestellhistorie
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                Abmelden
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Tenant logo — links to home (OPH-91) */}
          {tenantLogoUrl && !logoError && (
            <Link href={basePath || "/"} aria-label="Zur Startseite">
              <Image
                src={tenantLogoUrl}
                alt={tenantName}
                width={120}
                height={32}
                className="h-8 w-auto max-w-[120px] object-contain"
                onError={() => setLogoError(true)}
                unoptimized
              />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
