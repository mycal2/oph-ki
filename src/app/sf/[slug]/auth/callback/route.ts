import { createClient } from "@/lib/supabase/server";
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

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Redirect back to the Salesforce subdomain
      const isLocal = process.env.NODE_ENV === "development";

      if (isLocal) {
        // In development, redirect to the local sf route
        const origin = new URL(request.url).origin;
        return NextResponse.redirect(`${origin}${next}`);
      }

      // In production, redirect to the actual subdomain
      return NextResponse.redirect(`https://${slug}.ids.online${next}`);
    }
  }

  // If code exchange fails, redirect to the login page with an error
  const isLocal = process.env.NODE_ENV === "development";
  if (isLocal) {
    const origin = new URL(request.url).origin;
    return NextResponse.redirect(
      `${origin}/sf/${slug}/login?error=auth_callback_failed`
    );
  }

  return NextResponse.redirect(
    `https://${slug}.ids.online/login?error=auth_callback_failed`
  );
}
