"use client";

import Link from "next/link";
import {
  Package,
  MapPin,
  Calendar,
  Hash,
  BarChart3,
  FileText,
  Cpu,
  AlertTriangle,
  RefreshCw,
  Loader2,
  ClipboardCheck,
  Building2,
  Mail,
  Phone,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CanonicalOrderData, ExtractionStatus } from "@/lib/types";

interface ExtractionResultPreviewProps {
  extractionStatus: ExtractionStatus | null;
  extractedData: CanonicalOrderData | null;
  extractionError: string | null;
  /** Whether the data is currently being polled/refreshed. */
  isPolling?: boolean;
  /** Callback to trigger a manual retry of the extraction. */
  onRetryExtraction?: () => void;
  /** Whether a retry is currently in progress. */
  isRetrying?: boolean;
  /** Order ID for the "Zur Pruefung" link. */
  orderId?: string;
  /** Current order status — used to show waiting state for freshly uploaded orders. */
  orderStatus?: string | null;
}

function formatDate(isoDate: string | null, includeTime = false): string {
  if (!isoDate) return "-";
  try {
    const options: Intl.DateTimeFormatOptions = {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    };
    return new Date(isoDate).toLocaleDateString("de-DE", options);
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

function formatAddress(address: CanonicalOrderData["order"]["delivery_address"]): string | null {
  if (!address) return null;
  const parts = [
    address.company,
    address.street,
    [address.postal_code, address.city].filter(Boolean).join(" "),
    address.country,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function confidenceColor(score: number): string {
  if (score >= 0.8) return "text-green-700 dark:text-green-400";
  if (score >= 0.5) return "text-yellow-700 dark:text-yellow-400";
  return "text-red-700 dark:text-red-400";
}

function confidenceLabel(score: number): string {
  if (score >= 0.8) return "Hoch";
  if (score >= 0.5) return "Mittel";
  return "Niedrig";
}

/**
 * Displays a preview of the AI extraction result.
 * Handles all states: pending/processing (skeleton), extracted (data), failed (error).
 */
export function ExtractionResultPreview({
  extractionStatus,
  extractedData,
  extractionError,
  isPolling = false,
  onRetryExtraction,
  isRetrying = false,
  orderId,
  orderStatus,
}: ExtractionResultPreviewProps) {
  // Waiting state: order uploaded but extraction hasn't started yet
  if (!extractionStatus && (orderStatus === "uploaded" || orderStatus === "processing")) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            Extraktion wird gestartet...
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Das System bereitet die KI-Extraktion vor. Dies kann einige Sekunden dauern.
          </p>
          {onRetryExtraction && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetryExtraction}
              disabled={isRetrying}
              className="gap-2"
            >
              {isRetrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Extraktion manuell starten
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Pending or processing state: show skeleton
  if (
    extractionStatus === "pending" ||
    extractionStatus === "processing"
  ) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            Extraktion laeuft...
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Die KI verarbeitet Ihre Dokumente. Dies dauert in der Regel weniger als 30 Sekunden.
          </p>
          <div className="space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-24 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Failed state: show error with retry option
  if (extractionStatus === "failed") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Extraktion fehlgeschlagen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Fehler bei der Datenextraktion</AlertTitle>
            <AlertDescription>
              {extractionError ?? "Ein unbekannter Fehler ist aufgetreten."}
            </AlertDescription>
          </Alert>
          {onRetryExtraction && (
            <Button
              variant="outline"
              onClick={onRetryExtraction}
              disabled={isRetrying}
              className="gap-2"
            >
              {isRetrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Extraktion erneut starten
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // No extraction status or no data (order just uploaded, extraction not started)
  if (!extractionStatus || !extractedData) {
    return null;
  }

  // Extracted state: show the extraction result preview
  const { order, extraction_metadata: meta } = extractedData;
  const lineItemCount = order.line_items.length;
  const deliveryAddr = formatAddress(order.delivery_address);
  const confidenceScore = meta.confidence_score;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-green-600" />
            Extrahierte Bestelldaten
            {isPolling && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={`gap-1 text-xs ${confidenceColor(confidenceScore)}`}
                >
                  <BarChart3 className="h-3 w-3" />
                  Konfidenz: {confidenceLabel(confidenceScore)} ({Math.round(confidenceScore * 100)}%)
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  Wie sicher die KI bei der Extraktion ist. Hohe Konfidenz bedeutet
                  zuverlaessigere Daten.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Order Number */}
          <div className="flex items-start gap-2">
            <Hash className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Bestellnummer</p>
              <p className="text-sm font-medium truncate">
                {order.order_number ?? "Nicht erkannt"}
              </p>
            </div>
          </div>

          {/* Order Date */}
          <div className="flex items-start gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Bestelldatum</p>
              <p className="text-sm font-medium">
                {formatDate(order.order_date)}
              </p>
            </div>
          </div>

          {/* Line Items Count */}
          <div className="flex items-start gap-2">
            <Package className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
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
            <span className="text-muted-foreground mt-0.5 shrink-0 text-sm font-medium w-4 text-center">
              &euro;
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Gesamtbetrag</p>
              <p className="text-sm font-medium">
                {formatCurrency(order.total_amount, order.currency)}
              </p>
            </div>
          </div>
        </div>

        {/* Sender / Ordering Company */}
        {order.sender?.company_name && (
          <>
            <Separator />
            <div className="flex items-start gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0 space-y-1">
                <p className="text-xs text-muted-foreground">Absender / Besteller</p>
                <p className="text-sm font-medium">{order.sender.company_name}</p>
                {(order.sender.street || order.sender.city) && (
                  <p className="text-sm text-muted-foreground">
                    {[
                      order.sender.street,
                      [order.sender.postal_code, order.sender.city].filter(Boolean).join(" "),
                      order.sender.country,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {order.sender.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {order.sender.email}
                    </span>
                  )}
                  {order.sender.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {order.sender.phone}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    Kd.-Nr.: {order.sender.customer_number?.trim() || "\u2014"}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Delivery Address */}
        {deliveryAddr && (
          <>
            <Separator />
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Lieferadresse</p>
                <p className="text-sm">{deliveryAddr}</p>
              </div>
            </div>
          </>
        )}

        {/* Notes */}
        {order.notes && (
          <>
            <Separator />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground mb-1">Anmerkungen</p>
              <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
            </div>
          </>
        )}

        {/* Metadata Footer */}
        <Separator />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Cpu className="h-3 w-3" />
            Modell: {meta.model}
          </span>
          <span>
            Extrahiert am:{" "}
            {formatDate(meta.extracted_at, true)}
          </span>
          {meta.dealer_hints_applied && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              Haendler-Hinweise angewandt
            </Badge>
          )}
          {meta.column_mapping_applied && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              Spalten-Mapping angewandt
            </Badge>
          )}
          <span>
            Tokens: {meta.input_tokens.toLocaleString("de-DE")} ein / {meta.output_tokens.toLocaleString("de-DE")} aus
          </span>
        </div>

        {/* Line Items Table */}
        {lineItemCount > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium mb-2">
                Positionen ({lineItemCount})
              </p>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground w-10">
                        #
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground hidden sm:table-cell">
                        Art.-Nr.
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Beschreibung
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                        Menge
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground hidden md:table-cell">
                        Einzelpreis
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground hidden sm:table-cell">
                        Gesamt
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.line_items.map((item) => (
                      <tr key={item.position} className="border-b last:border-0">
                        <td className="px-3 py-2 text-muted-foreground">
                          {item.position}
                        </td>
                        <td className="px-3 py-2 hidden sm:table-cell font-mono text-xs">
                          {item.article_number ?? (
                            <span className="text-muted-foreground italic">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 max-w-[200px] sm:max-w-[300px] truncate">
                          {item.description || (
                            <span className="text-muted-foreground italic">
                              Keine Beschreibung
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {item.quantity}
                          {item.unit && (
                            <span className="text-muted-foreground ml-1 text-xs">
                              {item.unit}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right hidden md:table-cell whitespace-nowrap">
                          {formatCurrency(item.unit_price, item.currency ?? order.currency)}
                        </td>
                        <td className="px-3 py-2 text-right hidden sm:table-cell whitespace-nowrap font-medium">
                          {formatCurrency(item.total_price, item.currency ?? order.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {order.total_amount !== null && (
                    <tfoot>
                      <tr className="bg-muted/30 font-medium">
                        <td
                          colSpan={5}
                          className="px-3 py-2 text-right hidden sm:table-cell"
                        >
                          Gesamt
                        </td>
                        <td
                          colSpan={3}
                          className="px-3 py-2 text-right sm:hidden"
                        >
                          Gesamt
                        </td>
                        <td className="px-3 py-2 text-right hidden sm:table-cell">
                          {formatCurrency(order.total_amount, order.currency)}
                        </td>
                        <td className="px-3 py-2 text-right sm:hidden">
                          {formatCurrency(order.total_amount, order.currency)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </>
        )}

        {/* Empty line items warning */}
        {lineItemCount === 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Keine Bestellpositionen erkannt</AlertTitle>
            <AlertDescription>
              Die KI konnte keine Bestellpositionen im Dokument identifizieren.
              Bitte pruefen Sie das Originaldokument.
            </AlertDescription>
          </Alert>
        )}

        {/* Review button */}
        {orderId && (
          <>
            <Separator />
            <div className="flex justify-end">
              <Button asChild className="gap-1.5">
                <Link href={`/orders/${orderId}/review`}>
                  <ClipboardCheck className="h-4 w-4" />
                  Zur Pruefung
                </Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
