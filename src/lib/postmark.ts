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

/** Max retry attempts for Postmark API calls. */
const POSTMARK_MAX_RETRIES = 3;
/** Base delay in ms for exponential backoff (doubles each retry). */
const POSTMARK_RETRY_BASE_MS = 2000;

/**
 * Sends a request to Postmark with retry + exponential backoff.
 * Retries on 5xx errors and network failures. Does NOT retry on 4xx (client errors).
 */
async function postmarkFetchWithRetry(
  serverApiToken: string,
  body: Record<string, unknown>,
  context: string
): Promise<void> {
  let lastError: string | null = null;

  for (let attempt = 0; attempt < POSTMARK_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": serverApiToken,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) return; // Success

      const errorText = await response.text();

      // Don't retry client errors (4xx) — they won't succeed on retry
      if (response.status >= 400 && response.status < 500) {
        console.error(`${context}: Postmark client error (${response.status}): ${errorText}`);
        return;
      }

      // Server error (5xx) — retry
      lastError = `${response.status}: ${errorText}`;
    } catch (err) {
      // Network error — retry
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < POSTMARK_MAX_RETRIES - 1) {
      const delay = POSTMARK_RETRY_BASE_MS * Math.pow(2, attempt);
      console.warn(`${context}: Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  console.error(`${context}: All ${POSTMARK_MAX_RETRIES} attempts failed. Last error: ${lastError}`);
}

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
  // SMTP envelope recipient — more reliable than To header for forwarded emails
  OriginalRecipient: z.string().default(""),
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
        `Anhang "${att.Name}" übersprungen: zu groß (${Math.round(att.ContentLength / 1024 / 1024)} MB, max 25 MB).`
      );
      continue;
    }

    if (!SUPPORTED_MIME_TYPES.has(att.ContentType)) {
      warnings.push(
        `Anhang "${att.Name}" übersprungen: nicht unterstütztes Format (${att.ContentType}).`
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

/** Escape HTML special characters. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Wraps email content in a branded HTML layout with logo and footer.
 */
function wrapHtmlEmail(siteUrl: string, bodyHtml: string): string {
  const logoUrl = `${siteUrl}/ids-logo-orange.png`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#374151;background:#f9fafb">
<div style="max-width:680px;margin:0 auto;padding:32px 20px">
  <div style="text-align:center;padding:0 0 24px">
    <a href="https://www.ids.online" style="text-decoration:none">
      <img src="${esc(logoUrl)}" alt="IDS.online" width="120" height="119" style="width:120px;height:auto" />
    </a>
  </div>
  <div style="background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;padding:32px;margin-bottom:20px">
    ${bodyHtml}
  </div>
  <div style="text-align:center;padding:16px 0;font-size:12px;color:#9ca3af">
    <p style="margin:0">Order-Process Hub (OPH) &mdash; <a href="https://www.ids.online" style="color:#9ca3af;text-decoration:none">ids.online</a></p>
  </div>
</div>
</body></html>`;
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
    `Eine E-Mail wurde in die Quarantäne verschoben.`,
    "",
    `Absender: ${senderEmail}`,
    `Betreff: ${subject || "(kein Betreff)"}`,
    `Mandant: ${tenantName}`,
    "",
    `Bitte prüfen Sie die E-Mail in der Quarantäne:`,
    quarantineUrl,
    "",
    "Mit freundlichen Grüßen,",
    "Ihr Order Intelligence Team",
  ].join("\n");

  const htmlBody = wrapHtmlEmail(siteUrl, `
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827">E-Mail in Quarantäne</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px">Eine E-Mail wurde in die Quarantäne verschoben.</p>
    <table style="font-size:14px;margin-bottom:20px">
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Absender:</td><td style="padding:4px 0;font-weight:500">${esc(senderEmail)}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Betreff:</td><td style="padding:4px 0;font-weight:500">${esc(subject || "(kein Betreff)")}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Mandant:</td><td style="padding:4px 0;font-weight:500">${esc(tenantName)}</td></tr>
    </table>
    <a href="${esc(quarantineUrl)}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500">Quarantäne prüfen</a>
  `);

  await postmarkFetchWithRetry(serverApiToken, {
    From: fromAddress,
    To: adminEmails.join(","),
    Subject: `Quarantäne: E-Mail von ${senderEmail}`,
    HtmlBody: htmlBody,
    TextBody: textBody,
  }, "Quarantine notification");
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
    dealer_article_number?: string | null;
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

  // Build HTML line items table
  let itemsHtml = "";
  if (lineItems.length > 0) {
    const trialHasDealerArticle = lineItems.some((item) => item.dealer_article_number);
    const rows = lineItems.map((item) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center">${esc(String(item.position ?? ""))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${esc(String(item.article_number ?? "–"))}</td>${trialHasDealerArticle ? `
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${esc(String(item.dealer_article_number ?? "–"))}</td>` : ""}
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${esc(String(item.description ?? "–"))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${esc(String(item.quantity ?? ""))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center">${esc(String(item.unit ?? ""))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${item.unit_price != null ? esc(String(item.unit_price)) : ""}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:500">${item.total_price != null ? esc(String(item.total_price)) : ""}</td>
      </tr>`).join("");

    const trialTotalColSpan = trialHasDealerArticle ? 7 : 6;

    itemsHtml = `
    <h3 style="margin:24px 0 12px;font-size:15px;color:#111827">Extrahierte Positionen</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e5e7eb;border-radius:6px">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">Pos</th>
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">Herst.-Art.-Nr.</th>${trialHasDealerArticle ? `
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">Händler-Art.-Nr.</th>` : ""}
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
          <td colspan="${trialTotalColSpan}" style="padding:8px 10px;text-align:right;font-weight:600;border-top:2px solid #e5e7eb">Gesamtbetrag:</td>
          <td style="padding:8px 10px;text-align:right;font-weight:700;border-top:2px solid #e5e7eb;color:#111827">${esc(total)}</td>
        </tr>
      </tfoot>
    </table>`;
  }

  const htmlBody = wrapHtmlEmail(siteUrl, `
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Extrahierte Bestellung</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px">Ihre weitergeleitete E-Mail &ldquo;${esc(subject)}&rdquo; wurde verarbeitet.</p>
    <table style="font-size:14px;margin-bottom:20px">
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Bestellnummer:</td><td style="padding:4px 0;font-weight:500">${esc(orderSummary.orderNumber ?? "–")}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Bestelldatum:</td><td style="padding:4px 0;font-weight:500">${esc(orderSummary.orderDate ?? "–")}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Händler:</td><td style="padding:4px 0;font-weight:500">${esc(orderSummary.dealerName ?? "–")}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Positionen:</td><td style="padding:4px 0;font-weight:500">${orderSummary.itemCount}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Gesamtbetrag:</td><td style="padding:4px 0;font-weight:700;color:#111827">${esc(total)}</td></tr>
    </table>
    ${itemsHtml}
    <p style="margin:24px 0 12px;font-size:14px;color:#374151">Die vollständigen Daten finden Sie als CSV-Datei im Anhang.</p>
    <a href="${esc(previewUrl)}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500">Bestellung online ansehen</a>
    <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">Interesse an der Vollversion? <a href="https://www.ids.online" style="color:#2563eb;text-decoration:none">Kontaktieren Sie uns</a></p>
  `);

  // Plain text fallback
  const textBody = [
    `Hallo ${toName || toEmail},`,
    "",
    `Ihre weitergeleitete E-Mail "${subject}" wurde verarbeitet.`,
    "",
    `  Bestellnummer: ${orderSummary.orderNumber ?? "–"}`,
    `  Bestelldatum:  ${orderSummary.orderDate ?? "–"}`,
    `  Händler:      ${orderSummary.dealerName ?? "–"}`,
    `  Positionen:    ${orderSummary.itemCount}`,
    `  Gesamtbetrag:  ${total}`,
    "",
    `Die vollständigen Daten finden Sie als CSV-Datei im Anhang.`,
    "",
    `Bestellung online ansehen: ${previewUrl}`,
    "",
    "Mit freundlichen Grüßen,",
    "Ihr Order Intelligence Team",
  ].join("\n");

  await postmarkFetchWithRetry(serverApiToken, {
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
  }, "Trial result email");
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
    `Mögliche Gründe:`,
    `  - Das Dokument-Format wird nicht unterstützt`,
    `  - Die Bestelldaten sind nicht klar strukturiert`,
    `  - Das Dokument enthält keine erkennbare Bestellung`,
    "",
    `Bitte prüfen Sie das Dokument-Format und versuchen Sie es erneut.`,
    "",
    `Bei Fragen kontaktieren Sie uns gerne: https://www.ids.online`,
    "",
    "Mit freundlichen Grüßen,",
    "Ihr Order Intelligence Team",
  ].join("\n");

  const htmlBody = wrapHtmlEmail(siteUrl, `
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Extraktion fehlgeschlagen</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px">Leider konnten die Bestelldaten aus Ihrer E-Mail &ldquo;${esc(subject)}&rdquo; nicht automatisch erkannt werden.</p>
    <p style="margin:0 0 8px;font-size:14px;font-weight:500;color:#374151">Mögliche Gründe:</p>
    <ul style="margin:0 0 20px;padding-left:20px;font-size:14px;color:#374151">
      <li style="margin-bottom:4px">Das Dokument-Format wird nicht unterstützt</li>
      <li style="margin-bottom:4px">Die Bestelldaten sind nicht klar strukturiert</li>
      <li>Das Dokument enthält keine erkennbare Bestellung</li>
    </ul>
    <p style="margin:0 0 20px;font-size:14px;color:#374151">Bitte prüfen Sie das Dokument-Format und versuchen Sie es erneut.</p>
    <p style="margin:0;font-size:13px;color:#6b7280">Bei Fragen kontaktieren Sie uns gerne: <a href="https://www.ids.online" style="color:#2563eb;text-decoration:none">ids.online</a></p>
  `);

  await postmarkFetchWithRetry(serverApiToken, {
    From: fromAddress,
    To: toEmail,
    Subject: `Extraktion fehlgeschlagen: ${subject}`,
    HtmlBody: htmlBody,
    TextBody: textBody,
  }, "Trial failure email");
}

/**
 * OPH-13: Sends a confirmation email to the submitter after web upload.
 * Uses a direct platform URL (not a preview token).
 */
export async function sendOrderConfirmationEmail(params: {
  serverApiToken: string;
  toEmail: string;
  toName: string;
  orderId: string;
  fileName: string;
  siteUrl: string;
}): Promise<void> {
  const { serverApiToken, toEmail, toName, orderId, fileName, siteUrl } = params;

  const fromAddress = resolveSenderAddress(siteUrl);
  if (!fromAddress) return;

  const orderUrl = `${siteUrl}/orders/${orderId}`;
  const shortId = orderId.slice(0, 8);
  const receivedAt = new Date().toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });

  const textBody = [
    `Hallo ${toName || toEmail},`,
    "",
    `Ihre Bestellung "${fileName}" wurde empfangen und wird verarbeitet.`,
    "",
    `  Bestell-ID: ${shortId}`,
    `  Dateiname:  ${fileName}`,
    `  Empfangen:  ${receivedAt}`,
    "",
    `Sie können den Status Ihrer Bestellung hier verfolgen:`,
    orderUrl,
    "",
    "Mit freundlichen Grüßen,",
    "Ihr Order Intelligence Team",
  ].join("\n");

  const htmlBody = wrapHtmlEmail(siteUrl, `
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Bestellung empfangen</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px">Ihre Bestellung &ldquo;${esc(fileName)}&rdquo; wurde empfangen und wird verarbeitet.</p>
    <table style="font-size:14px;margin-bottom:20px">
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Bestell-ID:</td><td style="padding:4px 0;font-weight:500">${esc(shortId)}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Dateiname:</td><td style="padding:4px 0;font-weight:500">${esc(fileName)}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Empfangen:</td><td style="padding:4px 0;font-weight:500">${esc(receivedAt)}</td></tr>
    </table>
    <a href="${esc(orderUrl)}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500">Bestellung ansehen</a>
  `);

  await postmarkFetchWithRetry(serverApiToken, {
    From: fromAddress,
    To: toEmail,
    Subject: `[Bestellung empfangen] – ${fileName}`,
    HtmlBody: htmlBody,
    TextBody: textBody,
  }, "Order confirmation email");
}

/**
 * OPH-13: Sends the extraction result email with order summary + CSV attachment.
 */
export async function sendOrderResultEmail(params: {
  serverApiToken: string;
  toEmail: string;
  toName: string;
  orderId: string;
  siteUrl: string;
  isReExtraction: boolean;
  emailSubject?: string | null;
  customerNumber?: string | null;
  confidenceScore?: number | null;
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
    dealer_article_number?: string | null;
    description?: string | null;
    quantity?: number | string | null;
    unit?: string | null;
    unit_price?: number | string | null;
    total_price?: number | string | null;
  }>;
  csvContent: string;
  attachmentFilename?: string;
}): Promise<void> {
  const { serverApiToken, toEmail, toName, orderId, siteUrl, isReExtraction, emailSubject, customerNumber, confidenceScore, orderSummary, lineItems, csvContent, attachmentFilename } = params;

  const fromAddress = resolveSenderAddress(siteUrl);
  if (!fromAddress) return;

  const orderUrl = `${siteUrl}/orders/${orderId}`;
  const currency = orderSummary.currency ?? "EUR";
  const total = orderSummary.totalAmount != null
    ? `${orderSummary.totalAmount.toFixed(2)} ${currency}`
    : "–";

  const subjectLabel = orderSummary.orderNumber ?? orderId.slice(0, 8);
  const updatedSuffix = isReExtraction ? " (aktualisiert)" : "";

  // Build extraction warnings
  const warnings: string[] = [];
  if (confidenceScore != null && confidenceScore < 0.7) {
    warnings.push(`Niedrige Extraktionssicherheit (${Math.round(confidenceScore * 100)}%) — bitte Daten sorgfältig prüfen.`);
  }
  if (!orderSummary.orderNumber) {
    warnings.push("Bestellnummer konnte nicht erkannt werden.");
  }
  if (!orderSummary.orderDate) {
    warnings.push("Bestelldatum konnte nicht erkannt werden.");
  }
  const itemsWithoutArticle = lineItems.filter((i) => !i.article_number).length;
  if (itemsWithoutArticle > 0) {
    warnings.push(`${itemsWithoutArticle} ${itemsWithoutArticle === 1 ? "Position ohne" : "Positionen ohne"} Artikelnummer.`);
  }
  const unknownUnits = lineItems.filter((i) => typeof i.unit === "string" && i.unit.includes("(unbekannt)")).length;
  if (unknownUnits > 0) {
    warnings.push(`${unknownUnits} ${unknownUnits === 1 ? "Position mit unbekannter" : "Positionen mit unbekannter"} Mengeneinheit.`);
  }

  // Build HTML line items table (max 20 in email body)
  const MAX_ITEMS_IN_EMAIL = 20;
  const displayItems = lineItems.slice(0, MAX_ITEMS_IN_EMAIL);
  const remainingCount = lineItems.length - displayItems.length;

  let itemsHtml = "";
  if (displayItems.length > 0) {
    const hasDealerArticle = displayItems.some((item) => item.dealer_article_number);
    const rows = displayItems.map((item) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center">${esc(String(item.position ?? ""))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${esc(String(item.article_number ?? "–"))}</td>${hasDealerArticle ? `
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${esc(String(item.dealer_article_number ?? "–"))}</td>` : ""}
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${esc(String(item.description ?? "–"))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${esc(String(item.quantity ?? ""))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center">${esc(String(item.unit ?? ""))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${item.unit_price != null ? esc(String(item.unit_price)) : ""}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:500">${item.total_price != null ? esc(String(item.total_price)) : ""}</td>
      </tr>`).join("");

    const totalColSpan = hasDealerArticle ? 7 : 6;
    const moreColSpan = hasDealerArticle ? 8 : 7;
    const moreRow = remainingCount > 0
      ? `<tr><td colspan="${moreColSpan}" style="padding:8px 10px;text-align:center;font-size:12px;color:#6b7280">… und ${remainingCount} weitere ${remainingCount === 1 ? "Position" : "Positionen"} (siehe CSV-Anhang)</td></tr>`
      : "";

    itemsHtml = `
    <h3 style="margin:24px 0 12px;font-size:15px;color:#111827">Extrahierte Positionen</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e5e7eb;border-radius:6px">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">Pos</th>
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">Herst.-Art.-Nr.</th>${hasDealerArticle ? `
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">Händler-Art.-Nr.</th>` : ""}
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">Bezeichnung</th>
          <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">Menge</th>
          <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">Einheit</th>
          <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">Einzelpreis</th>
          <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">Gesamt</th>
        </tr>
      </thead>
      <tbody>${rows}${moreRow}</tbody>
      <tfoot>
        <tr style="background:#f9fafb">
          <td colspan="${totalColSpan}" style="padding:8px 10px;text-align:right;font-weight:600;border-top:2px solid #e5e7eb">Gesamtbetrag:</td>
          <td style="padding:8px 10px;text-align:right;font-weight:700;border-top:2px solid #e5e7eb;color:#111827">${esc(total)}</td>
        </tr>
      </tfoot>
    </table>`;
  }

  // Build warnings HTML block
  let warningsHtml = "";
  if (warnings.length > 0) {
    const warningItems = warnings.map((w) => `<li style="margin-bottom:4px">${esc(w)}</li>`).join("");
    warningsHtml = `
    <div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:6px;padding:12px 16px;margin-bottom:20px">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#92400e">Hinweise zur Extraktion:</p>
      <ul style="margin:0;padding-left:20px;font-size:13px;color:#92400e">${warningItems}</ul>
    </div>`;
  }

  const htmlBody = wrapHtmlEmail(siteUrl, `
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Bestellung extrahiert${updatedSuffix}</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px">Die Bestelldaten wurden erfolgreich extrahiert.</p>
    ${warningsHtml}${emailSubject ? `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-bottom:16px">
      <p style="margin:0;font-size:12px;color:#6b7280;font-weight:600">Original E-Mail</p>
      <p style="margin:4px 0 0;font-size:13px;color:#374151">Betreff: ${esc(emailSubject)}</p>
    </div>` : ""}
    <table style="font-size:14px;margin-bottom:20px">
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Bestellnummer:</td><td style="padding:4px 0;font-weight:500">${esc(orderSummary.orderNumber ?? "–")}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Bestelldatum:</td><td style="padding:4px 0;font-weight:500">${esc(orderSummary.orderDate ?? "–")}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Händler:</td><td style="padding:4px 0;font-weight:500">${esc(orderSummary.dealerName ?? "–")}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Kundennummer:</td><td style="padding:4px 0;font-weight:500">${esc(customerNumber ?? "–")}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Positionen:</td><td style="padding:4px 0;font-weight:500">${orderSummary.itemCount}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Gesamtbetrag:</td><td style="padding:4px 0;font-weight:700;color:#111827">${esc(total)}</td></tr>${confidenceScore != null ? `
      <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Extraktionssicherheit:</td><td style="padding:4px 0;font-weight:500;color:${confidenceScore >= 0.8 ? "#16a34a" : confidenceScore >= 0.5 ? "#ca8a04" : "#dc2626"}">${Math.round(confidenceScore * 100)} %</td></tr>` : ""}
    </table>
    ${itemsHtml}
    <p style="margin:24px 0 12px;font-size:14px;color:#374151">Die vollständigen Daten finden Sie als Datei im Anhang.</p>
    <a href="${esc(orderUrl)}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500">Bestellung prüfen & freigeben</a>
  `);

  const warningsText = warnings.length > 0
    ? ["", "  Hinweise:", ...warnings.map((w) => `    - ${w}`), ""].join("\n")
    : "";

  const confidenceText = confidenceScore != null
    ? `  Extraktionssicherheit: ${Math.round(confidenceScore * 100)} %`
    : "";

  const textBody = [
    `Hallo ${toName || toEmail},`,
    "",
    `Die Bestelldaten wurden erfolgreich extrahiert${updatedSuffix}.`,
    ...(emailSubject ? ["", `  Original E-Mail`, `  Betreff: ${emailSubject}`] : []),
    "",
    `  Bestellnummer:  ${orderSummary.orderNumber ?? "–"}`,
    `  Bestelldatum:   ${orderSummary.orderDate ?? "–"}`,
    `  Händler:        ${orderSummary.dealerName ?? "–"}`,
    `  Kundennummer:   ${customerNumber ?? "–"}`,
    `  Positionen:     ${orderSummary.itemCount}`,
    `  Gesamtbetrag:   ${total}`,
    ...(confidenceText ? [confidenceText] : []),
    warningsText,
    `Die vollständigen Daten finden Sie als Datei im Anhang.`,
    "",
    `Bestellung prüfen & freigeben: ${orderUrl}`,
    "",
    "Mit freundlichen Grüßen,",
    "Ihr Order Intelligence Team",
  ].join("\n");

  const csvDate = new Date().toISOString().slice(0, 10);
  const defaultName = `bestellung_${orderId.slice(0, 8)}_${csvDate}.csv`;
  const finalName = attachmentFilename ?? defaultName;
  const contentType = finalName.endsWith(".xml")
    ? "application/xml"
    : finalName.endsWith(".json")
      ? "application/json"
      : "text/csv";

  await postmarkFetchWithRetry(serverApiToken, {
    From: fromAddress,
    To: toEmail,
    Subject: `[Bestellung extrahiert] – ${subjectLabel}${updatedSuffix}`,
    HtmlBody: htmlBody,
    TextBody: textBody,
    Attachments: [
      {
        Name: finalName,
        Content: Buffer.from(csvContent, "utf-8").toString("base64"),
        ContentType: contentType,
      },
    ],
  }, "Order result email");
}

/**
 * OPH-13: Sends a failure notification when extraction fails for non-trial tenants.
 */
export async function sendOrderFailureEmail(params: {
  serverApiToken: string;
  toEmail: string;
  toName: string;
  orderId: string;
  siteUrl: string;
}): Promise<void> {
  const { serverApiToken, toEmail, toName, orderId, siteUrl } = params;

  const fromAddress = resolveSenderAddress(siteUrl);
  if (!fromAddress) return;

  const orderUrl = `${siteUrl}/orders/${orderId}`;

  const textBody = [
    `Hallo ${toName || toEmail},`,
    "",
    `Leider konnten die Bestelldaten nicht automatisch erkannt werden.`,
    "",
    `Bitte prüfen Sie die Bestellung in der Plattform:`,
    orderUrl,
    "",
    "Mit freundlichen Grüßen,",
    "Ihr Order Intelligence Team",
  ].join("\n");

  const htmlBody = wrapHtmlEmail(siteUrl, `
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Extraktion fehlgeschlagen</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px">Leider konnten die Bestelldaten nicht automatisch erkannt werden.</p>
    <p style="margin:0 0 20px;font-size:14px;color:#374151">Bitte prüfen Sie die Bestellung in der Plattform und versuchen Sie es erneut.</p>
    <a href="${esc(orderUrl)}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500">Bestellung ansehen</a>
  `);

  await postmarkFetchWithRetry(serverApiToken, {
    From: fromAddress,
    To: toEmail,
    Subject: `[Extraktion fehlgeschlagen] – Bestellung`,
    HtmlBody: htmlBody,
    TextBody: textBody,
  }, "Order failure email");
}

/**
 * Sends a confirmation email to the sender via Postmark.
 */
export async function sendConfirmationEmail(params: {
  serverApiToken: string;
  toEmail: string;
  toName: string;
  previewToken: string;
  subject: string;
  siteUrl: string;
}): Promise<void> {
  const { serverApiToken, toEmail, toName, previewToken, subject, siteUrl } = params;

  const fromAddress = resolveSenderAddress(siteUrl);
  if (!fromAddress) return;

  const orderUrl = `${siteUrl}/orders/preview/${previewToken}`;
  const textBody = [
    `Hallo ${toName || toEmail},`,
    "",
    `Ihre weitergeleitete E-Mail "${subject}" wurde empfangen und wird verarbeitet.`,
    "",
    `Sie können den Status Ihrer Bestellung hier verfolgen:`,
    orderUrl,
    "",
    "Mit freundlichen Grüßen,",
    "Ihr Order Intelligence Team",
  ].join("\n");

  const htmlBody = wrapHtmlEmail(siteUrl, `
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Bestellung empfangen</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px">Ihre weitergeleitete E-Mail &ldquo;${esc(subject)}&rdquo; wurde empfangen und wird verarbeitet.</p>
    <a href="${esc(orderUrl)}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500">Bestellung ansehen</a>
  `);

  await postmarkFetchWithRetry(serverApiToken, {
    From: fromAddress,
    To: toEmail,
    Subject: `Bestellung empfangen: ${subject}`,
    HtmlBody: htmlBody,
    TextBody: textBody,
  }, "Inbound confirmation email");
}

/**
 * OPH-24: Sends a platform error notification to all configured admin notification emails.
 * Fetches the recipient list from the platform_settings table at call time.
 * Non-blocking: errors are logged but never thrown.
 */
export async function sendPlatformErrorNotification(params: {
  serverApiToken: string;
  adminClient: import("@supabase/supabase-js").SupabaseClient;
  errorType: string;
  tenantName: string | null;
  tenantSlug: string | null;
  orderId: string | null;
  errorMessage: string;
  siteUrl: string;
}): Promise<void> {
  const { serverApiToken, adminClient, errorType, tenantName, tenantSlug, orderId, errorMessage, siteUrl } = params;

  try {
    // Fetch notification emails from platform_settings (admin client bypasses RLS)
    const { data: settings } = await adminClient
      .from("platform_settings")
      .select("error_notification_emails")
      .eq("id", "singleton")
      .single();

    const emails: string[] = (settings?.error_notification_emails as string[]) ?? [];
    if (emails.length === 0) return;

    const fromAddress = resolveSenderAddress(siteUrl);
    if (!fromAddress) return;

    // Truncate error message to 500 chars
    const truncatedError = errorMessage.length > 500
      ? errorMessage.slice(0, 500) + "..."
      : errorMessage;

    const shortOrderId = orderId ? orderId.slice(0, 8) : "–";
    const tenantDisplay = tenantName || tenantSlug || "Unbekannt";
    const subject = `[Fehler] ${errorType} — ${tenantDisplay} / Order ${shortOrderId}`;
    const timestamp = new Date().toISOString();
    const orderUrl = orderId ? `${siteUrl}/orders/${orderId}` : null;

    const textBody = [
      `Fehler: ${errorType}`,
      "",
      `Mandant: ${tenantDisplay}${tenantSlug ? ` (${tenantSlug})` : ""}`,
      `Bestellung: ${orderId ?? "–"}`,
      `Zeitpunkt: ${timestamp}`,
      "",
      `Fehlermeldung:`,
      truncatedError,
      "",
      ...(orderUrl ? [`Bestellung ansehen: ${orderUrl}`, ""] : []),
      "— Order-Process Hub (OPH)",
    ].join("\n");

    const htmlBody = wrapHtmlEmail(siteUrl, `
      <h2 style="margin:0 0 8px;font-size:18px;color:#dc2626">${esc(errorType)}</h2>
      <table style="margin:0 0 20px;font-size:14px;color:#374151;border-collapse:collapse">
        <tr><td style="padding:4px 16px 4px 0;color:#6b7280;white-space:nowrap">Mandant:</td><td style="padding:4px 0">${esc(tenantDisplay)}${tenantSlug ? ` <span style="color:#9ca3af">(${esc(tenantSlug)})</span>` : ""}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6b7280;white-space:nowrap">Bestellung:</td><td style="padding:4px 0">${orderId ? esc(orderId) : "–"}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6b7280;white-space:nowrap">Zeitpunkt:</td><td style="padding:4px 0">${esc(timestamp)}</td></tr>
      </table>
      <div style="margin:0 0 20px;padding:12px 16px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;font-size:13px;color:#991b1b;font-family:monospace;white-space:pre-wrap;word-break:break-word">${esc(truncatedError)}</div>
      ${orderUrl ? `<a href="${esc(orderUrl)}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500">Bestellung ansehen</a>` : ""}
    `);

    // Send to each configured email independently
    const sendPromises = emails.map((email) =>
      postmarkFetchWithRetry(serverApiToken, {
        From: fromAddress,
        To: email,
        Subject: subject,
        HtmlBody: htmlBody,
        TextBody: textBody,
      }, `Platform error notification to ${email}`).catch((err) => {
        console.error(`Failed to send platform error notification to ${email}:`, err);
      })
    );

    await Promise.all(sendPromises);
  } catch (err) {
    // Non-blocking: never let notification failures affect the main pipeline
    console.error("Failed to send platform error notification:", err);
  }
}

/**
 * OPH-38: Sends a password reset email to a tenant user on behalf of the platform admin.
 * Uses the recovery link generated by Supabase Admin SDK.
 */
export async function sendPasswordResetEmail(params: {
  serverApiToken: string;
  toEmail: string;
  resetLink: string;
  siteUrl: string;
}): Promise<void> {
  const { serverApiToken, toEmail, resetLink, siteUrl } = params;

  const fromAddress = resolveSenderAddress(siteUrl);
  if (!fromAddress) {
    throw new Error("E-Mail-Absenderadresse konnte nicht ermittelt werden. POSTMARK_SENDER_EMAIL ist nicht konfiguriert.");
  }

  const textBody = [
    `Hallo,`,
    "",
    "ein Administrator hat ein Zurücksetzen Ihres Passworts angefordert.",
    "",
    "Klicken Sie auf den folgenden Link, um ein neues Passwort festzulegen:",
    resetLink,
    "",
    "Falls Sie diese Anfrage nicht erwartet haben, können Sie diese E-Mail ignorieren.",
    "",
    "Mit freundlichen Grüßen,",
    "Ihr Order Intelligence Team",
  ].join("\n");

  const htmlBody = wrapHtmlEmail(siteUrl, `
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Passwort zurücksetzen</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px">Ein Administrator hat ein Zurücksetzen Ihres Passworts angefordert. Klicken Sie auf den Button, um ein neues Passwort festzulegen.</p>
    <a href="${esc(resetLink)}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500">Neues Passwort festlegen</a>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px">Falls Sie diese Anfrage nicht erwartet haben, können Sie diese E-Mail ignorieren.</p>
  `);

  await postmarkFetchWithRetry(serverApiToken, {
    From: fromAddress,
    To: toEmail,
    Subject: "Passwort zurücksetzen — Order-Process Hub (OPH)",
    HtmlBody: htmlBody,
    TextBody: textBody,
  }, "Admin-triggered password reset email");
}

/**
 * OPH-38: Re-sends an invitation email to a user who has not yet confirmed their account.
 * Uses the invite link generated by Supabase Admin SDK.
 */
export async function sendResendInviteEmail(params: {
  serverApiToken: string;
  toEmail: string;
  inviteLink: string;
  siteUrl: string;
}): Promise<void> {
  const { serverApiToken, toEmail, inviteLink, siteUrl } = params;

  const fromAddress = resolveSenderAddress(siteUrl);
  if (!fromAddress) {
    throw new Error("E-Mail-Absenderadresse konnte nicht ermittelt werden. POSTMARK_SENDER_EMAIL ist nicht konfiguriert.");
  }

  const textBody = [
    `Hallo,`,
    "",
    "Sie wurden erneut eingeladen, die Order-Process Hub (OPH) zu nutzen.",
    "",
    "Klicken Sie auf den folgenden Link, um Ihr Konto zu aktivieren:",
    inviteLink,
    "",
    "Mit freundlichen Grüßen,",
    "Ihr Order Intelligence Team",
  ].join("\n");

  const htmlBody = wrapHtmlEmail(siteUrl, `
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Einladung zur Order-Process Hub (OPH)</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px">Sie wurden erneut eingeladen, die Order-Process Hub (OPH) zu nutzen. Klicken Sie auf den Button, um Ihr Konto zu aktivieren und ein Passwort festzulegen.</p>
    <a href="${esc(inviteLink)}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500">Konto aktivieren</a>
  `);

  await postmarkFetchWithRetry(serverApiToken, {
    From: fromAddress,
    To: toEmail,
    Subject: "Einladung — Order-Process Hub (OPH)",
    HtmlBody: htmlBody,
    TextBody: textBody,
  }, "Admin-triggered resend invite email");
}

/**
 * Sends the initial invitation email to a new user via Postmark.
 * Uses the invite link generated by Supabase Admin SDK (generateLink).
 */
export async function sendInviteEmail(params: {
  serverApiToken: string;
  toEmail: string;
  inviteLink: string;
  tenantName: string;
  siteUrl: string;
}): Promise<void> {
  const { serverApiToken, toEmail, inviteLink, tenantName, siteUrl } = params;

  const fromAddress = resolveSenderAddress(siteUrl);
  if (!fromAddress) {
    throw new Error("E-Mail-Absenderadresse konnte nicht ermittelt werden. POSTMARK_SENDER_EMAIL ist nicht konfiguriert.");
  }

  const textBody = [
    `Hallo,`,
    "",
    `Sie wurden eingeladen, dem Mandanten "${tenantName}" auf der Order-Process Hub (OPH) beizutreten.`,
    "",
    "Klicken Sie auf den folgenden Link, um Ihr Konto zu aktivieren und ein Passwort festzulegen:",
    inviteLink,
    "",
    "Mit freundlichen Grüßen,",
    "Ihr OPH Team",
  ].join("\n");

  const htmlBody = wrapHtmlEmail(siteUrl, `
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Einladung zur Order-Process Hub (OPH)</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px">Sie wurden eingeladen, dem Mandanten <strong>${esc(tenantName)}</strong> beizutreten. Klicken Sie auf den Button, um Ihr Konto zu aktivieren und ein Passwort festzulegen.</p>
    <a href="${esc(inviteLink)}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500">Konto aktivieren</a>
  `);

  await postmarkFetchWithRetry(serverApiToken, {
    From: fromAddress,
    To: toEmail,
    Subject: `Einladung — ${tenantName} — Order-Process Hub (OPH)`,
    HtmlBody: htmlBody,
    TextBody: textBody,
  }, "Initial invite email");
}

/** Postmark outbound attachment size limit: 25 MB (in bytes). */
const POSTMARK_OUTBOUND_MAX_BYTES = 25 * 1024 * 1024;

/**
 * OPH-63: Sends a forwarded copy of an inbound order email to the tenant's
 * configured forwarding address.
 *
 * The forwarded email includes the original subject (prefixed with "[Fwd]"),
 * a metadata header, the original body text, and all processed attachments.
 * If total attachment size exceeds Postmark's 25 MB outbound limit, attachments
 * are dropped and a note is added to the body.
 */
export async function sendForwardedEmail(params: {
  serverApiToken: string;
  toEmail: string;
  originalSenderEmail: string;
  originalSenderName: string;
  originalSubject: string;
  originalBodyText: string;
  receivedAt: string;
  tenantName: string;
  siteUrl: string;
  attachments: Array<{
    Name: string;
    Content: string;
    ContentType: string;
    ContentLength: number;
  }>;
}): Promise<void> {
  const {
    serverApiToken,
    toEmail,
    originalSenderEmail,
    originalSenderName,
    originalSubject,
    originalBodyText,
    receivedAt,
    tenantName,
    siteUrl,
    attachments,
  } = params;

  const fromAddress = resolveSenderAddress(siteUrl);
  if (!fromAddress) return;

  // Build metadata header block
  const metadataLines = [
    "--- Weitergeleitete Bestellung ---",
    `Absender: ${originalSenderName ? `${originalSenderName} <${originalSenderEmail}>` : originalSenderEmail}`,
    `Empfangen: ${receivedAt}`,
    `Mandant: ${tenantName}`,
    "---",
    "",
  ];
  const bodyText = metadataLines.join("\n") + (originalBodyText || "(Kein E-Mail-Text)");

  // Calculate total attachment size (Content is Base64, so actual bytes ≈ ContentLength)
  const totalAttachmentBytes = attachments.reduce(
    (sum, att) => sum + att.ContentLength,
    0
  );

  let emailAttachments: Array<{
    Name: string;
    Content: string;
    ContentType: string;
  }> = [];
  let attachmentNote = "";

  if (totalAttachmentBytes > POSTMARK_OUTBOUND_MAX_BYTES) {
    attachmentNote =
      "\n\n--- Hinweis ---\nAnhänge zu groß für Weiterleitung. Bitte im System einsehen.";
  } else {
    emailAttachments = attachments.map((att) => ({
      Name: att.Name,
      Content: att.Content,
      ContentType: att.ContentType,
    }));
  }

  const fullBody = bodyText + attachmentNote;

  const postmarkBody: Record<string, unknown> = {
    From: fromAddress,
    To: toEmail,
    ReplyTo: originalSenderEmail,
    Subject: `[Fwd] ${originalSubject || "Bestellung"}`,
    TextBody: fullBody,
  };

  if (emailAttachments.length > 0) {
    postmarkBody.Attachments = emailAttachments;
  }

  await postmarkFetchWithRetry(
    serverApiToken,
    postmarkBody,
    `Forward email to ${toEmail}`
  );
}
