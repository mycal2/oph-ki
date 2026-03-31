"use client";

import { useState, useCallback, useEffect } from "react";
import { Download, Loader2, AlertCircle, RefreshCw, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExportPreviewPanel } from "./export-preview-panel";
import { ConfidenceScoreSection } from "./confidence-score-section";
import { useExport } from "@/hooks/use-export";
import type { ExportFormat } from "@/lib/types";

interface ExportDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Callback when the dialog open state changes. */
  onOpenChange: (open: boolean) => void;
  /** The order ID to export. */
  orderId: string;
  /** Whether this order was already exported before. */
  wasExported: boolean;
  /** Called after a successful export download. */
  onExported?: () => void;
}

const FORMAT_LABELS: Record<ExportFormat, string> = {
  csv: "CSV",
  xml: "XML",
  json: "JSON",
  split_csv: "Split CSV",
};

const FORMAT_DESCRIPTIONS: Record<ExportFormat, string> = {
  csv: "Komma-/Semikolon-getrennte Werte - für die meisten ERP-Systeme",
  xml: "Strukturiertes XML-Dokument",
  json: "Canonical JSON - für Entwickler und API-Integration",
  split_csv: "Zwei CSV-Dateien (Auftragskopf + Positionen)",
};

/**
 * Dialog for exporting an order to a file.
 * Shows format selection, preview, and download button.
 */
export function ExportDialog({
  open,
  onOpenChange,
  orderId,
  wasExported,
  onExported,
}: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("csv");
  const [hasAppliedDefault, setHasAppliedDefault] = useState(false);
  const {
    preview,
    isLoadingPreview,
    isDownloading,
    error,
    fetchPreview,
    download,
    clearError,
  } = useExport({ orderId });

  // Fetch preview when dialog opens or format changes
  useEffect(() => {
    if (open) {
      fetchPreview(selectedFormat);
    }
  }, [open, selectedFormat, fetchPreview]);

  // BUG-014: Apply tenant default format from first preview response
  useEffect(() => {
    if (
      preview?.tenantDefaultFormat &&
      preview.tenantDefaultFormat !== selectedFormat &&
      !hasAppliedDefault
    ) {
      setSelectedFormat(preview.tenantDefaultFormat);
      setHasAppliedDefault(true);
    }
  }, [preview?.tenantDefaultFormat, selectedFormat, hasAppliedDefault]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      clearError();
      setHasAppliedDefault(false);
    }
  }, [open, clearError]);

  const handleFormatChange = useCallback(
    (value: string) => {
      setSelectedFormat(value as ExportFormat);
      clearError();
    },
    [clearError]
  );

  const handleDownload = useCallback(async () => {
    const success = await download(selectedFormat);
    if (success) {
      onExported?.();
      onOpenChange(false);
    }
  }, [selectedFormat, download, onExported, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ERP-Export</DialogTitle>
          <DialogDescription>
            Wählen Sie ein Exportformat und prüfen Sie die Vorschau vor dem Download.
          </DialogDescription>
        </DialogHeader>

        {/* Re-export notice */}
        {wasExported && (
          <Alert>
            <RefreshCw className="h-4 w-4" />
            <AlertDescription>
              Diese Bestellung wurde bereits exportiert. Sie können sie jederzeit erneut exportieren.
            </AlertDescription>
          </Alert>
        )}

        {/* Format selection */}
        <div className="space-y-2">
          <label
            htmlFor="export-format"
            className="text-sm font-medium"
          >
            Exportformat
          </label>
          <Select
            value={selectedFormat}
            onValueChange={handleFormatChange}
          >
            <SelectTrigger
              id="export-format"
              className="w-full"
              aria-label="Exportformat wählen"
            >
              <SelectValue placeholder="Format wählen" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map((fmt) => (
                <SelectItem key={fmt} value={fmt}>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                      .{fmt}
                    </Badge>
                    <span>{FORMAT_LABELS[fmt]}</span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      - {FORMAT_DESCRIPTIONS[fmt]}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* BUG-007: Warning when using default config */}
        {preview?.usingDefaultConfig && !isLoadingPreview && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Keine ERP-Konfiguration für dieses Format gefunden. Es werden Standard-Zuordnungen verwendet.
            </AlertDescription>
          </Alert>
        )}

        {/* Preview panel */}
        <ExportPreviewPanel
          preview={preview}
          isLoading={isLoadingPreview}
          error={error}
        />

        {/* OPH-28: Confidence score section — shown only if format has a score */}
        {preview?.confidenceScore && !isLoadingPreview && (
          <>
            <Separator />
            <ConfidenceScoreSection data={preview.confidenceScore} />
          </>
        )}

        {/* Error banner */}
        {error && !isLoadingPreview && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDownloading}
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleDownload}
            disabled={isDownloading || isLoadingPreview || !!error}
            className="gap-1.5"
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isDownloading ? "Wird exportiert..." : `Als ${FORMAT_LABELS[selectedFormat]} herunterladen`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
