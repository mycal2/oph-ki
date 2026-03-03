import {
  Hash,
  Calendar,
  Package,
  Building2,
  MapPin,
  FileText,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { OrderPreviewData } from "@/lib/types";

interface OrderSummaryCardProps {
  data: OrderPreviewData;
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) return "-";
  try {
    return new Date(isoDate).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

function formatCurrency(amount: number | null, currency: string | null): string {
  if (amount === null) return "-";
  const curr = currency ?? "EUR";
  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: curr,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${curr}`;
  }
}

function formatAddress(address: OrderPreviewData["deliveryAddress"]): string | null {
  if (!address) return null;
  const parts = [
    address.company,
    address.street,
    [address.postal_code, address.city].filter(Boolean).join(" "),
    address.country,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * OPH-16: Read-only order summary card for the magic-link preview page.
 * Displays order number, date, dealer, sender, total, and delivery address.
 */
export function OrderSummaryCard({ data }: OrderSummaryCardProps) {
  const lineItemCount = data.lineItems.length;
  const deliveryAddr = formatAddress(data.deliveryAddress);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" />
          Extrahierte Bestelldaten
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Order Number */}
          <div className="flex items-start gap-2">
            <Hash className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Bestellnummer</p>
              <p className="truncate text-sm font-medium">
                {data.orderNumber ?? "Nicht erkannt"}
              </p>
            </div>
          </div>

          {/* Order Date */}
          <div className="flex items-start gap-2">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Bestelldatum</p>
              <p className="text-sm font-medium">{formatDate(data.orderDate)}</p>
            </div>
          </div>

          {/* Line Items Count */}
          <div className="flex items-start gap-2">
            <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Positionen</p>
              <p className="text-sm font-medium">
                {lineItemCount > 0
                  ? `${lineItemCount} ${lineItemCount === 1 ? "Position" : "Positionen"}`
                  : "Keine Positionen erkannt"}
              </p>
            </div>
          </div>

          {/* Total Amount */}
          <div className="flex items-start gap-2">
            <span className="mt-0.5 w-4 shrink-0 text-center text-sm font-medium text-muted-foreground">
              &euro;
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Gesamtbetrag</p>
              <p className="text-sm font-medium">
                {formatCurrency(data.totalAmount, data.currency)}
              </p>
            </div>
          </div>
        </div>

        {/* Dealer */}
        {data.dealerName && (
          <>
            <Separator />
            <div className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Haendler</p>
                <p className="text-sm font-medium">{data.dealerName}</p>
              </div>
            </div>
          </>
        )}

        {/* Sender / Ordering Company */}
        {data.senderCompany && (
          <>
            <Separator />
            <div className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Absender / Besteller</p>
                <p className="text-sm font-medium">{data.senderCompany}</p>
              </div>
            </div>
          </>
        )}

        {/* Delivery Address */}
        {deliveryAddr && (
          <>
            <Separator />
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Lieferadresse</p>
                <p className="text-sm">{deliveryAddr}</p>
              </div>
            </div>
          </>
        )}

        {/* Notes */}
        {data.notes && (
          <>
            <Separator />
            <div className="min-w-0">
              <p className="mb-1 text-xs text-muted-foreground">Anmerkungen</p>
              <p className="whitespace-pre-wrap text-sm">{data.notes}</p>
            </div>
          </>
        )}

        {/* Extraction date footer */}
        {data.extractedAt && (
          <>
            <Separator />
            <p className="text-xs text-muted-foreground">
              Extrahiert am:{" "}
              {new Date(data.extractedAt).toLocaleDateString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
