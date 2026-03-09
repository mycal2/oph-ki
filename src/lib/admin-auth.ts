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
      { success: false, error: "Nur für Platform-Administratoren." },
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

/**
 * Simple in-memory rate limiter for admin endpoints.
 * Limits requests per user to `maxRequests` within `windowMs`.
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkAdminRateLimit(
  userId: string,
  maxRequests = 60,
  windowMs = 60_000
): NextResponse<ApiResponse> | null {
  const now = Date.now();
  const key = userId;
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  entry.count++;
  if (entry.count > maxRequests) {
    return NextResponse.json(
      { success: false, error: "Zu viele Anfragen. Bitte warten Sie einen Moment." },
      { status: 429 }
    );
  }

  return null;
}
