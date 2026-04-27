"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types";

/**
 * Returns the current user's role from their profile.
 * Useful for conditionally rendering admin-only UI.
 * OPH-74: Also returns salesforceEnabled from the tenant's salesforce_enabled flag.
 */
export function useCurrentUserRole() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [salesforceEnabled, setSalesforceEnabled] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          setUserId(user.id);
          const { data: profile } = await supabase
            .from("user_profiles")
            .select("role, tenant_id")
            .eq("id", user.id)
            .single();

          setRole(
            (profile?.role as UserRole) ??
              (user.app_metadata?.role as UserRole) ??
              "tenant_user"
          );

          // OPH-74: Fetch salesforce_enabled from tenant
          const tenantId =
            profile?.tenant_id ??
            (user.app_metadata?.tenant_id as string | undefined);
          if (tenantId) {
            const { data: tenant } = await supabase
              .from("tenants")
              .select("salesforce_enabled")
              .eq("id", tenantId)
              .single();

            setSalesforceEnabled(tenant?.salesforce_enabled === true);
          }
        }
      } catch {
        // Ignore
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, []);

  const isPlatformAdmin = role === "platform_admin";
  const isPlatformAdminOrViewer = isPlatformAdmin || role === "platform_viewer";
  const isTenantAdmin = role === "tenant_admin";

  return { role, userId, isLoading, isPlatformAdmin, isPlatformAdminOrViewer, isTenantAdmin, salesforceEnabled };
}
