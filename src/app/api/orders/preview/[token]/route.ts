import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * OPH-16: Public API endpoint to fetch order data by preview token.
 * No authentication required -- the token itself serves as authorization.
 *
 * GET /api/orders/preview/[token]
 *
 * Returns:
 * - { status: "ok", data: OrderPreviewData } when token is valid
 * - { status: "expired", message: "..." } when token has expired
 * - { status: "not_found", message: "..." } when token is invalid
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || token.length < 32) {
      return NextResponse.json(
        { status: "not_found", message: "Ungueltiger Vorschau-Link." },
        { status: 200 }
      );
    }

    // Use service role client (no user session for public endpoint)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Look up the order by preview_token
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(`
        id,
        preview_token_expires_at,
        extracted_data,
        reviewed_data,
        dealer_id,
        dealers:dealer_id (name)
      `)
      .eq("preview_token", token)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Preview token lookup error:", error);
      return NextResponse.json(
        { status: "not_found", message: "Vorschau konnte nicht geladen werden." },
        { status: 200 }
      );
    }

    if (!order) {
      return NextResponse.json(
        { status: "not_found", message: "Vorschau-Link ist ungueltig." },
        { status: 200 }
      );
    }

    // Check if the token has expired
    if (order.preview_token_expires_at) {
      const expiresAt = new Date(order.preview_token_expires_at);
      if (expiresAt.getTime() < Date.now()) {
        return NextResponse.json(
          { status: "expired", message: "Diese Vorschau ist nicht mehr verfuegbar." },
          { status: 200 }
        );
      }
    }

    // Use reviewed_data if available, otherwise fall back to extracted_data
    const extractedData = order.reviewed_data ?? order.extracted_data;

    if (!extractedData) {
      return NextResponse.json(
        {
          status: "not_found",
          message: "Fuer diese Bestellung liegen noch keine extrahierten Daten vor.",
        },
        { status: 200 }
      );
    }

    // Type assertion for the canonical data structure
    const canonical = extractedData as {
      order: {
        order_number: string | null;
        order_date: string | null;
        dealer: { name: string | null };
        sender: { company_name: string | null } | null;
        delivery_address: {
          company: string | null;
          street: string | null;
          city: string | null;
          postal_code: string | null;
          country: string | null;
        } | null;
        line_items: Array<{
          position: number;
          article_number: string | null;
          description: string;
          quantity: number;
          unit: string | null;
          unit_price: number | null;
          total_price: number | null;
          currency: string | null;
        }>;
        total_amount: number | null;
        currency: string | null;
        notes: string | null;
      };
      extraction_metadata: {
        extracted_at: string;
      };
    };

    // Resolve dealer name from join or from extracted data
    // Supabase join via FK returns a single object (not array) for belongs-to relations
    const dealerJoin = order.dealers as unknown as { name: string } | null;
    const dealerName =
      dealerJoin?.name ??
      canonical.order.dealer?.name ??
      null;

    return NextResponse.json(
      {
        status: "ok",
        data: {
          orderId: order.id,
          orderNumber: canonical.order.order_number,
          orderDate: canonical.order.order_date,
          dealerName,
          senderCompany: canonical.order.sender?.company_name ?? null,
          deliveryAddress: canonical.order.delivery_address,
          lineItems: canonical.order.line_items,
          totalAmount: canonical.order.total_amount,
          currency: canonical.order.currency,
          notes: canonical.order.notes,
          extractedAt: canonical.extraction_metadata?.extracted_at ?? null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Preview API error:", error);
    return NextResponse.json(
      { status: "not_found", message: "Ein Fehler ist aufgetreten." },
      { status: 200 }
    );
  }
}
