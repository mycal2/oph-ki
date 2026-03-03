import { after, NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractOrderData } from "@/lib/claude-extraction";
import { getMappingsForDealer, applyMappings, formatMappingsForPrompt } from "@/lib/dealer-mappings";
import { mimeTypeToFormatType, getColumnMappingProfile, formatColumnMappingForPrompt } from "@/lib/column-mappings";
import { sendTrialResultEmail, sendTrialFailureEmail } from "@/lib/postmark";
import type { AppMetadata, ApiResponse } from "@/lib/types";

/** Max extraction attempts per order before rejecting further retries. */
const MAX_EXTRACTION_ATTEMPTS = 5;

/** Timing-safe string comparison to prevent timing attacks on secrets. */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * POST /api/orders/[orderId]/extract
 *
 * Triggers AI extraction for an order's files using the Claude API.
 *
 * Dual authentication:
 *   1. Internal: `x-internal-secret` header matching CRON_SECRET (fire-and-forget from confirm route)
 *   2. User: Standard Supabase auth (manual retry from the UI)
 *
 * Concurrency guard: rejects if extraction_status is already "processing".
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { orderId } = await params;

    // Validate orderId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orderId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Bestellungs-ID." },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    let tenantId: string | null = null;

    // --- Dual authentication ---
    const internalSecret = request.headers.get("x-internal-secret");
    const cronSecret = process.env.CRON_SECRET;

    if (internalSecret && cronSecret && safeCompare(internalSecret, cronSecret)) {
      // Internal call — trusted, skip user auth.
      // Fetch tenantId from the order itself.
      const { data: orderRow } = await adminClient
        .from("orders")
        .select("tenant_id")
        .eq("id", orderId)
        .single();

      if (!orderRow) {
        return NextResponse.json(
          { success: false, error: "Bestellung nicht gefunden." },
          { status: 404 }
        );
      }
      tenantId = orderRow.tenant_id as string;
    } else {
      // User call — standard Supabase auth
      const supabase = await createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        return NextResponse.json(
          { success: false, error: "Nicht authentifiziert." },
          { status: 401 }
        );
      }

      const appMetadata = user.app_metadata as AppMetadata | undefined;

      if (appMetadata?.user_status === "inactive") {
        return NextResponse.json(
          { success: false, error: "Ihr Konto ist deaktiviert." },
          { status: 403 }
        );
      }

      if (appMetadata?.tenant_status === "inactive") {
        return NextResponse.json(
          { success: false, error: "Ihr Mandant ist deaktiviert." },
          { status: 403 }
        );
      }

      tenantId = appMetadata?.tenant_id ?? null;
      if (!tenantId) {
        return NextResponse.json(
          { success: false, error: "Kein Mandant zugewiesen." },
          { status: 403 }
        );
      }
    }

    // --- Fetch order and check concurrency ---
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("id, tenant_id, status, extraction_status, extraction_attempts, dealer_id, recognition_confidence")
      .eq("id", orderId)
      .eq("tenant_id", tenantId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { success: false, error: "Bestellung nicht gefunden." },
        { status: 404 }
      );
    }

    // Concurrency guard: reject if already processing
    if (order.extraction_status === "processing") {
      return NextResponse.json(
        { success: false, error: "Extraktion laeuft bereits." },
        { status: 409 }
      );
    }

    // Max retry limit: prevent unbounded API cost
    const currentAttempts = (order.extraction_attempts as number) ?? 0;
    if (currentAttempts >= MAX_EXTRACTION_ATTEMPTS) {
      return NextResponse.json(
        {
          success: false,
          error: `Maximale Anzahl an Extraktionsversuchen (${MAX_EXTRACTION_ATTEMPTS}) erreicht. Bitte kontaktieren Sie den Support.`,
        },
        { status: 429 }
      );
    }
    const { error: updateError } = await adminClient
      .from("orders")
      .update({
        extraction_status: "processing",
        extraction_attempts: currentAttempts + 1,
        extraction_error: null,
        status: "processing",
        // Clear previous review data so re-extraction starts fresh
        reviewed_data: null,
        reviewed_at: null,
        reviewed_by: null,
      })
      .eq("id", orderId);

    if (updateError) {
      console.error("Error setting extraction status:", updateError.message);
      return NextResponse.json(
        { success: false, error: "Status konnte nicht aktualisiert werden." },
        { status: 500 }
      );
    }

    // --- Fetch order files ---
    const { data: files, error: filesError } = await adminClient
      .from("order_files")
      .select("id, storage_path, original_filename, mime_type")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });

    if (filesError || !files || files.length === 0) {
      await adminClient
        .from("orders")
        .update({
          extraction_status: "failed",
          extraction_error: "Keine Dateien fuer Extraktion gefunden.",
          status: "error",
        })
        .eq("id", orderId);

      return NextResponse.json(
        { success: false, error: "Keine Dateien fuer Extraktion gefunden." },
        { status: 400 }
      );
    }

    // --- Download files from Supabase Storage ---
    const fileContents: Array<{
      storagePath: string;
      originalFilename: string;
      mimeType: string;
      content: Buffer;
    }> = [];

    for (const file of files) {
      const { data: blob, error: downloadError } = await adminClient.storage
        .from("order-files")
        .download(file.storage_path as string);

      if (downloadError || !blob) {
        console.error(
          `Error downloading file ${file.storage_path}:`,
          downloadError?.message
        );
        continue;
      }

      const arrayBuffer = await blob.arrayBuffer();
      fileContents.push({
        storagePath: file.storage_path as string,
        originalFilename: file.original_filename as string,
        mimeType: file.mime_type as string,
        content: Buffer.from(arrayBuffer),
      });
    }

    if (fileContents.length === 0) {
      await adminClient
        .from("orders")
        .update({
          extraction_status: "failed",
          extraction_error: "Dateien konnten nicht heruntergeladen werden.",
          status: "error",
        })
        .eq("id", orderId);

      return NextResponse.json(
        { success: false, error: "Dateien konnten nicht heruntergeladen werden." },
        { status: 500 }
      );
    }

    // --- Fetch dealer info for extraction hints ---
    let dealerInfo: {
      id: string | null;
      name: string | null;
      extractionHints: string | null;
    } | null = null;

    if (order.dealer_id) {
      const { data: dealer } = await adminClient
        .from("dealers")
        .select("id, name, extraction_hints")
        .eq("id", order.dealer_id as string)
        .single();

      if (dealer) {
        dealerInfo = {
          id: dealer.id as string,
          name: dealer.name as string,
          extractionHints: (dealer.extraction_hints as string) ?? null,
        };
      }
    }

    // --- Fetch dealer mappings for prompt context (OPH-14) ---
    let mappingsContext: string | undefined;
    if (order.dealer_id && tenantId) {
      const mappings = await getMappingsForDealer(adminClient, order.dealer_id as string, tenantId);
      if (mappings.length > 0) {
        mappingsContext = formatMappingsForPrompt(mappings);
      }
    }

    // --- Fetch column mapping profile for prompt context (OPH-15) ---
    let columnMappingContext: string | undefined;
    if (order.dealer_id && fileContents.length > 0) {
      // Determine format type from the primary file's MIME type
      const primaryMimeType = fileContents[0].mimeType;
      const formatType = mimeTypeToFormatType(primaryMimeType);

      if (formatType) {
        const profile = await getColumnMappingProfile(
          adminClient,
          order.dealer_id as string,
          formatType
        );
        if (profile && profile.mappings.length > 0) {
          columnMappingContext = formatColumnMappingForPrompt(profile);
        }
      }
    }

    // --- Call Claude extraction ---
    try {
      const result = await extractOrderData({
        orderId,
        files: fileContents,
        dealer: dealerInfo,
        mappingsContext,
        columnMappingContext,
      });

      // --- AI-based dealer matching from extracted sender info ---
      const metadataConfidence = (order.recognition_confidence as number) ?? 0;
      const senderName = result.extractedData.order.sender?.company_name;
      let aiDealerUpdate: Record<string, unknown> = {};

      if (metadataConfidence < 80 && senderName) {
        const { data: allDealers } = await adminClient
          .from("dealers")
          .select("id, name, city, country")
          .eq("active", true);

        if (allDealers && allDealers.length > 0) {
          const senderLower = senderName.toLowerCase().trim();
          const senderCity = result.extractedData.order.sender?.city?.toLowerCase().trim() ?? null;
          const senderCountry = result.extractedData.order.sender?.country?.toLowerCase().trim() ?? null;
          let bestMatch: { id: string; name: string; confidence: number } | null = null;

          /** Split a name into significant words (2+ chars, strip punctuation). */
          const toWords = (s: string) =>
            s.replace(/[&.,()]/g, " ").split(/\s+/).filter((w) => w.length > 1);

          /** Check if dealer address matches the sender address. */
          const addressMatches = (dealer: { city: unknown; country: unknown }): boolean => {
            const dCity = (dealer.city as string | null)?.toLowerCase().trim() ?? null;
            const dCountry = (dealer.country as string | null)?.toLowerCase().trim() ?? null;
            if (senderCountry && dCountry && senderCountry === dCountry) return true;
            if (senderCity && dCity && senderCity === dCity) return true;
            return false;
          };

          const senderWords = toWords(senderLower);

          for (const dealer of allDealers) {
            const dealerLower = (dealer.name as string).toLowerCase().trim();
            const hasAddressMatch = addressMatches(dealer);

            // 1) Exact name match
            if (senderLower === dealerLower) {
              bestMatch = { id: dealer.id as string, name: dealer.name as string, confidence: 95 };
              break;
            }

            // 2) Substring match (either direction) + address boost
            if (senderLower.includes(dealerLower) || dealerLower.includes(senderLower)) {
              const confidence = hasAddressMatch ? 90 : 80;
              if (!bestMatch || confidence > bestMatch.confidence) {
                bestMatch = { id: dealer.id as string, name: dealer.name as string, confidence };
              }
              continue;
            }

            // 3) Word overlap match — e.g. "Henry Schein France" vs "Henry Schein GmbH"
            //    Address match is critical here to distinguish regional subsidiaries.
            const dealerWords = toWords(dealerLower);
            const shorter = senderWords.length <= dealerWords.length ? senderWords : dealerWords;
            const longer = senderWords.length <= dealerWords.length ? dealerWords : senderWords;
            const matchCount = shorter.filter((w) => longer.includes(w)).length;

            if (matchCount >= 2 && matchCount / shorter.length >= 0.5) {
              // With address match → high confidence; without → low (could be a different subsidiary)
              const confidence = hasAddressMatch ? 85 : 55;
              if (!bestMatch || confidence > bestMatch.confidence) {
                bestMatch = { id: dealer.id as string, name: dealer.name as string, confidence };
              }
            }
          }

          if (bestMatch) {
            aiDealerUpdate = {
              dealer_id: bestMatch.id,
              recognition_method: "ai_content",
              recognition_confidence: bestMatch.confidence,
            };
            // Also set dealer info in extracted data for consistency
            result.extractedData.order.dealer = {
              id: bestMatch.id,
              name: bestMatch.name,
            };
          }
        }

        // --- Auto-create dealer if no match found ---
        if (Object.keys(aiDealerUpdate).length === 0) {
          const sender = result.extractedData.order.sender;
          if (sender?.company_name) {
            const { data: newDealer } = await adminClient
              .from("dealers")
              .insert({
                name: sender.company_name,
                street: sender.street ?? null,
                postal_code: sender.postal_code ?? null,
                city: sender.city ?? null,
                country: sender.country ?? null,
                format_type: "pdf_table",
                active: true,
              })
              .select("id, name")
              .single();

            if (newDealer) {
              aiDealerUpdate = {
                dealer_id: newDealer.id as string,
                recognition_method: "ai_content",
                recognition_confidence: 70,
              };
              result.extractedData.order.dealer = {
                id: newDealer.id as string,
                name: newDealer.name as string,
              };
              console.log(`Auto-created dealer "${newDealer.name}" (${newDealer.id}) for order ${orderId}`);
            }
          }
        }
      }

      // --- Re-extract with column mapping if dealer was resolved by AI matching ---
      // When the dealer wasn't known before extraction (no metadata-based recognition),
      // AI matching may have identified the dealer from extracted content. If column
      // mappings exist for that dealer, re-extract with the mapping context so the AI
      // can correctly interpret ambiguous/unlabeled columns.
      const resolvedDealerId = (aiDealerUpdate.dealer_id as string) ?? (order.dealer_id as string);
      let finalResult = result;

      if (resolvedDealerId && !columnMappingContext && fileContents.length > 0) {
        const primaryMimeType = fileContents[0].mimeType;
        const resolvedFormatType = mimeTypeToFormatType(primaryMimeType);

        if (resolvedFormatType) {
          const resolvedProfile = await getColumnMappingProfile(
            adminClient,
            resolvedDealerId,
            resolvedFormatType
          );

          if (resolvedProfile && resolvedProfile.mappings.length > 0) {
            const resolvedColumnCtx = formatColumnMappingForPrompt(resolvedProfile);
            console.log(
              `Re-extracting order ${orderId} with column mapping for dealer ${resolvedDealerId} (${resolvedFormatType})`
            );

            // Fetch dealer hints for the resolved dealer (may differ from initial)
            let resolvedDealerInfo = dealerInfo;
            if (!resolvedDealerInfo || resolvedDealerInfo.id !== resolvedDealerId) {
              const { data: rDealer } = await adminClient
                .from("dealers")
                .select("id, name, extraction_hints")
                .eq("id", resolvedDealerId)
                .single();
              if (rDealer) {
                resolvedDealerInfo = {
                  id: rDealer.id as string,
                  name: rDealer.name as string,
                  extractionHints: (rDealer.extraction_hints as string) ?? null,
                };
              }
            }

            finalResult = await extractOrderData({
              orderId,
              files: fileContents,
              dealer: resolvedDealerInfo,
              mappingsContext,
              columnMappingContext: resolvedColumnCtx,
            });

            // Preserve the AI-matched dealer info in the re-extracted data
            if (aiDealerUpdate.dealer_id) {
              finalResult.extractedData.order.dealer = result.extractedData.order.dealer;
            }
          }
        }
      }

      // --- Apply dealer data mappings post-extraction (OPH-14) ---
      let finalExtractedData = finalResult.extractedData;
      let hasUnmappedArticles = false;

      if (resolvedDealerId && tenantId) {
        const postMappings = await getMappingsForDealer(adminClient, resolvedDealerId, tenantId);
        if (postMappings.length > 0) {
          const mapped = applyMappings(finalExtractedData, postMappings);
          finalExtractedData = mapped.data;
          hasUnmappedArticles = mapped.unmappedArticles.length > 0;
        }
      }

      // --- Save extracted data ---
      await adminClient
        .from("orders")
        .update({
          extraction_status: "extracted",
          extracted_data: finalExtractedData,
          extraction_error: null,
          status: "extracted",
          has_unmapped_articles: hasUnmappedArticles,
          ...aiDealerUpdate,
        })
        .eq("id", orderId);

      // --- OPH-16: Trial post-processing (CSV + result email) ---
      const serverApiToken = process.env.POSTMARK_SERVER_API_TOKEN;
      if (serverApiToken && tenantId) {
        const { data: tenantRow } = await adminClient
          .from("tenants")
          .select("status")
          .eq("id", tenantId)
          .single();

        if (tenantRow?.status === "trial") {
          // Fetch order's sender_email and preview_token
          const { data: orderMeta } = await adminClient
            .from("orders")
            .select("sender_email, preview_token")
            .eq("id", orderId)
            .single();

          if (orderMeta?.sender_email && orderMeta?.preview_token) {
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
            const lineItems = finalExtractedData.order.line_items ?? [];

            // Generate simple CSV (no ERP mapping needed for trial)
            const csvHeader = "Pos;Artikelnummer;Bezeichnung;Menge;Einheit;Einzelpreis;Gesamtpreis";
            const csvRows = lineItems.map((item, idx) =>
              [
                item.position ?? idx + 1,
                `"${String(item.article_number ?? "").replace(/"/g, '""')}"`,
                `"${String(item.description ?? "").replace(/"/g, '""')}"`,
                item.quantity ?? "",
                item.unit ?? "",
                item.unit_price ?? "",
                item.total_price ?? "",
              ].join(";")
            );
            const csvContent = [csvHeader, ...csvRows].join("\n");

            const dealerName =
              finalExtractedData.order.dealer?.name ?? null;

            after(async () => {
              try {
                await sendTrialResultEmail({
                  serverApiToken,
                  toEmail: orderMeta.sender_email as string,
                  toName: "",
                  subject: `Bestellung ${finalExtractedData.order.order_number ?? orderId}`,
                  siteUrl,
                  previewToken: orderMeta.preview_token as string,
                  orderSummary: {
                    orderNumber: finalExtractedData.order.order_number ?? null,
                    orderDate: finalExtractedData.order.order_date ?? null,
                    dealerName,
                    itemCount: lineItems.length,
                    totalAmount: (finalExtractedData.order.total_amount as number) ?? null,
                    currency: (finalExtractedData.order.currency as string) ?? null,
                  },
                  lineItems,
                  csvContent,
                });
              } catch (err) {
                console.error("Failed to send trial result email:", err);
              }
            });
          }
        }
      }

      return NextResponse.json({ success: true });
    } catch (extractionError) {
      const errorMessage =
        extractionError instanceof Error
          ? extractionError.message
          : "Unbekannter Extraktionsfehler.";

      console.error(`Extraction failed for order ${orderId}:`, errorMessage);

      await adminClient
        .from("orders")
        .update({
          extraction_status: "failed",
          extraction_error: errorMessage,
          status: "error",
        })
        .eq("id", orderId);

      // --- OPH-16: Send failure email to trial sender ---
      const failureApiToken = process.env.POSTMARK_SERVER_API_TOKEN;
      if (failureApiToken && tenantId) {
        const { data: tenantRow } = await adminClient
          .from("tenants")
          .select("status")
          .eq("id", tenantId)
          .single();

        if (tenantRow?.status === "trial") {
          const { data: orderMeta } = await adminClient
            .from("orders")
            .select("sender_email")
            .eq("id", orderId)
            .single();

          if (orderMeta?.sender_email) {
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

            after(async () => {
              try {
                await sendTrialFailureEmail({
                  serverApiToken: failureApiToken,
                  toEmail: orderMeta.sender_email as string,
                  toName: "",
                  subject: "Bestellung",
                  siteUrl,
                });
              } catch (err) {
                console.error("Failed to send trial failure email:", err);
              }
            });
          }
        }
      }

      return NextResponse.json(
        { success: false, error: `Extraktion fehlgeschlagen: ${errorMessage}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Unexpected error in POST /api/orders/[orderId]/extract:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
