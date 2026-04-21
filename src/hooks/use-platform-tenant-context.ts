"use client";

import { useContext } from "react";
import { PlatformTenantContext } from "@/context/platform-tenant-context";

/**
 * OPH-92: Hook to access the platform admin's active tenant context.
 *
 * SECURITY: Returns null for all non-platform_admin users. Even if localStorage
 * contains a stale value from a previous session, the context provider checks
 * the user's role from app_metadata and ignores stale values for non-admins.
 *
 * Usage:
 *   const { activeTenant, setActiveTenant, clearActiveTenant } = usePlatformTenantContext();
 */
export function usePlatformTenantContext() {
  const context = useContext(PlatformTenantContext);

  if (!context) {
    throw new Error(
      "usePlatformTenantContext must be used within a PlatformTenantContextProvider"
    );
  }

  return context;
}
