"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ExportDialog } from "./export-dialog";
import type { OrderStatus } from "@/lib/types";

interface ExportButtonProps {
  /** The order ID to export. */
  orderId: string;
  /** Current order status. */
  orderStatus: OrderStatus;
  /** Whether this order was already exported (has last_exported_at). */
  wasExported: boolean;
  /** Called after a successful export to update parent state. */
  onExported?: () => void;
}

/** Statuses that allow export. */
const EXPORTABLE_STATUSES: OrderStatus[] = ["approved", "exported"];

/**
 * Export button that opens the export dialog.
 * Only visible and enabled for "approved" and "exported" orders.
 */
export function ExportButton({
  orderId,
  orderStatus,
  wasExported,
  onExported,
}: ExportButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const isExportable = EXPORTABLE_STATUSES.includes(orderStatus);

  if (!isExportable) {
    return null;
  }

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(true)}
              className="gap-1.5"
              aria-label="Bestellung exportieren"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {wasExported ? "Erneut exportieren" : "Exportieren"}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {wasExported
                ? "Bestellung erneut als Datei exportieren"
                : "Bestellung als Datei fuer den ERP-Import exportieren"}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <ExportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        orderId={orderId}
        wasExported={wasExported}
        onExported={onExported}
      />
    </>
  );
}
