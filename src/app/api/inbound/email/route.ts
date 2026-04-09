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
  sendForwardedEmail,
  sendQuarantineNotification,
  sendPlatformErrorNotification,
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

    // 4. Look up tenant by envelope recipient or "To" address slug
    // Prefer OriginalRecipient (SMTP envelope) — more reliable when emails
    // are forwarded by Exchange/M365, which preserves the original To header.
    const inboundDomain = process.env.INBOUND_EMAIL_DOMAIN;
    const originalRecipient = payload.OriginalRecipient;
    let toAddress = payload.ToFull?.[0]?.Email ?? payload.To;

    // If OriginalRecipient is on our inbound domain, prefer it over the To header
    if (originalRecipient && inboundDomain && originalRecipient.endsWith(`@${inboundDomain}`)) {
      toAddress = originalRecipient;
    }

    const slug = extractSlugFromEmail(toAddress);

    if (!slug) {
      console.error("Could not extract slug from To address:", toAddress);
      // Return 200 to Postmark so it doesn't retry
      return NextResponse.json({ success: true });
    }

    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("id, name, slug, status, contact_email, allowed_email_domains, email_confirmation_enabled, email_forwarding_enabled, email_forwarding_address")
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
      // Archive the raw email to storage — MUST succeed for reprocessing to work
      const emlBuffer = Buffer.from(rawBody, "utf-8");
      const sanitizedSubject = (payload.Subject || "no-subject")
        .replace(/[^a-z0-9-]/gi, "_")
        .slice(0, 50);
      const targetPath = `${tenant.id}/quarantine/${Date.now()}_${sanitizedSubject}.json`;
      const { error: archiveError } = await adminClient.storage
        .from("order-files")
        .upload(targetPath, emlBuffer, {
          contentType: "text/plain",
        });

      if (archiveError) {
        // Fail loudly so Postmark retries the webhook
        console.error("Failed to archive quarantined email — returning 500 for retry:", archiveError.message);
        return NextResponse.json(
          { success: false, error: "E-Mail-Archivierung fehlgeschlagen." },
          { status: 500 }
        );
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
          storage_path: targetPath,
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
    // Generate a preview token for every email-ingested order so the
    // confirmation email can link to the public preview page.
    // Trial tenants additionally skip uploaded_by (no real user IDs).
    const previewToken = crypto.randomBytes(32).toString("hex");
    const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const trialOrderFields: Record<string, unknown> = {};
    if (isTrial) {
      // Keep trialOrderFields for any trial-specific fields in the future
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
        subject: payload.Subject ? payload.Subject.slice(0, 500) : null,
        preview_token: previewToken,
        preview_token_expires_at: tokenExpiresAt.toISOString(),
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

    // 11. OPH-21: Always save email body text as email_body.txt (alongside attachments or alone)
    //     Previously this only saved when no attachments were present. Now we always
    //     save so that Claude can use both attachment content + supplemental body text.
    let emailBodyText: string | null = null;
    {
      // Prefer TextBody; fall back to HtmlBody stripped of tags
      let rawBodyText = payload.TextBody || "";
      if (!rawBodyText.trim() && payload.HtmlBody) {
        // Strip HTML tags to extract plain text
        rawBodyText = payload.HtmlBody
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/p>/gi, "\n\n")
          .replace(/<\/div>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
      }

      const trimmedBody = rawBodyText.trim();

      // Only save if body text is substantial (>50 chars after trimming)
      if (trimmedBody.length > 50) {
        // Truncate to 20,000 characters max to avoid excessive storage/API costs
        let bodyToSave = trimmedBody;
        if (bodyToSave.length > 20000) {
          bodyToSave = bodyToSave.slice(0, 20000);
          // Log truncation warning in ingestion_notes
          warnings.push(`Email body truncated from ${trimmedBody.length} to 20,000 characters.`);
        }

        emailBodyText = bodyToSave;
        const buffer = Buffer.from(bodyToSave, "utf-8");
        const storagePath = `${tenant.id}/${orderId}/email_body.txt`;
        const sha256Hash = crypto.createHash("sha256").update(buffer).digest("hex");

        // Use upsert to handle re-ingestion edge case (overwrite existing file)
        const { error: uploadError } = await adminClient.storage
          .from("order-files")
          .upload(storagePath, buffer, {
            contentType: "text/plain",
            upsert: true,
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

          // Only set as primary file if no attachments were uploaded
          if (!primaryFilename) {
            primaryFilename = "email_body.txt";
            primaryStoragePath = storagePath;
          }
        }
      }
    }

    // Update ingestion_notes if warnings were added during body processing
    if (warnings.length > 0) {
      await adminClient
        .from("orders")
        .update({ ingestion_notes: warnings })
        .eq("id", orderId);
    }

    // 12. Archive the original Postmark JSON payload for reference
    try {
      const archivePath = `${tenant.id}/${orderId}/original_email.json`;
      await adminClient.storage
        .from("order-files")
        .upload(archivePath, Buffer.from(rawBody, "utf-8"), {
          contentType: "text/plain",
        });
    } catch (err) {
      console.error("Failed to archive original email:", err);
    }

    // 13. Run dealer recognition on the primary file
    let recognitionResult: { dealerId: string | null } = { dealerId: null };
    if (primaryStoragePath && primaryFilename) {
      recognitionResult = await recognizeDealer(adminClient, orderId, primaryStoragePath, primaryFilename);
    }

    // 13b. OPH-21: Dealer body-text fallback — if no dealer was matched by email/file
    //      metadata, scan the email body text for known dealer names.
    if (!recognitionResult.dealerId && emailBodyText) {
      const { data: allDealers } = await adminClient
        .from("dealers")
        .select("id, name")
        .eq("active", true);

      if (allDealers && allDealers.length > 0) {
        const bodyLower = emailBodyText.toLowerCase();
        let bestMatch: { id: string; name: string } | null = null;
        let bestMatchLength = 0;

        for (const dealer of allDealers) {
          const dealerNameLower = (dealer.name as string).toLowerCase();
          if (dealerNameLower.length >= 2 && bodyLower.includes(dealerNameLower)) {
            // Use the most specific (longest) match to resolve ambiguity
            if (dealerNameLower.length > bestMatchLength) {
              bestMatch = { id: dealer.id as string, name: dealer.name as string };
              bestMatchLength = dealerNameLower.length;
            }
          }
        }

        if (bestMatch) {
          const { error: dealerUpdateError } = await adminClient
            .from("orders")
            .update({
              dealer_id: bestMatch.id,
              recognition_method: "body_text_match",
              recognition_confidence: 60,
            })
            .eq("id", orderId);

          if (!dealerUpdateError) {
            console.log(
              `OPH-21: Dealer "${bestMatch.name}" matched from email body text for order ${orderId}`
            );
          }
        }
      }
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
    // OPH-35: Gate behind email_confirmation_enabled (trial tenants always get emails)
    {
      const serverApiToken = process.env.POSTMARK_SERVER_API_TOKEN;
      const shouldSendEmail = isTrial || tenant.email_confirmation_enabled;
      if (serverApiToken && shouldSendEmail) {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

        after(async () => {
          try {
            await sendConfirmationEmail({
              serverApiToken,
              toEmail: senderEmail,
              toName: senderName,
              previewToken,
              subject: payload.Subject || "Bestellung",
              siteUrl,
            });
          } catch (err) {
            console.error("Failed to send confirmation email:", err);
          }
        });
      }
    }

    // 16. OPH-63: Forward the original email to the tenant's configured forwarding address
    // Only for non-trial, active tenants with forwarding enabled and a valid address.
    {
      const serverApiToken = process.env.POSTMARK_SERVER_API_TOKEN;
      const shouldForward =
        !isTrial &&
        tenant.email_forwarding_enabled &&
        typeof tenant.email_forwarding_address === "string" &&
        tenant.email_forwarding_address.trim().length > 0;

      if (serverApiToken && shouldForward) {
        // Capture the values we need inside the after() callback
        const forwardingAddress = tenant.email_forwarding_address as string;
        const originalSubject = payload.Subject || "";
        const originalBodyText = payload.TextBody || "";
        const receivedAt = payload.Date || new Date().toISOString();
        const originalAttachments = supportedAttachments;
        const tenantName = tenant.name;
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

        after(async () => {
          try {
            await sendForwardedEmail({
              serverApiToken,
              toEmail: forwardingAddress,
              originalSenderEmail: senderEmail,
              originalSenderName: senderName,
              originalSubject,
              originalBodyText,
              receivedAt,
              tenantName,
              siteUrl,
              attachments: originalAttachments,
            });
          } catch (err) {
            console.error("OPH-63: Failed to forward email:", err);
          }
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error in inbound email webhook:", error);

    // --- OPH-24: Send platform admin error notification (non-blocking) ---
    const platformApiToken = process.env.POSTMARK_SERVER_API_TOKEN;
    if (platformApiToken) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
      const errorMsg = error instanceof Error ? error.message : "Unbekannter Fehler bei E-Mail-Verarbeitung.";

      after(async () => {
        try {
          const adminClientForNotification = createAdminClient();
          await sendPlatformErrorNotification({
            serverApiToken: platformApiToken,
            adminClient: adminClientForNotification,
            errorType: "E-Mail-Ingestion fehlgeschlagen",
            tenantName: null,
            tenantSlug: null,
            orderId: null,
            errorMessage: errorMsg,
            siteUrl,
          });
        } catch (notifyErr) {
          console.error("Failed to send platform error notification:", notifyErr);
        }
      });
    }

    // Return 200 to prevent Postmark from retrying on internal errors
    // (the email payload has been received, we just failed processing)
    return NextResponse.json({ success: true });
  }
}
