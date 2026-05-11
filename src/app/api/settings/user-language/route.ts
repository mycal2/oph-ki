import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { userLanguageSchema } from "@/lib/validations";
import { USER_LOCALE_COOKIE_NAME, isLocale } from "@/i18n/routing";
import {
  tenantLocaleCookieOptions,
  tenantLocaleClearOptions,
} from "@/lib/i18n/locale-cookie";
import { checkAdminRateLimit } from "@/lib/admin-auth";
import type { AppMetadata, ApiResponse } from "@/lib/types";

/**
 * OPH-100: User-Level Language Override.
 *
 * GET   → returns the authenticated user's `preferred_locale` (or null).
 * PATCH → updates the authenticated user's `preferred_locale`.
 *
 * No role check beyond authentication & active-account: every user owns and
 * may edit their own override. Service-role client is used so the same code
 * path works for sales reps (no RLS surprises) — the row is hard-keyed to
 * `user.id` from the JWT, so users can never write another user's row.
 *
 * On PATCH the response also writes (or clears) the `user_locale` cookie so
 * the change takes effect on the very next navigation, matching the OPH-99
 * tenant-language UX. The middleware also syncs this cookie on subsequent
 * requests so other tabs / devices catch up automatically.
 */

interface UserLanguageSettingsResponse {
  preferred_locale: "de" | "en" | null;
}

export async function GET(): Promise<
  NextResponse<ApiResponse<UserLanguageSettingsResponse>>
> {
  try {
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

    if (appMetadata?.tenant_status === "inactive") {
      return NextResponse.json(
        { success: false, error: "Ihr Mandant ist deaktiviert." },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();
    const { data: profile, error: profileError } = await adminClient
      .from("user_profiles")
      .select("preferred_locale")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error(
        "Failed to load user_profiles.preferred_locale:",
        profileError.message
      );
      return NextResponse.json(
        { success: false, error: "Sprache konnte nicht geladen werden." },
        { status: 500 }
      );
    }

    // Edge case: profile may not yet exist on the very first login. Treat as
    // "not set" rather than failing, so the UI can still render.
    const value =
      (profile as { preferred_locale: string | null } | null)
        ?.preferred_locale ?? null;

    return NextResponse.json({
      success: true,
      data: {
        preferred_locale: isLocale(value) ? value : null,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/settings/user-language:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request
): Promise<NextResponse<ApiResponse<UserLanguageSettingsResponse>>> {
  try {
    // 1. Verify authentication
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

    if (appMetadata?.tenant_status === "inactive") {
      return NextResponse.json(
        { success: false, error: "Ihr Mandant ist deaktiviert." },
        { status: 403 }
      );
    }

    // 2. Rate-limit writes (consistent with /api/settings/language)
    const rateLimitResponse = checkAdminRateLimit(user.id);
    if (rateLimitResponse) {
      return rateLimitResponse as unknown as NextResponse<
        ApiResponse<UserLanguageSettingsResponse>
      >;
    }

    // 3. Validate request body
    const body = await request.json().catch(() => null);
    if (body === null) {
      return NextResponse.json(
        { success: false, error: "Ungültiger Anfragetext." },
        { status: 400 }
      );
    }

    const parseResult = userLanguageSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError =
        parseResult.error.issues[0]?.message ?? "Ungültige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { preferred_locale } = parseResult.data;

    // 4. Persist — hard-keyed to user.id from the JWT, never the request body.
    //    Update only the language column so other profile fields (display name,
    //    etc.) are never clobbered by this endpoint.
    const adminClient = createAdminClient();
    const { data: updated, error: updateError } = await adminClient
      .from("user_profiles")
      .update({ preferred_locale })
      .eq("id", user.id)
      .select("preferred_locale")
      .maybeSingle();

    if (updateError) {
      console.error(
        "Failed to update user_profiles.preferred_locale:",
        updateError.message
      );
      return NextResponse.json(
        { success: false, error: "Sprache konnte nicht gespeichert werden." },
        { status: 500 }
      );
    }

    // Edge case: profile row didn't exist (very first login race). Bail early
    // with a clear error so the user can retry once the profile is created.
    if (!updated) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Profil noch nicht initialisiert. Bitte laden Sie die Seite neu und versuchen Sie es erneut.",
        },
        { status: 404 }
      );
    }

    // 5. Build response and update the user_locale cookie immediately.
    const stored = (updated as { preferred_locale: string | null })
      .preferred_locale;
    const response = NextResponse.json({
      success: true,
      data: {
        preferred_locale: isLocale(stored) ? stored : null,
      },
    });

    // Cookie scope mirrors tenant_locale (.ids.online in production) so the
    // same user logged in on the OPH host and any SF subdomain shares the
    // preference seamlessly.
    const host = request.headers.get("host");
    if (isLocale(stored)) {
      response.cookies.set({
        name: USER_LOCALE_COOKIE_NAME,
        value: stored,
        ...tenantLocaleCookieOptions(host),
      });
    } else {
      // null → user wants to follow the company default. Drop the personal
      // override cookie; the tenant_locale cookie (or system default) takes
      // over on the next request.
      response.cookies.set({
        name: USER_LOCALE_COOKIE_NAME,
        value: "",
        ...tenantLocaleClearOptions(host),
      });
    }

    return response;
  } catch (error) {
    console.error("Error in PATCH /api/settings/user-language:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
