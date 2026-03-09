import { after, NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { requirePlatformAdmin, isErrorResponse } from "@/lib/admin-auth";
import { recognizeDealer } from "@/lib/dealer-recognition";
import { filterAttachments } from "@/lib/postmark";
import type { PostmarkInboundPayload } from "@/lib/postmark";
import type { ApiResponse } from "@/lib/types";

/**
 * POST /api/admin/email-quarantine/[id]/reprocess
 *
 * Re-processes an approved quarantined email: creates an order,
 * uploads attachments, runs dealer recognition, and triggers extraction.
 * Platform admin only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<{ orderId: string }>> | NextResponse<ApiResponse>> {
  try {
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;

    const { adminClient } = auth;
    const { id } = await params;

    // 1. Fetch the quarantine entry
    const { data: entry, error: fetchError } = await adminClient
      .from("email_quarantine")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !entry) {
      return NextResponse.json(
        { success: false, error: "Quarantäne-Eintrag nicht gefunden." },
        { status: 404 }
      );
    }

    if (entry.review_status !== "approved") {
      return NextResponse.json(
        { success: false, error: "Eintrag muss zuerst freigegeben werden." },
        { status: 409 }
      );
    }

    if (entry.order_id) {
      return NextResponse.json(
        { success: false, error: "Bestellung wurde bereits erstellt." },
        { status: 409 }
      );
    }

    // 2. Download the archived email payload from storage
    if (!entry.storage_path) {
      return NextResponse.json(
        { success: false, error: "Keine archivierten E-Mail-Daten vorhanden." },
        { status: 400 }
      );
    }

    const { data: fileData, error: downloadError } = await adminClient.storage
      .from("order-files")
      .download(entry.storage_path);

    if (downloadError || !fileData) {
      console.error("Failed to download archived email:", downloadError?.message);
      return NextResponse.json(
        { success: false, error: "Archivierte E-Mail konnte nicht geladen werden. Die E-Mail muss erneut gesendet werden." },
        { status: 500 }
      );
    }

    let payload: PostmarkInboundPayload;
    try {
      const text = await fileData.text();
      payload = JSON.parse(text) as PostmarkInboundPayload;
    } catch {
      return NextResponse.json(
        { success: false, error: "Archivierte E-Mail-Daten sind ungültig." },
        { status: 500 }
      );
    }

    // 3. Create order record
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .insert({
        tenant_id: entry.tenant_id,
        uploaded_by: null, // No specific user — admin-initiated
        status: "uploaded",
        source: "email_inbound",
        message_id: entry.message_id,
        sender_email: entry.sender_email,
      })
      .select("id")
      .single();

    if (orderError || !order) {
      console.error("Failed to create order from quarantine:", orderError?.message);
      return NextResponse.json(
        { success: false, error: "Bestellung konnte nicht erstellt werden." },
        { status: 500 }
      );
    }

    const orderId = order.id;

    // 4. Link quarantine entry to the new order
    const { error: linkError } = await adminClient
      .from("email_quarantine")
      .update({ order_id: orderId })
      .eq("id", id);

    if (linkError) {
      console.error("Failed to link quarantine entry to order:", linkError.message);
    }

    // 5. Upload attachments
    const { supported: supportedAttachments } = filterAttachments(
      payload.Attachments ?? []
    );

    let primaryFilename: string | null = null;
    let primaryStoragePath: string | null = null;

    for (const attachment of supportedAttachments) {
      const buffer = Buffer.from(attachment.Content, "base64");
      const sanitizedName = attachment.Name.replace(/[^a-z0-9._-]/gi, "_");
      const storagePath = `${entry.tenant_id}/${orderId}/${sanitizedName}`;

      const sha256Hash = crypto.createHash("sha256").update(buffer).digest("hex");

      const { error: uploadError } = await adminClient.storage
        .from("order-files")
        .upload(storagePath, buffer, {
          contentType: attachment.ContentType,
        });

      if (uploadError) {
        console.error(`Failed to upload attachment ${attachment.Name}:`, uploadError.message);
        continue;
      }

      await adminClient.from("order_files").insert({
        order_id: orderId,
        tenant_id: entry.tenant_id,
        original_filename: attachment.Name,
        storage_path: storagePath,
        file_size_bytes: buffer.length > 0 ? buffer.length : 1,
        mime_type: attachment.ContentType,
        sha256_hash: sha256Hash,
      });

      if (!primaryFilename) {
        primaryFilename = attachment.Name;
        primaryStoragePath = storagePath;
      }
    }

    // 6. If no attachments, save text body
    if (supportedAttachments.length === 0 && (payload.TextBody || payload.HtmlBody)) {
      const textContent = payload.TextBody || payload.HtmlBody;
      const buffer = Buffer.from(textContent, "utf-8");
      const storagePath = `${entry.tenant_id}/${orderId}/email_body.txt`;
      const sha256Hash = crypto.createHash("sha256").update(buffer).digest("hex");

      const { error: uploadError } = await adminClient.storage
        .from("order-files")
        .upload(storagePath, buffer, { contentType: "text/plain" });

      if (!uploadError) {
        await adminClient.from("order_files").insert({
          order_id: orderId,
          tenant_id: entry.tenant_id,
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

    // 7. Run dealer recognition
    if (primaryStoragePath && primaryFilename) {
      await recognizeDealer(adminClient, orderId, primaryStoragePath, primaryFilename);
    }

    // 8. Trigger AI extraction
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
              `Extraction trigger got ${res.status} for reprocessed order ${orderId}`
            );
          }
        } catch (err) {
          console.error(
            `Extraction trigger failed for reprocessed order ${orderId}:`,
            err
          );
        }
      });
    }

    return NextResponse.json({
      success: true,
      data: { orderId },
    });
  } catch (error) {
    console.error("Unexpected error in quarantine reprocess:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
