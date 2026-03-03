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
 * Resolves the From address for outbound emails.
 * Uses POSTMARK_SENDER_EMAIL env var if set (e.g. "noreply@ids.online"),
 * otherwise derives from siteUrl. Returns null if sending should be skipped.
 */
function resolveSenderAddress(siteUrl: string): string | null {
  const envSender = process.env.POSTMARK_SENDER_EMAIL;
  if (envSender) return envSender;

  const fromDomain = siteUrl.replace(/^https?:\/\//, "").split("/")[0];
  if (fromDomain.startsWith("localhost")) return null;
  return `noreply@${fromDomain}`;
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

  const fromAddress = resolveSenderAddress(siteUrl);
  if (!fromAddress) return;

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

  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": serverApiToken,
    },
    body: JSON.stringify({
      From: fromAddress,
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
 * OPH-16: Sends the trial result email after extraction (text summary + CSV attachment + magic link).
 */
export async function sendTrialResultEmail(params: {
  serverApiToken: string;
  toEmail: string;
  toName: string;
  subject: string;
  siteUrl: string;
  previewToken: string;
  orderSummary: {
    orderNumber: string | null;
    orderDate: string | null;
    dealerName: string | null;
    itemCount: number;
    totalAmount: number | null;
    currency: string | null;
  };
  lineItems: Array<{
    position?: number | string | null;
    article_number?: string | null;
    description?: string | null;
    quantity?: number | string | null;
    unit?: string | null;
    unit_price?: number | string | null;
    total_price?: number | string | null;
  }>;
  csvContent: string;
}): Promise<void> {
  const { serverApiToken, toEmail, toName, subject, siteUrl, previewToken, orderSummary, lineItems, csvContent } = params;

  const fromAddress = resolveSenderAddress(siteUrl);
  if (!fromAddress) return;

  const previewUrl = `${siteUrl}/orders/preview/${previewToken}`;
  const currency = orderSummary.currency ?? "EUR";
  const total = orderSummary.totalAmount != null
    ? `${orderSummary.totalAmount.toFixed(2)} ${currency}`
    : "–";

  // Escape HTML special characters
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // Build HTML line items table
  let itemsHtml = "";
  if (lineItems.length > 0) {
    const rows = lineItems.map((item) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center">${esc(String(item.position ?? ""))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${esc(String(item.article_number ?? "–"))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${esc(String(item.description ?? "–"))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${esc(String(item.quantity ?? ""))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center">${esc(String(item.unit ?? ""))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${item.unit_price != null ? esc(String(item.unit_price)) : ""}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:500">${item.total_price != null ? esc(String(item.total_price)) : ""}</td>
      </tr>`).join("");

    itemsHtml = `
    <h3 style="margin:24px 0 12px;font-size:15px;color:#111827">Extrahierte Positionen</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e5e7eb;border-radius:6px">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">Pos</th>
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">Artikelnr.</th>
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">Bezeichnung</th>
          <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">Menge</th>
          <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">Einheit</th>
          <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">Einzelpreis</th>
          <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">Gesamt</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:#f9fafb">
          <td colspan="6" style="padding:8px 10px;text-align:right;font-weight:600;border-top:2px solid #e5e7eb">Gesamtbetrag:</td>
          <td style="padding:8px 10px;text-align:right;font-weight:700;border-top:2px solid #e5e7eb;color:#111827">${esc(total)}</td>
        </tr>
      </tfoot>
    </table>`;
  }

  const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#374151;background:#f9fafb">
<div style="max-width:680px;margin:0 auto;padding:32px 20px">
  <div style="background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;padding:32px;margin-bottom:20px">
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Extrahierte Bestellung</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px">Ihre weitergeleitete E-Mail &ldquo;${esc(subject)}&rdquo; wurde verarbeitet.</p>

    <table style="font-size:14px;margin-bottom:20px">
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Bestellnummer:</td><td style="padding:4px 0;font-weight:500">${esc(orderSummary.orderNumber ?? "–")}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Bestelldatum:</td><td style="padding:4px 0;font-weight:500">${esc(orderSummary.orderDate ?? "–")}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Haendler:</td><td style="padding:4px 0;font-weight:500">${esc(orderSummary.dealerName ?? "–")}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Positionen:</td><td style="padding:4px 0;font-weight:500">${orderSummary.itemCount}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Gesamtbetrag:</td><td style="padding:4px 0;font-weight:700;color:#111827">${esc(total)}</td></tr>
    </table>

    ${itemsHtml}

    <p style="margin:24px 0 12px;font-size:14px;color:#374151">Die vollstaendigen Daten finden Sie als CSV-Datei im Anhang.</p>

    <a href="${esc(previewUrl)}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500">Bestellung online ansehen</a>
  </div>

  <div style="text-align:center;padding:16px 0;font-size:12px;color:#9ca3af">
    <p style="margin:0 0 4px">Interesse an der Vollversion? <a href="https://www.ids.online" style="color:#2563eb;text-decoration:none">Kontaktieren Sie uns</a></p>
    <p style="margin:0">Order Intelligence Platform &mdash; <a href="https://www.ids.online" style="color:#9ca3af;text-decoration:none">ids.online</a></p>
  </div>
</div>
</body></html>`;

  // Plain text fallback
  const textBody = [
    `Hallo ${toName || toEmail},`,
    "",
    `Ihre weitergeleitete E-Mail "${subject}" wurde verarbeitet.`,
    "",
    `  Bestellnummer: ${orderSummary.orderNumber ?? "–"}`,
    `  Bestelldatum:  ${orderSummary.orderDate ?? "–"}`,
    `  Haendler:      ${orderSummary.dealerName ?? "–"}`,
    `  Positionen:    ${orderSummary.itemCount}`,
    `  Gesamtbetrag:  ${total}`,
    "",
    `Die vollstaendigen Daten finden Sie als CSV-Datei im Anhang.`,
    "",
    `Bestellung online ansehen: ${previewUrl}`,
    "",
    "Mit freundlichen Gruessen,",
    "Ihr Order Intelligence Team",
  ].join("\n");

  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": serverApiToken,
    },
    body: JSON.stringify({
      From: fromAddress,
      To: toEmail,
      Subject: `Extrahierte Bestellung: ${subject}`,
      HtmlBody: htmlBody,
      TextBody: textBody,
      Attachments: [
        {
          Name: `bestellung_${orderSummary.orderNumber ?? "export"}.csv`,
          Content: Buffer.from(csvContent, "utf-8").toString("base64"),
          ContentType: "text/csv",
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to send trial result email via Postmark:", errorText);
  }
}

/**
 * OPH-16: Sends a failure notification to trial sender when extraction fails.
 */
export async function sendTrialFailureEmail(params: {
  serverApiToken: string;
  toEmail: string;
  toName: string;
  subject: string;
  siteUrl: string;
}): Promise<void> {
  const { serverApiToken, toEmail, toName, subject, siteUrl } = params;

  const fromAddress = resolveSenderAddress(siteUrl);
  if (!fromAddress) return;

  const textBody = [
    `Hallo ${toName || toEmail},`,
    "",
    `Leider konnten die Bestelldaten aus Ihrer E-Mail "${subject}" nicht automatisch erkannt werden.`,
    "",
    `Moegliche Gruende:`,
    `  - Das Dokument-Format wird nicht unterstuetzt`,
    `  - Die Bestelldaten sind nicht klar strukturiert`,
    `  - Das Dokument enthaelt keine erkennbare Bestellung`,
    "",
    `Bitte pruefen Sie das Dokument-Format und versuchen Sie es erneut.`,
    "",
    `Bei Fragen kontaktieren Sie uns gerne: https://www.ids.online`,
    "",
    "Mit freundlichen Gruessen,",
    "Ihr Order Intelligence Team",
  ].join("\n");

  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": serverApiToken,
    },
    body: JSON.stringify({
      From: fromAddress,
      To: toEmail,
      Subject: `Extraktion fehlgeschlagen: ${subject}`,
      TextBody: textBody,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to send trial failure email via Postmark:", errorText);
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

  const fromAddress = resolveSenderAddress(siteUrl);
  if (!fromAddress) return;

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

  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": serverApiToken,
    },
    body: JSON.stringify({
      From: fromAddress,
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
