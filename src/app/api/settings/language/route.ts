import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tenantLanguageSchema } from "@/lib/validations";
import { TENANT_LOCALE_COOKIE_NAME, isLocale } from "@/i18n/routing";
import {
  tenantLocaleCookieOptions,
  tenantLocaleClearOptions,
} from "@/lib/i18n/locale-cookie";
import { checkAdminRateLimit } from "@/lib/admin-auth";
import type { AppMetadata, ApiResponse } from "@/lib/types";

/**
 * OPH-99: Tenant-Level Language Preference.
 *
 * GET  → returns the tenant's `preferred_locale` (or null).
 * PATCH → updates `preferred_locale`. Tenant_admin or platform_admin only.
 *
 * Service-role client is used to bypass RLS — role authorisation is enforced
 * here in the handler. The endpoint also writes the `tenant_locale` cookie on
 * PATCH so the change takes effect on the next navigation without a hard
 * reload (the middleware also syncs it on subsequent requests).
 */

interface LanguageSettingsResponse {
  preferred_locale: "de" | "en" | null;
}

export async function GET(): Promise<
  NextResponse<ApiResponse<LanguageSettingsResponse>>
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

    const tenantId = appMetadata?.tenant_id;
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("preferred_locale")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { success: false, error: "Mandant nicht gefunden." },
        { status: 404 }
      );
    }

    const value = (tenant as { preferred_locale: string | null })
      .preferred_locale;
    return NextResponse.json({
      success: true,
      data: {
        preferred_locale: isLocale(value) ? value : null,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/settings/language:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request
): Promise<NextResponse<ApiResponse<LanguageSettingsResponse>>> {
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

    const tenantId = appMetadata?.tenant_id;
    const role = appMetadata?.role;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    // 2. Authorize: tenant_admin or platform_admin only
    if (role !== "tenant_admin" && role !== "platform_admin") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Nur Administratoren können die Sprache des Mandanten ändern.",
        },
        { status: 403 }
      );
    }

    // BUG-3 fix: rate-limit writes to match the cadence of other admin write
    // endpoints (60 requests / minute / user).
    const rateLimitResponse = checkAdminRateLimit(user.id);
    if (rateLimitResponse) {
      return rateLimitResponse as unknown as NextResponse<ApiResponse<LanguageSettingsResponse>>;
    }

    // 3. Validate request body
    const body = await request.json().catch(() => null);
    if (body === null) {
      return NextResponse.json(
        { success: false, error: "Ungültiger Anfragetext." },
        { status: 400 }
      );
    }

    const parseResult = tenantLanguageSchema.safeParse(body);

    if (!parseResult.success) {
      const firstError =
        parseResult.error.issues[0]?.message ?? "Ungültige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { preferred_locale } = parseResult.data;

    // 4. Persist
    const adminClient = createAdminClient();
    const { data: updated, error: updateError } = await adminClient
      .from("tenants")
      .update({ preferred_locale })
      .eq("id", tenantId)
      .select("preferred_locale")
      .single();

    if (updateError || !updated) {
      console.error(
        "Failed to update tenant preferred_locale:",
        updateError?.message
      );
      return NextResponse.json(
        { success: false, error: "Sprache konnte nicht gespeichert werden." },
        { status: 500 }
      );
    }

    // 5. Build response and immediately update tenant_locale cookie so the
    //    change takes effect on the very next navigation without waiting for
    //    the middleware to sync it on the subsequent request.
    const stored = (updated as { preferred_locale: string | null })
      .preferred_locale;
    const response = NextResponse.json({
      success: true,
      data: {
        preferred_locale: isLocale(stored) ? stored : null,
      },
    });

    // BUG-6: cookie is scoped to .ids.online in production so SF subdomain
    // siblings (e.g. meisinger.ids.online) see the change too.
    const host = request.headers.get("host");
    if (isLocale(stored)) {
      response.cookies.set({
        name: TENANT_LOCALE_COOKIE_NAME,
        value: stored,
        ...tenantLocaleCookieOptions(host),
      });
    } else {
      // null → clear the cookie so resolveLocale falls back to the default.
      response.cookies.set({
        name: TENANT_LOCALE_COOKIE_NAME,
        value: "",
        ...tenantLocaleClearOptions(host),
      });
    }

    return response;
  } catch (error) {
    console.error("Error in PATCH /api/settings/language:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
