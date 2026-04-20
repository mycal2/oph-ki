"use client";

import { useState } from "react";
import { Calendar, FileText, Mail, Smartphone, Trash2, User } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { DeleteOrderDialog } from "./delete-order-dialog";
import type { OrderWithDealer, OrderStatus, DealerOverrideResponse, DealerResetResponse, UserRole } from "@/lib/types";

interface OrderDetailHeaderProps {
  order: OrderWithDealer;
  /** Whether this order was previously exported (has last_exported_at). */
  wasExported?: boolean;
  /** Called after a successful dealer override with the full response. */
  onDealerChanged?: (result: DealerOverrideResponse) => void;
  /** OPH-66: Called after a successful dealer reset. */
  onDealerReset?: (result: DealerResetResponse) => void;
  /** Called after a successful export. */
  onExported?: () => void;
  /** Called after a successful order deletion. */
  onDeleted?: () => void;
  /** Current user's role — used to show/hide the delete button. */
  userRole?: UserRole;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  uploaded: "Hochgeladen",
  processing: "Wird verarbeitet",
  extracted: "Extrahiert",
  review: "In Prüfung",
  checked: "Geprüft",
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
  checked: "outline",
  approved: "default",
  exported: "secondary",
  error: "destructive",
};

/** OPH-90: Extra Tailwind classes for specific statuses (e.g. blue for "checked"). */
const STATUS_CLASSNAMES: Partial<Record<OrderStatus, string>> = {
  checked: "border-blue-300 bg-blue-50 text-blue-700",
};

/** OPH-20: ISO 639-1 code to full German language name for tooltip display. */
const LANGUAGE_NAMES: Record<string, string> = {
  DE: "Deutsch",
  EN: "Englisch",
  FR: "Französisch",
  ES: "Spanisch",
  CS: "Tschechisch",
  PL: "Polnisch",
  IT: "Italienisch",
  NL: "Niederländisch",
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
  onDealerReset,
  onExported,
  onDeleted,
  userRole,
}: OrderDetailHeaderProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const primaryFile = order.files[0];
  const fileName = primaryFile?.original_filename ?? "Unbekannte Datei";
  const canDelete =
    (userRole === "tenant_admin" || userRole === "platform_admin") &&
    order.status !== "processing";

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
              {(order.uploaded_by_name || order.source === "salesforce_app") && (
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  {order.uploaded_by_name ?? "Unbekannt"}
                </span>
              )}
              {order.source === "salesforce_app" && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <Smartphone className="h-3 w-3" />
                  Salesforce App
                </Badge>
              )}
              {order.files.length > 1 && (
                <span className="text-xs">
                  +{order.files.length - 1} weitere{" "}
                  {order.files.length - 1 === 1 ? "Datei" : "Dateien"}
                </span>
              )}
            </div>
            {/* OPH-25: Show email subject if present */}
            {order.subject && (
              <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span className="line-clamp-2">{order.subject}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start">
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleteDialogOpen(true)}
                aria-label="Bestellung löschen"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
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
              className={STATUS_CLASSNAMES[order.status] ?? ""}
            >
              {STATUS_LABELS[order.status]}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Dealer Section */}
        <div className="space-y-1">
          <p className="text-sm font-medium">Händler</p>
          <DealerSection
            orderId={order.id}
            dealerId={order.dealer_id}
            dealerName={order.dealer_name}
            confidence={order.recognition_confidence}
            recognitionMethod={order.recognition_method}
            orderUpdatedAt={order.updated_at}
            onDealerChanged={onDealerChanged}
            onDealerReset={onDealerReset}
            isPlatformAdmin={userRole === "platform_admin"}
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
          resetByName={order.reset_by_name}
          resetAt={order.dealer_reset_at}
        />
      </CardContent>

      {canDelete && onDeleted && (
        <DeleteOrderDialog
          orderId={order.id}
          fileName={fileName}
          fileCount={order.files.length}
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onDeleted={onDeleted}
        />
      )}
    </Card>
  );
}
