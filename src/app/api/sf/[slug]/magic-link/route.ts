import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { wrapConfirmLink } from "@/lib/auth/wrap-confirm-link";
import { sendSalesforceMagicLinkEmail } from "@/lib/postmark";

/**
 * OPH-84: POST /api/sf/[slug]/magic-link
 *
 * Server-side magic link dispatch with domain validation.
 * Checks the submitted email domain against the tenant's allowed_email_domains
 * before sending the OTP. If the domain is blocked (or the tenant doesn't
 * exist), returns the same 200 response as a successful send to prevent
 * email/domain enumeration.
 *
 * OPH-112: The OTP is now sent via Postmark with the link routed through
 * /auth/confirm (click-to-confirm page). The old `signInWithOtp` flow let
 * corporate email scanners (Defender, Mimecast, etc.) burn the single-use
 * token before the human clicked.
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
      .select("id, name, allowed_email_domains, salesforce_enabled")
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

    // 4. OPH-112: Verify user exists before minting a token (preserves the old
    //    `shouldCreateUser: false` behaviour from signInWithOtp).
    //    The admin SDK doesn't expose a direct "get by email" — use a paged
    //    listUsers + filter. Limited to first 200 users; sufficient for SF
    //    use cases at current tenant scale.
    const { data: usersList, error: lookupError } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (lookupError) {
      console.error("SF magic-link: listUsers error:", lookupError.message);
      return genericSuccess;
    }
    const matchingUser = usersList?.users.find(
      (u) => u.email?.toLowerCase() === email
    );
    if (!matchingUser) {
      // User doesn't exist — silent rejection (no enumeration)
      return genericSuccess;
    }

    // 5. Generate the magic-link token without sending an email.
    //    Supabase's `generateLink` with type:"magiclink" requires the user to
    //    already exist (which we just confirmed).
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const { data: linkData, error: linkError } =
      await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: callbackUrl },
      });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("SF magic-link: generateLink failed:", linkError?.message);
      return genericSuccess;
    }

    // Convert absolute callbackUrl to a path for the `next` redirect.
    // Falls back to root if the URL is unparseable.
    let nextPath = "/";
    try {
      const parsed = new URL(callbackUrl);
      nextPath = parsed.pathname + parsed.search + parsed.hash;
    } catch {
      // callbackUrl is not a valid absolute URL — keep "/" default
    }

    const magicLink = wrapConfirmLink({
      siteUrl,
      hashedToken: linkData.properties.hashed_token,
      type: "magiclink",
      next: nextPath,
    });

    // 6. Send via Postmark
    const postmarkToken = process.env.POSTMARK_SERVER_API_TOKEN;
    if (postmarkToken) {
      await sendSalesforceMagicLinkEmail({
        serverApiToken: postmarkToken,
        toEmail: email,
        magicLink,
        tenantName: (tenant.name as string) ?? "Außendienst",
        siteUrl,
      });
    } else {
      console.error("SF magic-link: POSTMARK_SERVER_API_TOKEN not configured.");
    }

    return genericSuccess;
  } catch (error) {
    console.error("Unexpected error in POST /api/sf/[slug]/magic-link:", error);
    // Even on server error, return success to prevent information leakage
    return genericSuccess;
  }
}
