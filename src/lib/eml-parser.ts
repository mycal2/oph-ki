import { simpleParser } from "mailparser";

export interface ParsedEml {
  subject: string | null;
  from: string | null;
  to: string | null;
  date: string | null;
  textBody: string | null;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
  }>;
}

/**
 * Parses a .eml file buffer into structured data.
 * Extracts subject, sender, body text, and attachment metadata.
 */
export async function parseEml(buffer: Buffer): Promise<ParsedEml> {
  const parsed = await simpleParser(buffer);

  // Extract plain text body; if only HTML is available, strip tags
  let textBody = parsed.text ?? null;
  if (!textBody && parsed.html) {
    textBody = stripHtml(parsed.html);
  }

  return {
    subject: parsed.subject ?? null,
    from: parsed.from?.text ?? null,
    to: parsed.to
      ? Array.isArray(parsed.to)
        ? parsed.to.map((t) => t.text).join(", ")
        : parsed.to.text
      : null,
    date: parsed.date?.toISOString() ?? null,
    textBody,
    attachments: (parsed.attachments ?? []).map((att) => ({
      filename: att.filename ?? "unknown",
      contentType: att.contentType,
      size: att.size,
    })),
  };
}

/** Basic HTML stripping for readable text extraction. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, "\t")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}
