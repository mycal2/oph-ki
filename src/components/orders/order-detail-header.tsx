"use client";

import { Calendar, FileText, User } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DealerSection } from "./dealer/dealer-section";
import { RecognitionAuditLine } from "./dealer/recognition-audit-line";
import { ExtractionStatusBadge } from "./extraction-status-badge";
import { ExportButton } from "./export/export-button";
import type { OrderWithDealer, OrderStatus, DealerOverrideResponse } from "@/lib/types";

interface OrderDetailHeaderProps {
  order: OrderWithDealer;
  /** Whether this order was previously exported (has last_exported_at). */
  wasExported?: boolean;
  /** Called after a successful dealer override with the full response. */
  onDealerChanged?: (result: DealerOverrideResponse) => void;
  /** Called after a successful export. */
  onExported?: () => void;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  uploaded: "Hochgeladen",
  processing: "Wird verarbeitet",
  extracted: "Extrahiert",
  review: "In Pruefung",
  approved: "Freigegeben",
  exported: "Exportiert",
  error: "Fehler",
};

const STATUS_VARIANTS: Record<
  OrderStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  uploaded: "secondary",
  processing: "default",
  extracted: "outline",
  review: "default",
  approved: "default",
  exported: "secondary",
  error: "destructive",
};

/** OPH-20: ISO 639-1 code to full German language name for tooltip display. */
const LANGUAGE_NAMES: Record<string, string> = {
  DE: "Deutsch",
  EN: "Englisch",
  FR: "Franzoesisch",
  ES: "Spanisch",
  CS: "Tschechisch",
  PL: "Polnisch",
  IT: "Italienisch",
  NL: "Niederlaendisch",
  PT: "Portugiesisch",
};

/**
 * OPH-20: Renders the detected document language as a small neutral badge.
 * Only shown when `document_language` is present (backwards-compatible).
 */
function LanguageBadge({ code }: { code: string | null | undefined }) {
  if (!code) return null;

  const upper = code.toUpperCase();
  const isKnown = upper in LANGUAGE_NAMES;
  const languageName = LANGUAGE_NAMES[upper] ?? "Unbekannte Sprache";
  const displayCode = isKnown ? upper : "?";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="ml-1.5 text-[10px] px-1.5 py-0 font-mono tracking-wide shrink-0"
            aria-label={`Dokumentsprache: ${languageName}`}
          >
            {displayCode}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">Dokumentsprache: {languageName}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Displays the order header with file info, status, and dealer recognition section.
 */
export function OrderDetailHeader({
  order,
  wasExported = false,
  onDealerChanged,
  onExported,
}: OrderDetailHeaderProps) {
  const primaryFile = order.files[0];
  const fileName = primaryFile?.original_filename ?? "Unbekannte Datei";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
              <span className="truncate">{fileName}</span>
              <LanguageBadge code={order.extracted_data?.document_language} />
            </CardTitle>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(order.created_at)}
              </span>
              {order.uploaded_by_name && (
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  {order.uploaded_by_name}
                </span>
              )}
              {order.files.length > 1 && (
                <span className="text-xs">
                  +{order.files.length - 1} weitere{" "}
                  {order.files.length - 1 === 1 ? "Datei" : "Dateien"}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start">
            <ExportButton
              orderId={order.id}
              orderStatus={order.status}
              wasExported={wasExported}
              onExported={onExported}
            />
            <ExtractionStatusBadge
              status={order.extraction_status}
              errorMessage={order.extraction_error}
            />
            <Badge
              variant={STATUS_VARIANTS[order.status]}
            >
              {STATUS_LABELS[order.status]}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Dealer Section */}
        <div className="space-y-1">
          <p className="text-sm font-medium">Haendler</p>
          <DealerSection
            orderId={order.id}
            dealerId={order.dealer_id}
            dealerName={order.dealer_name}
            confidence={order.recognition_confidence}
            recognitionMethod={order.recognition_method}
            orderUpdatedAt={order.updated_at}
            onDealerChanged={onDealerChanged}
          />
          {(order.dealer_street || order.dealer_city || order.dealer_country) && (
            <p className="text-xs text-muted-foreground ml-0.5">
              {[
                order.dealer_street,
                [order.dealer_postal_code, order.dealer_city].filter(Boolean).join(" "),
                order.dealer_country,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
        </div>

        {/* Recognition Audit */}
        <RecognitionAuditLine
          recognitionMethod={order.recognition_method}
          confidence={order.recognition_confidence}
          overriddenByName={order.overridden_by_name}
          overriddenAt={order.dealer_overridden_at}
          overrideReason={order.override_reason}
        />
      </CardContent>
    </Card>
  );
}
