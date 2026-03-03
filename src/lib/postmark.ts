/**
 * OPH-10: Postmark integration utilities.
 *
 * Handles webhook token verification and confirmation email sending.
 *
 * Note: Postmark inbound webhooks do NOT support HMAC signatures.
 * We secure the endpoint via a secret token in the webhook URL query string.
 * The webhook URL is configured in Postmark as:
 *   https://your-app.vercel.app/api/inbound/email?token=YOUR_SECRET
 */
import crypto from "crypto";
import { z } from "zod";

/**
 * Verifies the webhook request token against the configured secret.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function verifyWebhookToken(
  requestToken: string | null,
  expectedToken: string
): boolean {
  if (!requestToken || !expectedToken) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(requestToken, "utf-8"),
      Buffer.from(expectedToken, "utf-8")
    );
  } catch {
    return false;
  }
}

/**
 * Zod schema for runtime validation of Postmark inbound payloads.
 * Uses .passthrough() to allow extra fields Postmark may add in the future.
 */
export const postmarkInboundPayloadSchema = z.object({
  From: z.string().default(""),
  FromName: z.string().default(""),
  FromFull: z.object({
    Email: z.string(),
    Name: z.string().default(""),
  }).optional(),
  To: z.string().default(""),
  ToFull: z.array(z.object({
    Email: z.string(),
    Name: z.string().default(""),
  })).default([]),
  Cc: z.string().default(""),
  Subject: z.string().default(""),
  MessageID: z.string().default(""),
  Date: z.string().default(""),
  TextBody: z.string().default(""),
  HtmlBody: z.string().default(""),
  Headers: z.array(z.object({
    Name: z.string(),
    Value: z.string(),
  })).default([]),
  Attachments: z.array(z.object({
    Name: z.string(),
    Content: z.string(),
    ContentType: z.string(),
    ContentLength: z.number(),
  })).default([]),
}).passthrough();

export type PostmarkInboundPayload = z.infer<typeof postmarkInboundPayloadSchema>;

/**
 * Extracts the slug portion from an inbound email address.
 * E.g., "acme@inbound.example.com" → "acme"
 */
export function extractSlugFromEmail(toAddress: string): string | null {
  const match = toAddress.match(/^([^@]+)@/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Supported attachment MIME types for order processing.
 */
const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "message/rfc822",
  "application/octet-stream",
  "text/plain",
]);

/** Maximum attachment size in bytes (25 MB). */
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;

/**
 * Filters Postmark attachments to only supported types and sizes.
 * Returns the supported attachments and any warnings for skipped ones.
 */
export function filterAttachments(
  attachments: PostmarkInboundPayload["Attachments"]
): {
  supported: PostmarkInboundPayload["Attachments"];
  warnings: string[];
} {
  const supported: PostmarkInboundPayload["Attachments"] = [];
  const warnings: string[] = [];

  for (const att of attachments) {
    if (att.ContentLength > MAX_ATTACHMENT_SIZE) {
      warnings.push(
        `Anhang "${att.Name}" uebersprungen: zu gross (${Math.round(att.ContentLength / 1024 / 1024)} MB, max 25 MB).`
      );
      continue;
    }

    if (!SUPPORTED_MIME_TYPES.has(att.ContentType)) {
      warnings.push(
        `Anhang "${att.Name}" uebersprungen: nicht unterstuetztes Format (${att.ContentType}).`
      );
      continue;
    }

    supported.push(att);
  }

  return { supported, warnings };
}

/**
 * Sends a quarantine notification email to tenant admins via Postmark.
 */
export async function sendQuarantineNotification(params: {
  serverApiToken: string;
  adminEmails: string[];
  senderEmail: string;
  subject: string;
  tenantName: string;
  siteUrl: string;
}): Promise<void> {
  const { serverApiToken, adminEmails, senderEmail, subject, tenantName, siteUrl } = params;

  if (adminEmails.length === 0) return;

  const quarantineUrl = `${siteUrl}/admin/email-quarantine`;
  const textBody = [
    `Eine E-Mail wurde in die Quarantaene verschoben.`,
    "",
    `Absender: ${senderEmail}`,
    `Betreff: ${subject || "(kein Betreff)"}`,
    `Mandant: ${tenantName}`,
    "",
    `Bitte pruefen Sie die E-Mail in der Quarantaene:`,
    quarantineUrl,
    "",
    "Mit freundlichen Gruessen,",
    "Ihr Order Intelligence Team",
  ].join("\n");

  const fromDomain = siteUrl.replace(/^https?:\/\//, "").split("/")[0];
  // Skip sending if domain is localhost (not a valid sender)
  if (fromDomain.startsWith("localhost")) return;

  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": serverApiToken,
    },
    body: JSON.stringify({
      From: `noreply@${fromDomain}`,
      To: adminEmails.join(","),
      Subject: `Quarantaene: E-Mail von ${senderEmail}`,
      TextBody: textBody,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to send quarantine notification via Postmark:", errorText);
  }
}

/**
 * Sends a confirmation email to the sender via Postmark.
 */
export async function sendConfirmationEmail(params: {
  serverApiToken: string;
  toEmail: string;
  toName: string;
  orderId: string;
  subject: string;
  siteUrl: string;
}): Promise<void> {
  const { serverApiToken, toEmail, toName, orderId, subject, siteUrl } = params;

  const orderUrl = `${siteUrl}/orders/${orderId}`;
  const textBody = [
    `Hallo ${toName || toEmail},`,
    "",
    `Ihre weitergeleitete E-Mail "${subject}" wurde empfangen und wird verarbeitet.`,
    "",
    `Sie koennen den Status Ihrer Bestellung hier verfolgen:`,
    orderUrl,
    "",
    "Mit freundlichen Gruessen,",
    "Ihr Order Intelligence Team",
  ].join("\n");

  const fromDomain = siteUrl.replace(/^https?:\/\//, "").split("/")[0];
  // Skip sending if domain is localhost (not a valid Postmark sender)
  if (fromDomain.startsWith("localhost")) return;

  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": serverApiToken,
    },
    body: JSON.stringify({
      From: `noreply@${fromDomain}`,
      To: toEmail,
      Subject: `Bestellung empfangen: ${subject}`,
      TextBody: textBody,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to send confirmation email via Postmark:", errorText);
  }
}
