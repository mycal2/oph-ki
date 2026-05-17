"use client";

import { useState, useEffect, useCallback } from "react";
import { Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { ApiResponse } from "@/lib/types";

/**
 * OPH-104: Tenant Price Lookup Feature Flag — read-only display card.
 *
 * Shows the current state of the Price Lookup add-on for the tenant. Only
 * platform admins can toggle the flag (via the admin tenant detail page);
 * tenant admins see this read-only badge.
 */

interface PriceLookupSettingsResponse {
  price_lookup_enabled: boolean;
}

export function TenantPriceLookupStatus() {
  const t = useTranslations("settings.priceLookup");
  const tCommon = useTranslations("common");

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch("/api/settings/price-lookup");
      const json = (await res.json()) as ApiResponse<PriceLookupSettingsResponse>;

      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? t("loadError"));
        return;
      }

      setEnabled(json.data.price_lookup_enabled);
    } catch {
      setError(t("loadConnectionError"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-64" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error}{" "}
              <Button
                variant="link"
                className="h-auto p-0"
                onClick={fetchStatus}
              >
                {tCommon("tryAgain")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t("statusLabel")}</span>
            {enabled ? (
              <Badge
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-600"
              >
                {t("statusActive")}
              </Badge>
            ) : (
              <Badge variant="secondary">{t("statusInactive")}</Badge>
            )}
            {!enabled && (
              <span className="text-xs text-muted-foreground">
                · {t("helperInactive")}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
