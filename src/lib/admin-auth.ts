import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata, ApiResponse } from "@/lib/types";
import type { User, SupabaseClient } from "@supabase/supabase-js";

/**
 * Result of a successful platform admin authentication check.
 */
export interface AdminAuthResult {
  user: User;
  adminClient: SupabaseClient;
}

/**
 * Verifies that the current user is authenticated and has the platform_admin role.
 * Returns the user + admin client on success, or an error response on failure.
 */
export async function requirePlatformAdmin(): Promise<
  AdminAuthResult | NextResponse<ApiResponse>
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: "Nicht authentifiziert." },
      { status: 401 }
    );
  }

  const appMetadata = user.app_metadata as AppMetadata | undefined;

  if (appMetadata?.user_status === "inactive") {
    return NextResponse.json(
      { success: false, error: "Ihr Konto ist deaktiviert." },
      { status: 403 }
    );
  }

  if (appMetadata?.role !== "platform_admin") {
    return NextResponse.json(
      { success: false, error: "Nur fuer Platform-Administratoren." },
      { status: 403 }
    );
  }

  return { user, adminClient: createAdminClient() };
}

/**
 * Type guard to check if the result is an error response.
 */
export function isErrorResponse(
  result: AdminAuthResult | NextResponse<ApiResponse>
): result is NextResponse<ApiResponse> {
  return result instanceof NextResponse;
}
