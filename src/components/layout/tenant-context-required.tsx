"use client";

import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { PlatformTenantContextValue } from "@/context/platform-tenant-context";

interface TenantContextBannerProps {
  activeTenant: PlatformTenantContextValue;
}

export function TenantContextBanner({ activeTenant }: TenantContextBannerProps) {
  const t = useTranslations("layout.tenantContext");
  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
      <Building2 className="h-4 w-4 text-primary shrink-0" />
      <span className="text-sm text-muted-foreground">{t("bannerLabel")}</span>
      <Badge variant="secondary" className="font-medium">
        {activeTenant.tenantName}
      </Badge>
    </div>
  );
}

export function TenantContextRequired() {
  const t = useTranslations("layout.tenantContext");
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Building2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
      <h2 className="text-lg font-semibold mb-1">{t("emptyTitle")}</h2>
      <p className="text-sm text-muted-foreground max-w-md">
        {t("emptyDescription")}
      </p>
    </div>
  );
}
