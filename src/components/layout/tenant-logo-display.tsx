"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import { Separator } from "@/components/ui/separator";
import type { ApiResponse } from "@/lib/types";

/**
 * OPH-51: Displays the tenant company logo in the navigation bar.
 *
 * - Fetches the logo URL from GET /api/settings/logo
 * - Hidden when no logo is set (AC-7)
 * - Hidden for platform_admin on /admin/* pages (AC-9)
 * - Max height 32px, width auto (AC-8)
 * - Handles broken image URLs gracefully (onError hides the element)
 */
export function TenantLogoDisplay() {
  const pathname = usePathname();
  const { isPlatformAdmin, isLoading: isLoadingRole } = useCurrentUserRole();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // AC-9: Hide logo for platform admins on admin pages
  const isAdminPage = pathname.startsWith("/admin");
  const shouldHide = isPlatformAdmin && isAdminPage;

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
    if (shouldHide || isLoadingRole) return;
    fetchLogo();
  }, [shouldHide, isLoadingRole, fetchLogo]);

  // BUG-1 fix: Listen for custom event to re-fetch logo after upload/removal
  useEffect(() => {
    const handler = () => {
      fetchLogo();
    };
    window.addEventListener("tenant-logo-updated", handler);
    return () => window.removeEventListener("tenant-logo-updated", handler);
  }, [fetchLogo]);

  // Don't render anything if hidden, loading, no logo, or image error
  if (shouldHide || isLoading || !logoUrl || hasError) {
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
