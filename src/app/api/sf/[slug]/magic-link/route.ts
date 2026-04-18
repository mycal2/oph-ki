import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * OPH-84: POST /api/sf/[slug]/magic-link
 *
 * Server-side magic link dispatch with domain validation.
 * Checks the submitted email domain against the tenant's allowed_email_domains
 * before calling Supabase to send the OTP. If the domain is blocked (or the
 * tenant doesn't exist), returns the same 200 response as a successful send
 * to prevent email/domain enumeration.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  // Always return this same response — no enumeration
  const genericSuccess = NextResponse.json({ success: true });

  try {
    const { slug } = await params;

    // 1. Parse body
    let body: { email?: string; callbackUrl?: string };
    try {
      body = await request.json();
    } catch {
      return genericSuccess;
    }

    const email = body.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return genericSuccess;
    }

    const callbackUrl = body.callbackUrl;
    if (!callbackUrl || typeof callbackUrl !== "string") {
      return genericSuccess;
    }

    // 2. Look up tenant by slug (admin client for DB access)
    const adminClient = createAdminClient();
    const { data: tenant } = await adminClient
      .from("tenants")
      .select("id, allowed_email_domains, salesforce_enabled")
      .eq("salesforce_slug", slug)
      .eq("salesforce_enabled", true)
      .single();

    if (!tenant) {
      // Tenant doesn't exist or SF not enabled — silent rejection
      return genericSuccess;
    }

    // 3. Check email domain against allowed_email_domains
    const configuredDomains = (tenant.allowed_email_domains as string[]) ?? [];
    if (configuredDomains.length > 0) {
      const emailDomain = email.split("@")[1]?.toLowerCase() ?? "";
      const allowedLower = configuredDomains.map((d) => d.toLowerCase());
      if (!allowedLower.includes(emailDomain)) {
        // Domain not in allowed list — silent rejection
        return genericSuccess;
      }
    }
    // If no domains configured → fail-open (allow all)

    // 4. Domain is allowed — send the OTP via Supabase (server client)
    const supabase = await createClient();
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl,
        shouldCreateUser: false,
      },
    });

    // Ignore errors: user-not-found is expected for unknown emails,
    // and we return success regardless to prevent enumeration.
    return genericSuccess;
  } catch (error) {
    console.error("Unexpected error in POST /api/sf/[slug]/magic-link:", error);
    // Even on server error, return success to prevent information leakage
    return genericSuccess;
  }
}
