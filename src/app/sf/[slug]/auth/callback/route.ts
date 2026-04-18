import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/**
 * OPH-75: Salesforce App auth callback route.
 *
 * After a sales rep clicks the magic link in their email, Supabase redirects
 * them to {slug}.ids.online/auth/callback?code=xxx. Middleware rewrites this
 * to /sf/{slug}/auth/callback?code=xxx (which lands here).
 *
 * This route exchanges the authorization code for a session, then redirects
 * back to the Salesforce subdomain home page.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // Detect environment suffix from host header (meisinger-dev.ids.online → "-dev")
  const host = request.headers.get("host") ?? "";
  const envSuffix = host.includes("-dev.ids.online") ? "-dev"
    : host.includes("-staging.ids.online") ? "-staging"
    : "";
  const isLocal = process.env.NODE_ENV === "development";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // OPH-87: Build the redirect response first, then append sf_user cookie
      let redirectUrl: string;
      if (isLocal) {
        // In development, redirect to the local sf route (not root, which would trigger sales_rep redirect)
        const origin = new URL(request.url).origin;
        const sfNext = next === "/" ? `/sf/${slug}/` : `/sf/${slug}${next}`;
        redirectUrl = `${origin}${sfNext}`;
      } else {
        // Redirect back to the Salesforce subdomain (environment-aware)
        redirectUrl = `https://${slug}${envSuffix}.ids.online${next}`;
      }

      const response = NextResponse.redirect(redirectUrl);

      // OPH-87: Fetch user profile and write sf_user cookie for personalized login greeting
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const adminClient = createAdminClient();
          const { data: profile } = await adminClient
            .from("user_profiles")
            .select("first_name, last_name")
            .eq("id", user.id)
            .single();

          if (profile?.first_name && profile?.last_name) {
            const cookieValue = encodeURIComponent(
              JSON.stringify({
                firstName: profile.first_name,
                lastName: profile.last_name,
              })
            );
            const isSecure = !isLocal;
            response.headers.append(
              "Set-Cookie",
              `sf_user=${cookieValue}; Path=/; Max-Age=2592000; SameSite=Lax${isSecure ? "; Secure" : ""}`
            );
          }
        }
      } catch {
        // Non-critical — personalized greeting is a nice-to-have, don't block auth
      }

      return response;
    }
  }

  // If code exchange fails, redirect to the login page with an error
  if (isLocal) {
    const origin = new URL(request.url).origin;
    return NextResponse.redirect(
      `${origin}/sf/${slug}/login?error=auth_callback_failed`
    );
  }

  return NextResponse.redirect(
    `https://${slug}${envSuffix}.ids.online/login?error=auth_callback_failed`
  );
}
