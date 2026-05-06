import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/confirm
 *
 * Verifies a Supabase auth `token_hash` server-side via `verifyOtp` and then
 * redirects to `next`. This lets us hand admins an invite link rooted at our
 * own domain (oph-ki.ids.online) instead of the raw Supabase action_link.
 *
 * Used by OPH-97 ("Link generieren") and the resend-invite ?mode=link flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (!tokenHash || !type) {
    return NextResponse.redirect(
      `${origin}/login?error=invalid_invite_link`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=invite_link_expired`
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
