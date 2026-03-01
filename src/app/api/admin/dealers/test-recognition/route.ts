import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse } from "@/lib/admin-auth";
import type { RecognitionMethod } from "@/lib/types";

/**
 * POST /api/admin/dealers/test-recognition
 *
 * Tests dealer recognition against a sample file.
 * The file is NOT persisted — only metadata is inspected.
 * Platform admin only.
 *
 * Body: multipart/form-data with a single "file" field.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { adminClient } = auth;

    // Parse the multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Keine Datei hochgeladen." },
        { status: 400 }
      );
    }

    const originalFilename = file.name;

    // Parse .eml headers if applicable (inline — no storage needed)
    const isEml = originalFilename.toLowerCase().endsWith(".eml");
    let senderEmail: string | null = null;
    let senderDomain: string | null = null;
    let emailSubject: string | null = null;

    if (isEml) {
      const text = await file.text();
      const headers = parseEmlHeadersFromText(text);
      if (headers.from) {
        senderEmail = extractEmailAddress(headers.from);
        senderDomain = senderEmail ? extractDomain(senderEmail) : null;
      }
      emailSubject = headers.subject;
    }

    // Fetch all active dealers with their recognition rules
    const { data: dealers, error: dealersError } = await adminClient
      .from("dealers")
      .select("id, name, known_domains, known_sender_addresses, subject_patterns, filename_patterns")
      .eq("active", true);

    if (dealersError || !dealers || dealers.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          dealer_id: null,
          dealer_name: null,
          recognition_method: "none",
          recognition_confidence: 0,
        },
      });
    }

    // Score each dealer (same algorithm as dealer-recognition.ts)
    interface DealerScore {
      id: string;
      name: string;
      confidence: number;
      bestMethod: RecognitionMethod;
    }

    const scores: DealerScore[] = [];

    for (const dealer of dealers) {
      let confidence = 0;
      let bestMethod: RecognitionMethod = "none";
      let bestMethodConfidence = 0;

      const knownDomains = dealer.known_domains as string[];
      const knownSenders = dealer.known_sender_addresses as string[];
      const subjectPatterns = dealer.subject_patterns as string[];
      const filenamePatterns = dealer.filename_patterns as string[];

      // Exact sender address match → 100%
      if (senderEmail && knownSenders.length > 0) {
        if (knownSenders.some((a) => a.toLowerCase() === senderEmail!)) {
          confidence += 100;
          if (100 > bestMethodConfidence) {
            bestMethod = "address";
            bestMethodConfidence = 100;
          }
        }
      }

      // Email domain match → 85%
      if (senderDomain && knownDomains.length > 0) {
        if (knownDomains.some((d) => d.toLowerCase() === senderDomain!)) {
          confidence += 85;
          if (85 > bestMethodConfidence) {
            bestMethod = "domain";
            bestMethodConfidence = 85;
          }
        }
      }

      // Subject pattern match → 70%
      if (emailSubject && subjectPatterns.length > 0) {
        if (subjectPatterns.some((p) => emailSubject!.toLowerCase().includes(p.toLowerCase()))) {
          confidence += 70;
          if (70 > bestMethodConfidence) {
            bestMethod = "subject";
            bestMethodConfidence = 70;
          }
        }
      }

      // Filename pattern match → 55%
      if (filenamePatterns.length > 0) {
        if (filenamePatterns.some((p) => originalFilename.toLowerCase().includes(p.toLowerCase()))) {
          confidence += 55;
          if (55 > bestMethodConfidence) {
            bestMethod = "filename";
            bestMethodConfidence = 55;
          }
        }
      }

      confidence = Math.min(confidence, 100);

      if (confidence > 0) {
        scores.push({
          id: dealer.id as string,
          name: dealer.name as string,
          confidence,
          bestMethod,
        });
      }
    }

    // Pick the highest-scoring dealer
    if (scores.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          dealer_id: null,
          dealer_name: null,
          recognition_method: "none",
          recognition_confidence: 0,
        },
      });
    }

    scores.sort((a, b) => b.confidence - a.confidence);
    const best = scores[0];

    return NextResponse.json({
      success: true,
      data: {
        dealer_id: best.id,
        dealer_name: best.name,
        recognition_method: best.bestMethod,
        recognition_confidence: best.confidence,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/admin/dealers/test-recognition:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

// --- Helper functions (duplicated from dealer-recognition.ts to avoid storage dependency) ---

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
        // Return original if decoding fails
      }
      return encoded;
    }
  );
}

function parseEmlHeadersFromText(text: string): { from: string | null; subject: string | null } {
  const result = { from: null as string | null, subject: null as string | null };
  try {
    const headerEnd = text.indexOf("\r\n\r\n");
    const headerBlock = headerEnd >= 0 ? text.slice(0, headerEnd) : text.slice(0, 8192);
    const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
    const lines = unfolded.split(/\r?\n/);

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith("from:")) {
        result.from = decodeRfc2047(line.slice(5).trim());
      } else if (lower.startsWith("subject:")) {
        result.subject = decodeRfc2047(line.slice(8).trim());
      }
      if (result.from && result.subject) break;
    }
  } catch {
    // Non-fatal
  }
  return result;
}

function extractEmailAddress(fromHeader: string): string | null {
  const angleMatch = fromHeader.match(/<([^>]+)>/);
  if (angleMatch) return angleMatch[1].toLowerCase();
  const bareMatch = fromHeader.match(/[\w.+-]+@[\w.-]+\.\w+/);
  if (bareMatch) return bareMatch[0].toLowerCase();
  return null;
}

function extractDomain(email: string): string | null {
  const atIndex = email.lastIndexOf("@");
  if (atIndex < 0) return null;
  return email.slice(atIndex + 1).toLowerCase();
}
