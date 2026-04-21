"use client";

import { createContext, useState, useEffect, useCallback, useMemo } from "react";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";

const STORAGE_KEY = "platform_admin_tenant_context";

/** Shape of the stored tenant context. */
export interface PlatformTenantContextValue {
  tenantId: string;
  tenantName: string;
  tenantLogoUrl: string | null;
}

export interface PlatformTenantContextType {
  /** The currently active tenant context, or null if none selected. */
  activeTenant: PlatformTenantContextValue | null;
  /** Whether the current user is a platform_admin (eligible for context switching). */
  isPlatformAdmin: boolean;
  /** Whether the role is still loading. */
  isLoading: boolean;
  /** Set the active tenant context and persist to localStorage. */
  setActiveTenant: (tenant: PlatformTenantContextValue) => void;
  /** Clear the active tenant context. */
  clearActiveTenant: () => void;
}

export const PlatformTenantContext = createContext<PlatformTenantContextType | null>(null);

interface PlatformTenantContextProviderProps {
  children: React.ReactNode;
}

/**
 * OPH-92: Provider that manages the platform admin's tenant context.
 *
 * SECURITY:
 * - Only reads/writes localStorage for platform_admin users (checked via app_metadata).
 * - For non-admin users, activeTenant is always null and setActiveTenant is a no-op.
 * - If a non-admin user has a stale localStorage value, it is ignored.
 */
export function PlatformTenantContextProvider({ children }: PlatformTenantContextProviderProps) {
  const { isPlatformAdmin, isLoading: isLoadingRole } = useCurrentUserRole();
  const [activeTenant, setActiveTenantState] = useState<PlatformTenantContextValue | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage once role is known
  useEffect(() => {
    if (isLoadingRole) return;

    if (isPlatformAdmin) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as PlatformTenantContextValue;
          // Validate the stored value has the expected shape
          if (parsed.tenantId && parsed.tenantName) {
            setActiveTenantState(parsed);
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    } else {
      // Non-admin: ensure no stale context
      setActiveTenantState(null);
    }
    setHydrated(true);
  }, [isPlatformAdmin, isLoadingRole]);

  const setActiveTenant = useCallback(
    (tenant: PlatformTenantContextValue) => {
      // SECURITY: refuse to set context for non-admin users
      if (!isPlatformAdmin) return;

      setActiveTenantState(tenant);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tenant));
      } catch {
        // localStorage might be full or unavailable — ignore silently
      }
    },
    [isPlatformAdmin]
  );

  const clearActiveTenant = useCallback(() => {
    setActiveTenantState(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<PlatformTenantContextType>(
    () => ({
      activeTenant: isPlatformAdmin ? activeTenant : null,
      isPlatformAdmin,
      isLoading: isLoadingRole || !hydrated,
      setActiveTenant,
      clearActiveTenant,
    }),
    [activeTenant, isPlatformAdmin, isLoadingRole, hydrated, setActiveTenant, clearActiveTenant]
  );

  return (
    <PlatformTenantContext.Provider value={value}>
      {children}
    </PlatformTenantContext.Provider>
  );
}
