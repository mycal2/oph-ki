"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import { usePlatformTenantContext } from "@/hooks/use-platform-tenant-context";
import { TenantSwitcherModal } from "@/components/layout/tenant-switcher-modal";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import type { ApiResponse } from "@/lib/types";

/**
 * OPH-51: Displays the tenant company logo in the navigation bar.
 * OPH-92: For platform_admin users, the logo is clickable and opens the tenant switcher modal.
 *         When a tenant context is active, the context tenant's logo and name are shown instead.
 *
 * - Fetches the logo URL from GET /api/settings/logo
 * - Hidden when no logo is set (AC-7) — unless platform admin has a tenant context active
 * - Hidden for platform_admin on /admin/* pages (AC-9) — unless tenant context overrides
 * - Max height 32px, width auto (AC-8)
 * - Handles broken image URLs gracefully (onError hides the element)
 */
export function TenantLogoDisplay() {
  const pathname = usePathname();
  const { isPlatformAdmin, isLoading: isLoadingRole } = useCurrentUserRole();
  const { activeTenant } = usePlatformTenantContext();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // AC-9: Hide logo for platform admins on admin pages (original behavior)
  // OPH-92: But if platform admin has a tenant context active, always show it
  const isAdminPage = pathname.startsWith("/admin");
  const shouldHideOriginalLogo = isPlatformAdmin && isAdminPage && !activeTenant;

  const fetchLogo = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/logo");
      const json = (await res.json()) as ApiResponse<{ logo_url: string | null }>;

      if (res.ok && json.success && json.data?.logo_url) {
        setLogoUrl(json.data.logo_url);
        setHasError(false);
      } else {
        setLogoUrl(null);
      }
    } catch {
      setLogoUrl(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (shouldHideOriginalLogo || isLoadingRole) return;
    // Platform admins with an active tenant context don't need their own logo
    if (isPlatformAdmin && activeTenant) {
      setIsLoading(false);
      return;
    }
    fetchLogo();
  }, [shouldHideOriginalLogo, isLoadingRole, fetchLogo, isPlatformAdmin, activeTenant]);

  // BUG-1 fix: Listen for custom event to re-fetch logo after upload/removal
  useEffect(() => {
    const handler = () => {
      fetchLogo();
    };
    window.addEventListener("tenant-logo-updated", handler);
    return () => window.removeEventListener("tenant-logo-updated", handler);
  }, [fetchLogo]);

  // Determine which logo and name to display
  const displayLogoUrl = isPlatformAdmin && activeTenant
    ? activeTenant.tenantLogoUrl
    : logoUrl;
  const displayTenantName = isPlatformAdmin && activeTenant
    ? activeTenant.tenantName
    : null;

  // For platform admin: always show the area (clickable), even if no logo yet
  if (isPlatformAdmin) {
    const showLogoImage = displayLogoUrl && !hasError;

    return (
      <>
        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Clickable button for platform admins (AC-1, AC-2) */}
        <button
          type="button"
          onClick={() => setSwitcherOpen(true)}
          className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={
            activeTenant
              ? `Aktiver Mandant: ${activeTenant.tenantName}. Klicken zum Wechseln.`
              : "Mandant auswaehlen"
          }
        >
          {showLogoImage ? (
            <Image
              src={displayLogoUrl}
              alt={displayTenantName ?? "Firmenlogo"}
              width={120}
              height={32}
              className="h-8 w-auto max-w-[120px] object-contain"
              onError={() => setHasError(true)}
              unoptimized
            />
          ) : activeTenant ? (
            /* Fallback: show initials when no logo */
            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
              <span className="text-xs font-medium text-muted-foreground">
                {activeTenant.tenantName
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
            </div>
          ) : null}

          {/* AC-15: Show active tenant name as a badge/label */}
          {activeTenant ? (
            <Badge variant="secondary" className="text-xs font-normal max-w-[140px] truncate">
              {activeTenant.tenantName}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">
              Mandant waehlen
            </span>
          )}
        </button>

        <TenantSwitcherModal open={switcherOpen} onOpenChange={setSwitcherOpen} />
      </>
    );
  }

  // Non-admin: original behavior — static logo, not clickable (AC-3)
  if (shouldHideOriginalLogo || isLoading || !logoUrl || hasError) {
    return null;
  }

  return (
    <>
      <Separator orientation="vertical" className="h-6 mx-1" />
      <Image
        src={logoUrl}
        alt="Firmenlogo"
        width={120}
        height={32}
        className="h-8 w-auto max-w-[120px] object-contain"
        onError={() => setHasError(true)}
        unoptimized
      />
    </>
  );
}
