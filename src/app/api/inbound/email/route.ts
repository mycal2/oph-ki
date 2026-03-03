import { after, NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { recognizeDealer } from "@/lib/dealer-recognition";
import {
  verifyWebhookToken,
  extractSlugFromEmail,
  filterAttachments,
  sendConfirmationEmail,
  sendQuarantineNotification,
  postmarkInboundPayloadSchema,
} from "@/lib/postmark";
import type { ApiResponse } from "@/lib/types";

/**
 * POST /api/inbound/email
 *
 * Postmark Inbound Webhook endpoint.
 * Receives parsed inbound emails, processes attachments, and creates orders.
 *
 * Security: Secret token in the webhook URL query string (?token=...).
 * Postmark does not support HMAC signatures, so we use a shared secret.
 * Configure the webhook URL in Postmark as:
 *   https://your-app.vercel.app/api/inbound/email?token=YOUR_SECRET
 *
 * Flow: verify → lookup tenant → check dedup → check sender → upload files → create order → trigger extraction
 *
 * Rate limiting: The URL token provides access control. In serverless (Vercel),
 * in-memory rate limiting doesn't persist across invocations. Postmark's own
 * retry logic (max 10 retries over ~2 days) and 25MB payload limit provide
 * sufficient protection. For additional rate limiting, use Vercel's WAF or
 * an upstream reverse proxy.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse>> {
  try {
    // 1. Verify webhook token from URL query string
    const webhookToken = process.env.POSTMARK_INBOUND_WEBHOOK_TOKEN;
    if (!webhookToken) {
      console.error("POSTMARK_INBOUND_WEBHOOK_TOKEN not configured");
      return NextResponse.json(
        { success: false, error: "Webhook not configured." },
        { status: 500 }
      );
    }

    const requestToken = request.nextUrl.searchParams.get("token");
    if (!verifyWebhookToken(requestToken, webhookToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid token." },
        { status: 401 }
      );
    }

    // 2. Read, parse, and validate the JSON payload (reject oversized payloads)
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 30 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "Payload too large." },
        { status: 413 }
      );
    }

    const rawBody = await request.text();
    let rawJson: unknown;
    try {
      rawJson = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON payload." },
        { status: 400 }
      );
    }

    const parsed = postmarkInboundPayloadSchema.safeParse(rawJson);
    if (!parsed.success) {
      console.error("Postmark payload validation failed:", parsed.error.issues);
      return NextResponse.json(
        { success: false, error: "Invalid payload structure." },
        { status: 400 }
      );
    }
    const payload = parsed.data;

    const adminClient = createAdminClient();

    // 4. Look up tenant by "To" address slug
    const toAddress = payload.ToFull?.[0]?.Email ?? payload.To;
    const slug = extractSlugFromEmail(toAddress);

    if (!slug) {
      console.error("Could not extract slug from To address:", toAddress);
      // Return 200 to Postmark so it doesn't retry
      return NextResponse.json({ success: true });
    }

    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("id, name, slug, status, contact_email, allowed_email_domains")
      .eq("slug", slug)
      .single();

    if (tenantError || !tenant) {
      console.error("No tenant found for slug:", slug);
      // Return 200 — unknown tenant, nothing we can do
      return NextResponse.json({ success: true });
    }

    if (tenant.status === "inactive") {
      console.warn("Email received for inactive tenant:", tenant.id);
      return NextResponse.json({ success: true });
    }

    // 5. Check for duplicate (same Message-ID already processed)
    const messageId = payload.MessageID || null;
    if (messageId) {
      const { data: existingOrder } = await adminClient
        .from("orders")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("message_id", messageId)
        .limit(1)
        .maybeSingle();

      if (existingOrder) {
        console.info("Duplicate email detected (Message-ID already processed):", messageId);
        // Return 200 — don't process again, don't retry
        return NextResponse.json({ success: true });
      }

      // Also check quarantine for duplicates
      const { data: existingQuarantine } = await adminClient
        .from("email_quarantine")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("message_id", messageId)
        .limit(1)
        .maybeSingle();

      if (existingQuarantine) {
        console.info("Duplicate email detected in quarantine:", messageId);
        return NextResponse.json({ success: true });
      }
    }

    // 6. Check sender authorization — OPH-17: domain-based check (unified for all tenants)
    const senderEmail = payload.FromFull?.Email ?? payload.From;
    const senderName = payload.FromFull?.Name ?? payload.FromName ?? "";
    const isTrial = tenant.status === "trial";

    // Resolve the effective allowed domains list
    const configuredDomains = (tenant.allowed_email_domains as string[]) ?? [];
    let effectiveDomains: string[];
    if (configuredDomains.length > 0) {
      effectiveDomains = configuredDomains.map((d) => d.toLowerCase());
    } else {
      // Fallback: derive domain from contact_email
      const contactEmail = (tenant.contact_email as string | null) ?? "";
      const fallbackDomain = contactEmail.split("@")[1]?.toLowerCase();
      effectiveDomains = fallbackDomain ? [fallbackDomain] : [];
    }

    // Extract sender domain and check against allowed list
    const senderDomain = senderEmail.split("@")[1]?.toLowerCase() ?? "";
    const isAuthorized = effectiveDomains.length > 0 && effectiveDomains.includes(senderDomain);

    // For non-trial tenants, try to resolve the sender to a user ID for uploaded_by
    let uploadedBy: string | null = null;
    if (isAuthorized && !isTrial) {
      const { data: profiles } = await adminClient
        .from("user_profiles")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("status", "active");

      if (profiles && profiles.length > 0) {
        for (const profile of profiles) {
          const { data: { user: authUser } } = await adminClient.auth.admin.getUserById(profile.id);
          if (authUser?.email?.toLowerCase() === senderEmail.toLowerCase()) {
            uploadedBy = authUser.id;
            break;
          }
        }
      }
    }

    // 7. If not authorized → quarantine
    if (!isAuthorized) {
      // Archive the raw email to storage
      let storagePath: string | null = null;
      try {
        const emlBuffer = Buffer.from(rawBody, "utf-8");
        const sanitizedSubject = (payload.Subject || "no-subject")
          .replace(/[^a-z0-9-]/gi, "_")
          .slice(0, 50);
        storagePath = `${tenant.id}/quarantine/${Date.now()}_${sanitizedSubject}.json`;
        await adminClient.storage
          .from("order-files")
          .upload(storagePath, emlBuffer, {
            contentType: "application/json",
          });
      } catch (err) {
        console.error("Failed to archive quarantined email:", err);
      }

      // Insert into quarantine table
      const { error: quarantineError } = await adminClient
        .from("email_quarantine")
        .insert({
          tenant_id: tenant.id,
          sender_email: senderEmail,
          sender_name: senderName || null,
          subject: payload.Subject || null,
          message_id: messageId,
          storage_path: storagePath,
          review_status: "pending",
        });

      if (quarantineError) {
        console.error("Failed to insert quarantine record:", quarantineError.message);
      }

      // Notify tenant admins about the quarantined email (not applicable for trial tenants — no users)
      const serverApiToken = process.env.POSTMARK_SERVER_API_TOKEN;
      if (serverApiToken && !isTrial) {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

        after(async () => {
          try {
            // Collect emails of tenant_admin users
            const adminEmails: string[] = [];
            const { data: adminProfiles } = await adminClient
              .from("user_profiles")
              .select("id")
              .eq("tenant_id", tenant.id)
              .eq("status", "active")
              .eq("role", "tenant_admin");

            for (const profile of adminProfiles ?? []) {
              const { data: { user: adminUser } } = await adminClient.auth.admin.getUserById(profile.id);
              if (adminUser?.email) {
                adminEmails.push(adminUser.email);
              }
            }

            await sendQuarantineNotification({
              serverApiToken,
              adminEmails,
              senderEmail,
              subject: payload.Subject || "",
              tenantName: tenant.name,
              siteUrl,
            });
          } catch (err) {
            console.error("Failed to send quarantine notification:", err);
          }
        });
      }

      // Return 200 — processed (quarantined), don't retry
      return NextResponse.json({ success: true });
    }

    // 8. Filter attachments (supported types & size)
    const { supported: supportedAttachments, warnings } = filterAttachments(
      payload.Attachments ?? []
    );

    if (warnings.length > 0) {
      console.info("Attachment warnings for email from", senderEmail, ":", warnings);
    }

    // 9. Create order record (include ingestion warnings if any)
    // OPH-16: For trial tenants, generate a preview token and don't set uploaded_by
    // (trial tenants have no real user IDs)
    const trialOrderFields: Record<string, unknown> = {};
    let previewToken: string | null = null;
    if (isTrial) {
      previewToken = crypto.randomBytes(32).toString("hex");
      const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      trialOrderFields.preview_token = previewToken;
      trialOrderFields.preview_token_expires_at = tokenExpiresAt.toISOString();
    }

    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .insert({
        tenant_id: tenant.id,
        ...(uploadedBy ? { uploaded_by: uploadedBy } : {}),
        status: "uploaded",
        source: "email_inbound",
        message_id: messageId,
        sender_email: senderEmail,
        ...(warnings.length > 0 ? { ingestion_notes: warnings } : {}),
        ...trialOrderFields,
      })
      .select("id")
      .single();

    if (orderError || !order) {
      console.error("Failed to create order:", orderError?.message);
      return NextResponse.json(
        { success: false, error: "Failed to create order." },
        { status: 500 }
      );
    }

    const orderId = order.id;

    // 10. Upload attachments to Supabase Storage + create order_files records
    let primaryFilename: string | null = null;
    let primaryStoragePath: string | null = null;

    for (const attachment of supportedAttachments) {
      const buffer = Buffer.from(attachment.Content, "base64");
      const sanitizedName = attachment.Name.replace(/[^a-z0-9._-]/gi, "_");
      const storagePath = `${tenant.id}/${orderId}/${sanitizedName}`;

      // Calculate SHA-256 hash for dedup
      const sha256Hash = crypto.createHash("sha256").update(buffer).digest("hex");

      // Upload to storage
      const { error: uploadError } = await adminClient.storage
        .from("order-files")
        .upload(storagePath, buffer, {
          contentType: attachment.ContentType,
        });

      if (uploadError) {
        console.error(`Failed to upload attachment ${attachment.Name}:`, uploadError.message);
        continue;
      }

      // Create order_files record
      const { error: fileRecordError } = await adminClient.from("order_files").insert({
        order_id: orderId,
        tenant_id: tenant.id,
        original_filename: attachment.Name,
        storage_path: storagePath,
        file_size_bytes: buffer.length > 0 ? buffer.length : 1,
        mime_type: attachment.ContentType,
        sha256_hash: sha256Hash,
      });

      if (fileRecordError) {
        console.error(`Failed to insert order_files record for ${attachment.Name}:`, fileRecordError.message);
      }

      if (!primaryFilename) {
        primaryFilename = attachment.Name;
        primaryStoragePath = storagePath;
      }
    }

    // 11. If no supported attachments but there's a text body, save it as a text file
    if (supportedAttachments.length === 0 && (payload.TextBody || payload.HtmlBody)) {
      const textContent = payload.TextBody || payload.HtmlBody;
      const buffer = Buffer.from(textContent, "utf-8");
      const storagePath = `${tenant.id}/${orderId}/email_body.txt`;

      const sha256Hash = crypto.createHash("sha256").update(buffer).digest("hex");

      const { error: uploadError } = await adminClient.storage
        .from("order-files")
        .upload(storagePath, buffer, {
          contentType: "text/plain",
        });

      if (!uploadError) {
        await adminClient.from("order_files").insert({
          order_id: orderId,
          tenant_id: tenant.id,
          original_filename: "email_body.txt",
          storage_path: storagePath,
          file_size_bytes: buffer.length > 0 ? buffer.length : 1,
          mime_type: "text/plain",
          sha256_hash: sha256Hash,
        });

        primaryFilename = "email_body.txt";
        primaryStoragePath = storagePath;
      }
    }

    // 12. Archive the original Postmark JSON payload for reference
    try {
      const archivePath = `${tenant.id}/${orderId}/original_email.json`;
      await adminClient.storage
        .from("order-files")
        .upload(archivePath, Buffer.from(rawBody, "utf-8"), {
          contentType: "application/json",
        });
    } catch (err) {
      console.error("Failed to archive original email:", err);
    }

    // 13. Run dealer recognition on the primary file
    if (primaryStoragePath && primaryFilename) {
      await recognizeDealer(adminClient, orderId, primaryStoragePath, primaryFilename);
    }

    // 14. Trigger AI extraction (same pattern as web upload)
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : request.nextUrl.origin);

      after(async () => {
        try {
          const res = await fetch(`${baseUrl}/api/orders/${orderId}/extract`, {
            method: "POST",
            headers: {
              "x-internal-secret": cronSecret,
              "Content-Type": "application/json",
            },
          });
          if (!res.ok) {
            console.error(
              `Background extraction trigger got ${res.status} for email order ${orderId}`
            );
          }
        } catch (err) {
          console.error(
            `Background extraction trigger failed for email order ${orderId}:`,
            err
          );
        }
      });
    }

    // 15. Send confirmation email to sender
    {
      const serverApiToken = process.env.POSTMARK_SERVER_API_TOKEN;
      if (serverApiToken) {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

        after(async () => {
          try {
            await sendConfirmationEmail({
              serverApiToken,
              toEmail: senderEmail,
              toName: senderName,
              orderId,
              subject: payload.Subject || "Bestellung",
              siteUrl,
            });
          } catch (err) {
            console.error("Failed to send confirmation email:", err);
          }
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error in inbound email webhook:", error);
    // Return 200 to prevent Postmark from retrying on internal errors
    // (the email payload has been received, we just failed processing)
    return NextResponse.json({ success: true });
  }
}
