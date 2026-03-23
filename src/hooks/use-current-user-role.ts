"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types";

/**
 * Returns the current user's role from their profile.
 * Useful for conditionally rendering admin-only UI.
 */
export function useCurrentUserRole() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
            .select("role")
            .eq("id", user.id)
            .single();

          setRole(
            (profile?.role as UserRole) ??
              (user.app_metadata?.role as UserRole) ??
              "tenant_user"
          );
        }
      } catch {
        // Ignore
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, []);

  return { role, userId, isLoading, isPlatformAdmin: role === "platform_admin" };
}
