"use client";

import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PlatformTenantContextValue } from "@/context/platform-tenant-context";

interface TenantContextBannerProps {
  activeTenant: PlatformTenantContextValue;
}

/**
 * OPH-92: Banner shown at the top of Stammdaten pages when a platform admin
 * has an active tenant context. Displays the tenant name so the admin always
 * knows whose data they are viewing.
 */
export function TenantContextBanner({ activeTenant }: TenantContextBannerProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
      <Building2 className="h-4 w-4 text-primary shrink-0" />
      <span className="text-sm text-muted-foreground">Mandanten-Kontext:</span>
      <Badge variant="secondary" className="font-medium">
        {activeTenant.tenantName}
      </Badge>
    </div>
  );
}

/**
 * OPH-92: Empty state shown on Stammdaten pages when no tenant context is
 * selected. Prompts the admin to select a tenant via the logo in the header.
 */
export function TenantContextRequired() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Building2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
      <h2 className="text-lg font-semibold mb-1">Kein Mandant ausgewaehlt</h2>
      <p className="text-sm text-muted-foreground max-w-md">
        Bitte waehlen Sie zuerst einen Mandanten aus, indem Sie auf das Logo in
        der oberen Navigation klicken.
      </p>
    </div>
  );
}
