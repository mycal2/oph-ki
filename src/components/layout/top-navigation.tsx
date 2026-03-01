"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { UserMenu } from "@/components/layout/user-menu";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import { cn } from "@/lib/utils";

interface NavLink {
  href: string;
  label: string;
  adminOnly?: boolean;
}

const allNavLinks: NavLink[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/orders", label: "Bestellungen" },
  { href: "/settings/dealer-mappings", label: "Zuordnungen" },
  { href: "/admin/dealers", label: "Haendler-Profile", adminOnly: true },
];

export function TopNavigation() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isPlatformAdmin } = useCurrentUserRole();

  const navLinks = useMemo(
    () => allNavLinks.filter((link) => !link.adminOnly || isPlatformAdmin),
    [isPlatformAdmin]
  );

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Orange brand bar */}
      <div className="h-1 w-full bg-primary" />
      <div className="flex h-14 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-4 md:gap-6">
          {/* Mobile hamburger menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden shrink-0"
                aria-label="Menue oeffnen"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64">
              <SheetHeader>
                <SheetTitle>
                  <Image
                    src="/ids-logo.svg"
                    alt="IDS.online"
                    width={120}
                    height={37}
                    className="h-7 w-auto"
                  />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 mt-6" aria-label="Hauptnavigation">
                {navLinks.map(({ href, label }) => {
                  const isActive =
                    href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {label}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>

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
          <nav className="hidden md:flex items-center gap-1" aria-label="Hauptnavigation">
            {navLinks.map(({ href, label }) => {
              const isActive =
                href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <UserMenu />
      </div>
    </header>
  );
}
