import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/trial-expiry-check
 *
 * OPH-16: Daily cron job that checks for expiring trial tenants and notifies
 * the platform admin via email.
 *
 * Notifications:
 *   - 7 days before expiry: "Testphase läuft in 7 Tagen ab"
 *   - On expiry day: "Testphase ist heute abgelaufen"
 *   - After expiry: daily reminder until admin changes tenant status
 *
 * Secured via CRON_SECRET bearer token (Vercel Cron standard).
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const serverApiToken = process.env.POSTMARK_SERVER_API_TOKEN;
  const adminEmail = process.env.PLATFORM_ADMIN_EMAIL;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  if (!serverApiToken || !adminEmail) {
    console.warn("Trial expiry check: POSTMARK_SERVER_API_TOKEN or PLATFORM_ADMIN_EMAIL not configured");
    return NextResponse.json({ success: true, message: "Skipped — missing configuration." });
  }

  const fromDomain = siteUrl.replace(/^https?:\/\//, "").split("/")[0];
  if (fromDomain.startsWith("localhost")) {
    return NextResponse.json({ success: true, message: "Skipped — localhost." });
  }

  try {
    const adminClient = createAdminClient();

    // Find all trial tenants
    const { data: trialTenants, error } = await adminClient
      .from("tenants")
      .select("id, name, trial_expires_at")
      .eq("status", "trial")
      .not("trial_expires_at", "is", null)
      .limit(200);

    if (error) {
      console.error("Error fetching trial tenants:", error.message);
      return NextResponse.json(
        { success: false, error: "Failed to fetch trial tenants." },
        { status: 500 }
      );
    }

    if (!trialTenants || trialTenants.length === 0) {
      return NextResponse.json({ success: true, message: "No trial tenants found." });
    }

    const now = new Date();
    const notifications: Array<{ tenantName: string; expiresAt: string; type: string }> = [];

    for (const tenant of trialTenants) {
      const expiresAt = new Date(tenant.trial_expires_at as string);
      const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      if (daysRemaining === 7) {
        notifications.push({
          tenantName: tenant.name as string,
          expiresAt: expiresAt.toLocaleDateString("de-DE"),
          type: "warning",
        });
      } else if (daysRemaining <= 0) {
        notifications.push({
          tenantName: tenant.name as string,
          expiresAt: expiresAt.toLocaleDateString("de-DE"),
          type: "expired",
        });
      }
    }

    if (notifications.length === 0) {
      return NextResponse.json({ success: true, message: "No notifications needed." });
    }

    // Build a single summary email for the admin
    const lines: string[] = [
      "Trial-Mandanten Status-Update",
      "",
    ];

    const expired = notifications.filter((n) => n.type === "expired");
    const warnings = notifications.filter((n) => n.type === "warning");

    if (expired.length > 0) {
      lines.push("ABGELAUFEN:");
      for (const n of expired) {
        lines.push(`  - ${n.tenantName} (abgelaufen am ${n.expiresAt})`);
      }
      lines.push("");
    }

    if (warnings.length > 0) {
      lines.push("LÄUFT BALD AB (7 Tage):");
      for (const n of warnings) {
        lines.push(`  - ${n.tenantName} (läuft ab am ${n.expiresAt})`);
      }
      lines.push("");
    }

    lines.push(`Mandanten verwalten: ${siteUrl}/admin/tenants`);
    lines.push("");
    lines.push("Mit freundlichen Grüßen,");
    lines.push("Ihr Order Intelligence System");

    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": serverApiToken,
      },
      body: JSON.stringify({
        From: `noreply@${fromDomain}`,
        To: adminEmail,
        Subject: `Trial-Status: ${expired.length} abgelaufen, ${warnings.length} laufen bald ab`,
        TextBody: lines.join("\n"),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to send trial expiry notification:", errorText);
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${notifications.length} notification(s).`,
    });
  } catch (error) {
    console.error("Error in trial-expiry-check cron:", error);
    return NextResponse.json(
      { success: false, error: "Internal error." },
      { status: 500 }
    );
  }
}
