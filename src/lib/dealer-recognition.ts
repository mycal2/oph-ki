import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecognitionMethod } from "@/lib/types";
import { safeMatchesPattern } from "@/lib/safe-regex";

/**
 * OPH-3: Rule-based dealer recognition engine.
 *
 * After a file is uploaded and confirmed, this module inspects file metadata
 * (and .eml headers if applicable) to identify the dealer who sent the order.
 *
 * Priority order (highest confidence wins):
 *   1. Exact sender email address match → 100%
 *   2. Email domain match              → 85%
 *   3. Subject line pattern match       → 70%
 *   4. Filename pattern match           → 55%
 *
 * Multiple matching signals are combined (additive, capped at 100%).
 */

export interface RecognitionResult {
  dealerId: string | null;
  dealerName: string | null;
  recognitionMethod: RecognitionMethod;
  recognitionConfidence: number;
}

interface DealerRow {
  id: string;
  name: string;
  known_domains: string[];
  known_sender_addresses: string[];
  subject_patterns: string[];
  filename_patterns: string[];
}

interface EmailHeaders {
  from: string | null;
  subject: string | null;
}

/**
 * Decodes RFC 2047 encoded words in email headers.
 * Handles both Base64 (B) and Quoted-Printable (Q) encodings.
 * Example: "=?UTF-8?B?QmVzdGVsbHVuZw==?=" -> "Bestellung"
 */
function decodeRfc2047(headerValue: string): string {
  return headerValue.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_match, _charset: string, encoding: string, encoded: string) => {
      try {
        if (encoding.toUpperCase() === "B") {
          const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
          return new TextDecoder("utf-8").decode(bytes);
        } else if (encoding.toUpperCase() === "Q") {
          const decoded = encoded
            .replace(/_/g, " ")
            .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) =>
              String.fromCharCode(parseInt(hex, 16))
            );
          const bytes = new Uint8Array(
            [...decoded].map((c) => c.charCodeAt(0))
          );
          return new TextDecoder("utf-8").decode(bytes);
        }
      } catch {
        // Return the original encoded string if decoding fails
      }
      return encoded;
    }
  );
}

/**
 * Parses the RFC 822 headers from an .eml file stored in Supabase Storage.
 * Only reads headers (before the first blank line) to extract From and Subject.
 * Handles RFC 2047 encoded headers (Base64 and Quoted-Printable).
 */
async function parseEmlHeaders(
  adminClient: SupabaseClient,
  storagePath: string
): Promise<EmailHeaders> {
  const result: EmailHeaders = { from: null, subject: null };

  try {
    const { data, error } = await adminClient.storage
      .from("order-files")
      .download(storagePath);

    if (error || !data) return result;

    // Read the blob as text (email headers are ASCII/UTF-8)
    const text = await data.text();

    // Headers end at the first blank line
    const headerEnd = text.indexOf("\r\n\r\n");
    const headerBlock =
      headerEnd >= 0 ? text.slice(0, headerEnd) : text.slice(0, 8192);

    // Unfold continuation lines (lines starting with whitespace are continuations)
    const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
    const lines = unfolded.split(/\r?\n/);

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith("from:")) {
        result.from = decodeRfc2047(line.slice(5).trim());
      } else if (lower.startsWith("subject:")) {
        result.subject = decodeRfc2047(line.slice(8).trim());
      }
      // Stop once we have both
      if (result.from && result.subject) break;
    }
  } catch (err) {
    console.error("Failed to parse .eml headers:", err);
  }

  return result;
}

/**
 * Extracts the email address from a From header value.
 * Handles formats like: "Name <email@domain.com>" or "email@domain.com"
 */
function extractEmailAddress(fromHeader: string): string | null {
  const angleMatch = fromHeader.match(/<([^>]+)>/);
  if (angleMatch) return angleMatch[1].toLowerCase();

  const bareMatch = fromHeader.match(/[\w.+-]+@[\w.-]+\.\w+/);
  if (bareMatch) return bareMatch[0].toLowerCase();

  return null;
}

/**
 * Extracts the domain part from an email address.
 */
function extractDomain(email: string): string | null {
  const atIndex = email.lastIndexOf("@");
  if (atIndex < 0) return null;
  return email.slice(atIndex + 1).toLowerCase();
}

/**
 * Tests if a sender email matches a known address.
 * Supports wildcard format: *@domain.com matches any address at that domain.
 */
function matchesSenderAddress(senderEmail: string, knownAddress: string): boolean {
  const lower = knownAddress.toLowerCase();
  if (lower.startsWith("*@")) {
    const domain = lower.slice(2);
    return senderEmail.endsWith("@" + domain);
  }
  return lower === senderEmail;
}

/**
 * Runs dealer recognition for a given order.
 *
 * @param adminClient - Supabase admin client (service role, bypasses RLS)
 * @param orderId     - The order to recognize
 * @param storagePath - The uploaded file's storage path
 * @param originalFilename - The original filename
 * @returns The recognition result (always returns, never throws)
 */
export async function recognizeDealer(
  adminClient: SupabaseClient,
  orderId: string,
  storagePath: string,
  originalFilename: string
): Promise<RecognitionResult> {
  const noMatch: RecognitionResult = {
    dealerId: null,
    dealerName: null,
    recognitionMethod: "none",
    recognitionConfidence: 0,
  };

  try {
    // 1. Fetch all active dealers with their recognition rules
    const { data: dealers, error: dealersError } = await adminClient
      .from("dealers")
      .select("id, name, known_domains, known_sender_addresses, subject_patterns, filename_patterns")
      .eq("active", true);

    if (dealersError || !dealers || dealers.length === 0) {
      // No dealers configured — update order and return
      await updateOrderDealer(adminClient, orderId, noMatch);
      return noMatch;
    }

    // 2. Parse .eml headers if the file is an email
    const isEml = originalFilename.toLowerCase().endsWith(".eml");
    let emailHeaders: EmailHeaders = { from: null, subject: null };
    if (isEml) {
      emailHeaders = await parseEmlHeaders(adminClient, storagePath);
    }

    const senderEmail = emailHeaders.from
      ? extractEmailAddress(emailHeaders.from)
      : null;
    const senderDomain = senderEmail ? extractDomain(senderEmail) : null;
    const emailSubject = emailHeaders.subject;

    // 3. Score each dealer
    interface DealerScore {
      dealer: DealerRow;
      confidence: number;
      bestMethod: RecognitionMethod;
    }

    const scores: DealerScore[] = [];

    for (const dealer of dealers as DealerRow[]) {
      let confidence = 0;
      let bestMethod: RecognitionMethod = "none";
      let bestMethodConfidence = 0;

      // Check sender address (highest priority: 100%) — supports *@domain wildcards
      if (senderEmail && dealer.known_sender_addresses.length > 0) {
        const addressMatch = dealer.known_sender_addresses.some(
          (addr) => matchesSenderAddress(senderEmail, addr)
        );
        if (addressMatch) {
          confidence += 100;
          if (100 > bestMethodConfidence) {
            bestMethod = "address";
            bestMethodConfidence = 100;
          }
        }
      }

      // Check email domain (85%)
      if (senderDomain && dealer.known_domains.length > 0) {
        const domainMatch = dealer.known_domains.some(
          (domain) => domain.toLowerCase() === senderDomain
        );
        if (domainMatch) {
          confidence += 85;
          if (85 > bestMethodConfidence) {
            bestMethod = "domain";
            bestMethodConfidence = 85;
          }
        }
      }

      // Check subject patterns via regex (70%)
      if (emailSubject && dealer.subject_patterns.length > 0) {
        const subjectMatch = dealer.subject_patterns.some((pattern) =>
          safeMatchesPattern(emailSubject, pattern)
        );
        if (subjectMatch) {
          confidence += 70;
          if (70 > bestMethodConfidence) {
            bestMethod = "subject";
            bestMethodConfidence = 70;
          }
        }
      }

      // Check filename patterns via regex (55%)
      if (dealer.filename_patterns.length > 0) {
        const filenameMatch = dealer.filename_patterns.some((pattern) =>
          safeMatchesPattern(originalFilename, pattern)
        );
        if (filenameMatch) {
          confidence += 55;
          if (55 > bestMethodConfidence) {
            bestMethod = "filename";
            bestMethodConfidence = 55;
          }
        }
      }

      // Cap at 100%
      confidence = Math.min(confidence, 100);

      if (confidence > 0) {
        scores.push({ dealer, confidence, bestMethod });
      }
    }

    // 4. Pick the highest-scoring dealer
    if (scores.length === 0) {
      await updateOrderDealer(adminClient, orderId, noMatch);
      return noMatch;
    }

    scores.sort((a, b) => b.confidence - a.confidence);
    const best = scores[0];

    const result: RecognitionResult = {
      dealerId: best.dealer.id,
      dealerName: best.dealer.name,
      recognitionMethod: best.bestMethod,
      recognitionConfidence: best.confidence,
    };

    // 5. Update the order with the recognition result
    await updateOrderDealer(adminClient, orderId, result);

    return result;
  } catch (err) {
    console.error("Dealer recognition failed:", err);
    // Non-fatal — order continues with "none" recognition
    await updateOrderDealer(adminClient, orderId, noMatch).catch(() => {});
    return noMatch;
  }
}

/**
 * Persists the dealer recognition result on the orders table.
 */
async function updateOrderDealer(
  adminClient: SupabaseClient,
  orderId: string,
  result: RecognitionResult
): Promise<void> {
  const { error } = await adminClient
    .from("orders")
    .update({
      dealer_id: result.dealerId,
      recognition_method: result.recognitionMethod,
      recognition_confidence: result.recognitionConfidence,
    })
    .eq("id", orderId);

  if (error) {
    console.error("Failed to update order dealer:", error.message);
  }
}
