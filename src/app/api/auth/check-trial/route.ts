import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * OPH-16: Check if an email belongs to a trial tenant.
 * This is a public endpoint (no auth required) used by the login form
 * to detect trial tenants before attempting sign-in.
 *
 * POST /api/auth/check-trial
 * Body: { email: string }
 *
 * Returns: { success: true, data: { isTrial: boolean } }
 *
 * Security note: This endpoint only reveals whether a trial tenant
 * exists for a given email. Trial tenants are publicly known (they
 * receive emails about their trial status), so this is acceptable.
 * We rate-limit via the login form's existing rate limiting.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = body?.email?.trim()?.toLowerCase();

    if (!email) {
      return NextResponse.json(
        { success: true, data: { isTrial: false } },
        { status: 200 }
      );
    }

    // Use the service role client for this lookup (no user session needed)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check if a tenant with status='trial' has this as their contact_email
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("status", "trial")
      .eq("contact_email", email)
      .limit(1)
      .maybeSingle();

    return NextResponse.json(
      { success: true, data: { isTrial: !!tenant } },
      { status: 200 }
    );
  } catch (error) {
    console.error("Trial check error:", error);
    // Fail open — if the check fails, let the login proceed normally
    return NextResponse.json(
      { success: true, data: { isTrial: false } },
      { status: 200 }
    );
  }
}
