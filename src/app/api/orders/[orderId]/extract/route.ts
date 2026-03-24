/** Allow up to 5 minutes for multi-chunk extractions (large Excel files). */
export const maxDuration = 300;

import { after, NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractOrderData } from "@/lib/claude-extraction";
import { normalizeUnits } from "@/lib/unit-normalization";
import { matchArticleNumbers } from "@/lib/article-matching";
import { matchCustomerNumber } from "@/lib/customer-matching";
import { getMappingsForDealer, applyMappings, formatMappingsForPrompt } from "@/lib/dealer-mappings";
import { mimeTypeToFormatType, getColumnMappingProfile, formatColumnMappingForPrompt } from "@/lib/column-mappings";
import { sendTrialResultEmail, sendTrialFailureEmail, sendOrderResultEmail, sendOrderFailureEmail, sendPlatformErrorNotification } from "@/lib/postmark";
import { calculateConfidenceScore } from "@/lib/confidence-score";
import { generateExportContent } from "@/lib/erp-transformations";
import { generateFilename } from "@/lib/export-utils";
import type { AppMetadata, ApiResponse, CanonicalLineItem, CanonicalOrderData, ErpColumnMappingExtended, ExportFormat, OutputFormatSchemaColumn } from "@/lib/types";

/** Max extraction attempts per order before rejecting further retries. */
const MAX_EXTRACTION_ATTEMPTS = 5;

/** Timing-safe string comparison to prevent timing attacks on secrets. */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Generate a standard CSV from extracted line items (used as fallback for email attachment). */
function generateStandardCsv(
  lineItems: CanonicalLineItem[],
  extractedData: CanonicalOrderData
): string {
  const orderCurrency = (extractedData.order.currency as string) ?? "";
  const csvHeader = "Pos;Artikelnummer;Bezeichnung;Menge;Einheit;Einzelpreis;Gesamtpreis;Währung";
  const csvRows = lineItems.map((item, idx) =>
    [
      item.position ?? idx + 1,
      `"${String(item.article_number ?? "").replace(/"/g, '""')}"`,
      `"${String(item.description ?? "").replace(/"/g, '""')}"`,
      item.quantity ?? "",
      item.unit ?? "",
      item.unit_price ?? "",
      item.total_price ?? "",
      orderCurrency,
    ].join(";")
  );
  return [csvHeader, ...csvRows].join("\n");
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
        { success: false, error: "Ungültige Bestellungs-ID." },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    let tenantId: string | null = null;
    let isPlatformAdmin = false;

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
      isPlatformAdmin = appMetadata?.role === "platform_admin";

      if (!tenantId && !isPlatformAdmin) {
        return NextResponse.json(
          { success: false, error: "Kein Mandant zugewiesen." },
          { status: 403 }
        );
      }
    }

    // --- Fetch order and check concurrency ---
    let orderQuery = adminClient
      .from("orders")
      .select("id, tenant_id, status, extraction_status, extraction_attempts, dealer_id, recognition_confidence, subject")
      .eq("id", orderId);

    if (tenantId && !isPlatformAdmin) {
      orderQuery = orderQuery.eq("tenant_id", tenantId);
    }

    const { data: order, error: orderError } = await orderQuery.single();

    if (orderError || !order) {
      return NextResponse.json(
        { success: false, error: "Bestellung nicht gefunden." },
        { status: 404 }
      );
    }

    // For platform_admin, use the order's tenant_id (admin's own tenant may differ)
    if (isPlatformAdmin) {
      tenantId = order.tenant_id as string;
    }

    // Concurrency guard: reject if already processing
    if (order.extraction_status === "processing") {
      return NextResponse.json(
        { success: false, error: "Extraktion läuft bereits." },
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
          extraction_error: "Keine Dateien für Extraktion gefunden.",
          status: "error",
        })
        .eq("id", orderId);

      return NextResponse.json(
        { success: false, error: "Keine Dateien für Extraktion gefunden." },
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

    // --- OPH-25: Read order subject for extraction context ---
    const orderSubject = (order.subject as string | null) ?? null;

    // --- Call Claude extraction ---
    try {
      const result = await extractOrderData({
        orderId,
        files: fileContents,
        dealer: dealerInfo,
        mappingsContext,
        columnMappingContext,
        emailSubject: orderSubject,
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
              emailSubject: orderSubject,
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

      // --- OPH-20: Server-side unit normalization fallback ---
      // Ensures all units are German standard terms even if Claude returned
      // unexpected abbreviations. Also marks truly unknown units with "(unbekannt)".
      finalExtractedData = normalizeUnits(finalExtractedData);

      // --- OPH-40: Article number matching against tenant catalog ---
      if (tenantId) {
        try {
          const matchedItems = await matchArticleNumbers(
            adminClient,
            finalExtractedData.order.line_items,
            tenantId
          );
          finalExtractedData = {
            ...finalExtractedData,
            order: {
              ...finalExtractedData.order,
              line_items: matchedItems,
            },
          };
        } catch (matchError) {
          // Non-critical: log but don't fail extraction
          console.error("Error during article number matching:", matchError);
        }
      }

      // --- OPH-47: Customer number matching against tenant customer catalog ---
      if (tenantId) {
        try {
          const matchedSender = await matchCustomerNumber(
            adminClient,
            finalExtractedData.order.sender,
            tenantId
          );
          if (matchedSender) {
            finalExtractedData = {
              ...finalExtractedData,
              order: {
                ...finalExtractedData.order,
                sender: matchedSender,
              },
            };
          }
        } catch (customerMatchError) {
          // Non-critical: log but don't fail extraction
          console.error("Error during customer number matching:", customerMatchError);
        }
      }

      // --- OPH-49: Auto-create Kundenstamm entry for dealer-linked orders ---
      // EC-5: Only auto-create when dealer_id is definitively resolved (confidence >= 80)
      const effectiveConfidence = (aiDealerUpdate.recognition_confidence as number)
        ?? (order.recognition_confidence as number)
        ?? 0;
      if (resolvedDealerId && tenantId && effectiveConfidence >= 80) {
        try {
          // Check if this dealer already has a customer_catalog entry for this tenant
          const { data: existingEntry } = await adminClient
            .from("customer_catalog")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("dealer_id", resolvedDealerId)
            .maybeSingle();

          if (!existingEntry) {
            // Fetch dealer data for populating the entry
            const { data: dealer } = await adminClient
              .from("dealers")
              .select("name, known_sender_addresses, street, postal_code, city, country")
              .eq("id", resolvedDealerId)
              .single();

            if (dealer) {
              const dealerName = dealer.name as string;

              // EC-1: Check if a manual entry with the same company_name already exists (case-insensitive)
              const { data: nameMatch } = await adminClient
                .from("customer_catalog")
                .select("id")
                .eq("tenant_id", tenantId)
                .ilike("company_name", dealerName)
                .maybeSingle();

              if (!nameMatch) {
                const dealerIdShort = resolvedDealerId.substring(0, 8);
                const addresses = dealer.known_sender_addresses as string[] | null;
                const dealerEmail = addresses && addresses.length > 0 ? addresses[0] : null;

                await adminClient.from("customer_catalog").insert({
                  tenant_id: tenantId,
                  dealer_id: resolvedDealerId,
                  customer_number: `H-${dealerIdShort}`,
                  company_name: dealerName,
                  street: (dealer.street as string) ?? null,
                  postal_code: (dealer.postal_code as string) ?? null,
                  city: (dealer.city as string) ?? null,
                  country: (dealer.country as string) ?? null,
                  email: dealerEmail,
                  keywords: dealerName,
                });
              }
            }
          }
        } catch (autoCreateError) {
          // Non-critical: log but don't fail extraction
          console.error("Error auto-creating customer catalog entry:", autoCreateError);
        }
      }

      // --- OPH-25: Persist parsed EML subject if order doesn't already have one ---
      const emlSubjectUpdate: Record<string, unknown> = {};
      if (!orderSubject && result.parsedEmailSubject) {
        emlSubjectUpdate.subject = result.parsedEmailSubject.slice(0, 500);
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
          ...emlSubjectUpdate,
        })
        .eq("id", orderId);

      // --- OPH-28: Calculate confidence score if output format is configured ---
      // OPH-29: Resolve ERP config and output format via tenant's erp_config_id
      if (tenantId) {
        try {
          const { data: tenantForConfig } = await adminClient
            .from("tenants")
            .select("erp_config_id")
            .eq("id", tenantId)
            .single();

          const configId = tenantForConfig?.erp_config_id as string | null;

          const { data: outputFormat } = configId
            ? await adminClient
                .from("tenant_output_formats")
                .select("detected_schema")
                .eq("erp_config_id", configId)
                .maybeSingle()
            : await adminClient
                .from("tenant_output_formats")
                .select("detected_schema")
                .eq("tenant_id", tenantId)
                .maybeSingle();

          if (outputFormat?.detected_schema) {
            let erpMappings: ErpColumnMappingExtended[] | null = null;
            if (configId) {
              const { data: erpConfig } = await adminClient
                .from("erp_configs")
                .select("column_mappings")
                .eq("id", configId)
                .maybeSingle();
              erpMappings = erpConfig
                ? (erpConfig.column_mappings as ErpColumnMappingExtended[])
                : null;
            }

            const scoreData = calculateConfidenceScore(
              finalExtractedData,
              outputFormat.detected_schema as OutputFormatSchemaColumn[],
              erpMappings
            );

            await adminClient
              .from("orders")
              .update({
                output_format_confidence_score: scoreData.score,
                output_format_missing_columns: scoreData.missing_columns,
              })
              .eq("id", orderId);
          }
        } catch (scoreError) {
          // Non-critical: log but don't fail extraction
          console.error("Error calculating confidence score:", scoreError);
        }
      }

      // --- OPH-16: Trial post-processing (CSV + result email) ---
      // --- OPH-13: Non-trial result email with notification toggle ---
      const serverApiToken = process.env.POSTMARK_SERVER_API_TOKEN;
      if (serverApiToken && tenantId) {
        // OPH-35: Fetch granular email notification settings
        const { data: tenantRow } = await adminClient
          .from("tenants")
          .select("status, slug, email_results_enabled, email_results_confidence_enabled, email_results_format, erp_config_id")
          .eq("id", tenantId)
          .single();

        if (tenantRow?.status === "trial") {
          // OPH-16: Trial flow — always send result email to sender
          const { data: orderMeta } = await adminClient
            .from("orders")
            .select("sender_email, preview_token")
            .eq("id", orderId)
            .single();

          if (orderMeta?.sender_email && orderMeta?.preview_token) {
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
            const lineItems = finalExtractedData.order.line_items ?? [];

            // Generate simple CSV (no ERP mapping needed for trial)
            const trialCurrency = (finalExtractedData.order.currency as string) ?? "";
            const csvHeader = "Pos;Artikelnummer;Bezeichnung;Menge;Einheit;Einzelpreis;Gesamtpreis;Währung";
            const csvRows = lineItems.map((item, idx) =>
              [
                item.position ?? idx + 1,
                `"${String(item.article_number ?? "").replace(/"/g, '""')}"`,
                `"${String(item.description ?? "").replace(/"/g, '""')}"`,
                item.quantity ?? "",
                item.unit ?? "",
                item.unit_price ?? "",
                item.total_price ?? "",
                trialCurrency,
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
        } else if (tenantRow?.email_results_enabled) {
          // OPH-35: Non-trial tenant with results email enabled
          const { data: orderMeta } = await adminClient
            .from("orders")
            .select("uploaded_by, sender_email, subject")
            .eq("id", orderId)
            .single();

          if (orderMeta) {
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
            const lineItems = finalExtractedData.order.line_items ?? [];
            const isReExtraction = currentAttempts > 0; // currentAttempts was incremented before extraction

            // OPH-35: Generate attachment in tenant format or standard CSV
            let csvContent: string;
            let attachmentFilename: string | undefined;
            const useTenantFormat = tenantRow?.email_results_format === "tenant_format" && tenantRow?.erp_config_id;

            if (useTenantFormat) {
              // Fetch ERP config for tenant-specific format
              const { data: erpConfig } = await adminClient
                .from("erp_configs")
                .select("*")
                .eq("id", tenantRow.erp_config_id as string)
                .maybeSingle();

              if (erpConfig) {
                const effectiveFormat = (erpConfig.format as ExportFormat) ?? "csv";
                const columnMappings = (erpConfig.column_mappings as ErpColumnMappingExtended[]) ?? [];
                const tenantSlug = (tenantRow.slug as string) ?? "export";
                const { content } = generateExportContent(
                  finalExtractedData,
                  effectiveFormat,
                  columnMappings,
                  {
                    separator: (erpConfig.separator as string) ?? ";",
                    quoteChar: (erpConfig.quote_char as string) ?? '"',
                    lineEnding: (erpConfig.line_ending as string) ?? "CRLF",
                    decimalSeparator: (erpConfig.decimal_separator as string) ?? ".",
                    xmlTemplate: (erpConfig.xml_template as string) ?? null,
                  }
                );
                csvContent = content;
                attachmentFilename = generateFilename(tenantSlug, finalExtractedData.order.order_number, effectiveFormat);
              } else {
                // Fallback to standard CSV if ERP config not found
                csvContent = generateStandardCsv(lineItems, finalExtractedData);
              }
            } else {
              csvContent = generateStandardCsv(lineItems, finalExtractedData);
            }

            const dealerName = finalExtractedData.order.dealer?.name ?? null;

            after(async () => {
              try {
                // Resolve recipient email
                let toEmail: string | null = null;
                let toName = "";

                if (orderMeta.uploaded_by) {
                  const { data: { user: submitter } } = await adminClient.auth.admin.getUserById(
                    orderMeta.uploaded_by as string
                  );
                  if (submitter?.email) {
                    toEmail = submitter.email;
                    toName = [submitter.user_metadata?.first_name, submitter.user_metadata?.last_name]
                      .filter(Boolean)
                      .join(" ");
                  }
                }

                if (!toEmail && orderMeta.sender_email) {
                  toEmail = orderMeta.sender_email as string;
                }

                if (!toEmail) return;

                // OPH-35: Only include confidence score if toggle is enabled
                const includeConfidence = tenantRow?.email_results_confidence_enabled !== false;
                await sendOrderResultEmail({
                  serverApiToken,
                  toEmail,
                  toName,
                  orderId,
                  siteUrl,
                  isReExtraction,
                  emailSubject: (orderMeta.subject as string | null) ?? orderSubject ?? null,
                  customerNumber: ((finalExtractedData.order as unknown as Record<string, unknown>).customer_number as string | null) ?? null,
                  confidenceScore: includeConfidence
                    ? (finalExtractedData.extraction_metadata?.confidence_score ?? null)
                    : null,
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
                  attachmentFilename,
                });
              } catch (err) {
                console.error("Failed to send order result email:", err);
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
      // --- OPH-13: Send failure email to non-trial tenant submitter ---
      const failureApiToken = process.env.POSTMARK_SERVER_API_TOKEN;
      if (failureApiToken && tenantId) {
        // OPH-35: Fetch granular email notification settings for failure path
        const { data: failureTenantRow } = await adminClient
          .from("tenants")
          .select("status, email_results_enabled")
          .eq("id", tenantId)
          .single();

        if (failureTenantRow?.status === "trial") {
          // OPH-16: Trial flow — always send failure email to sender
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
        } else if (failureTenantRow?.email_results_enabled) {
          // OPH-35: Non-trial tenant with results email enabled
          const { data: orderMeta } = await adminClient
            .from("orders")
            .select("uploaded_by, sender_email")
            .eq("id", orderId)
            .single();

          if (orderMeta) {
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

            after(async () => {
              try {
                let toEmail: string | null = null;
                let toName = "";

                if (orderMeta.uploaded_by) {
                  const { data: { user: submitter } } = await adminClient.auth.admin.getUserById(
                    orderMeta.uploaded_by as string
                  );
                  if (submitter?.email) {
                    toEmail = submitter.email;
                    toName = [submitter.user_metadata?.first_name, submitter.user_metadata?.last_name]
                      .filter(Boolean)
                      .join(" ");
                  }
                }

                if (!toEmail && orderMeta.sender_email) {
                  toEmail = orderMeta.sender_email as string;
                }

                if (!toEmail) return;

                await sendOrderFailureEmail({
                  serverApiToken: failureApiToken,
                  toEmail,
                  toName,
                  orderId,
                  siteUrl,
                });
              } catch (err) {
                console.error("Failed to send order failure email:", err);
              }
            });
          }
        }
      }

      // --- OPH-24: Send platform admin error notification ---
      if (failureApiToken && tenantId) {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

        after(async () => {
          try {
            const { data: tenantInfo } = await adminClient
              .from("tenants")
              .select("name, slug")
              .eq("id", tenantId)
              .single();

            await sendPlatformErrorNotification({
              serverApiToken: failureApiToken,
              adminClient,
              errorType: "Extraktion fehlgeschlagen",
              tenantName: (tenantInfo?.name as string) ?? null,
              tenantSlug: (tenantInfo?.slug as string) ?? null,
              orderId,
              errorMessage,
              siteUrl,
            });
          } catch (err) {
            console.error("Failed to send platform error notification:", err);
          }
        });
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
