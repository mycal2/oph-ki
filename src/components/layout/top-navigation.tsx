"use client";

import Image from "next/image";
import Link from "next/link";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { TenantLogoDisplay } from "@/components/layout/tenant-logo-display";

export function TopNavigation() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Orange brand bar */}
      <div className="h-1 w-full bg-primary" />
      <div className="flex h-14 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3 md:gap-4">
          {/* Mobile hamburger — opens sidebar Sheet */}
          <SidebarTrigger className="md:hidden shrink-0 h-8 w-8" aria-label="Menü öffnen" />

          <Link href="/dashboard" className="flex items-center" aria-label="Zur Startseite">
            <Image
              src="/ids-logo.svg"
              alt="IDS.online"
              width={120}
              height={37}
              priority
              className="h-7 w-auto"
            />
          </Link>

          {/* OPH-51: Tenant company logo */}
          <TenantLogoDisplay />
        </div>

        <UserMenu />
      </div>
    </header>
  );
}
