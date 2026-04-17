"use client";

import { useState } from "react";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface SalesforceHeaderProps {
  tenantName: string;
  tenantLogoUrl: string | null;
}

/**
 * OPH-72: Mobile-first header for the Salesforce App.
 * Shows IDS.online logo (left) and tenant manufacturer logo (right).
 */
export function SalesforceHeader({ tenantName, tenantLogoUrl }: SalesforceHeaderProps) {
  const [logoError, setLogoError] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
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

        {/* Right: Tenant logo + logout */}
        <div className="flex items-center gap-3">
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
