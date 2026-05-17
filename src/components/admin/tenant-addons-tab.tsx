"use client";

import { useState, useEffect, useCallback } from "react";
import { Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Tenant } from "@/lib/types";
import type { UpdateTenantInput } from "@/lib/validations";

interface TenantAddonsTabProps {
  tenant: Tenant;
  onSave: (data: UpdateTenantInput) => Promise<Tenant | null>;
  isMutating: boolean;
}

export function TenantAddonsTab({
  tenant,
  onSave,
  isMutating,
}: TenantAddonsTabProps) {
  const tAddons = useTranslations("admin.tenantProfile.addons");

  const [priceLookupEnabled, setPriceLookupEnabled] = useState(
    tenant.price_lookup_enabled
  );

  useEffect(() => {
    setPriceLookupEnabled(tenant.price_lookup_enabled);
  }, [tenant.price_lookup_enabled]);

  // OPH-104: Immediate persistence on toggle (no Save button).
  const handlePriceLookupToggle = useCallback(
    async (next: boolean) => {
      setPriceLookupEnabled(next);
      const result = await onSave({ price_lookup_enabled: next });
      if (!result) {
        setPriceLookupEnabled(!next);
      }
    },
    [onSave]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          {tAddons("sectionTitle")}
        </CardTitle>
        <CardDescription>{tAddons("tabDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <Label htmlFor="price-lookup-enabled" className="text-base">
                {tAddons("priceLookupLabel")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {tAddons("priceLookupDescription")}
              </p>
            </div>
            <Switch
              id="price-lookup-enabled"
              checked={priceLookupEnabled}
              onCheckedChange={handlePriceLookupToggle}
              aria-label={tAddons("priceLookupAriaLabel")}
              disabled={isMutating}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
