"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { DiscountImportResult } from "@/lib/types";

interface DiscountImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (
    file: File
  ) => Promise<{
    ok: boolean;
    data?: DiscountImportResult;
    error?: string;
  }>;
}

type ImportStep = "select" | "uploading" | "result";

/**
 * OPH-107: Excel import dialog for customer discount rates.
 *
 * Mirrors the UX of `ArticleImportDialog` but is intentionally simpler:
 *  - no client-side preview (we only read 2 columns; preview adds little value)
 *  - .xlsx only (matches the export format)
 *  - result step shows X updated / Y skipped / Z errors badges + error list
 */
export function DiscountImportDialog({
  open,
  onOpenChange,
  onImport,
}: DiscountImportDialogProps) {
  const [step, setStep] = useState<ImportStep>("select");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscountImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("select");
    setSelectedFile(null);
    setError(null);
    setResult(null);
    setIsDragging(false);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        reset();
      }
      onOpenChange(next);
    },
    [onOpenChange, reset]
  );

  const validateFile = (file: File): boolean => {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx")) {
      setError("Nur Excel-Dateien (.xlsx) sind erlaubt.");
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Datei ist zu gross. Maximum: 10 MB.");
      return false;
    }
    return true;
  };

  const handleFileSelect = (file: File) => {
    setError(null);
    if (validateFile(file)) {
      setSelectedFile(file);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleConfirmImport = async () => {
    if (!selectedFile) return;

    setStep("uploading");
    setError(null);

    const importResult = await onImport(selectedFile);

    if (importResult.ok && importResult.data) {
      setResult(importResult.data);
      setStep("result");
    } else {
      setError(importResult.error ?? "Import fehlgeschlagen.");
      setStep("select");
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatNumber = (n: number): string => n.toLocaleString("de-DE");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Rabatte importieren</DialogTitle>
          <DialogDescription>
            Excel-Datei (.xlsx) hochladen. Zeilen mit <strong>ID</strong> werden
            aktualisiert; Zeilen ohne ID werden neu angelegt, sofern{" "}
            <strong>Article Number</strong> und ein vom Kundenstandard
            abweichender <strong>Discount Rate (%)</strong> vorhanden sind.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Step: File selection */}
        {step === "select" && (
          <div className="space-y-4">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
              role="button"
              tabIndex={0}
              aria-label="Datei zum Importieren auswaehlen"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  fileInputRef.current?.click();
                }
              }}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">
                  Datei hierher ziehen oder klicken
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Nur .xlsx (max. 10 MB)
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                  e.target.value = "";
                }}
              />
            </div>

            {selectedFile && (
              <div className="flex items-center gap-3 rounded-md border p-3">
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                  aria-label="Datei entfernen"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Abbrechen
              </Button>
              <Button
                type="button"
                onClick={handleConfirmImport}
                disabled={!selectedFile}
              >
                Importieren
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step: Uploading */}
        {step === "uploading" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Datei wird verarbeitet...
            </p>
          </div>
        )}

        {/* Step: Result */}
        {step === "result" && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <p className="text-sm font-medium">Import abgeschlossen</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge
                variant="secondary"
                className="text-blue-700 bg-blue-50 hover:bg-blue-50"
              >
                {formatNumber(result.updated)} aktualisiert
              </Badge>
              {(result.inserted ?? 0) > 0 && (
                <Badge
                  variant="secondary"
                  className="text-green-700 bg-green-50 hover:bg-green-50"
                >
                  {formatNumber(result.inserted ?? 0)} neu angelegt
                </Badge>
              )}
              {result.skipped > 0 && (
                <Badge
                  variant="secondary"
                  className="text-gray-700 bg-gray-100 hover:bg-gray-100"
                >
                  {formatNumber(result.skipped)} uebersprungen
                </Badge>
              )}
              {result.total_errors > 0 && (
                <Badge
                  variant="secondary"
                  className="text-yellow-700 bg-yellow-50 hover:bg-yellow-50"
                >
                  {formatNumber(result.total_errors)} Fehler
                </Badge>
              )}
            </div>

            {result.errors.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
                  <p className="text-sm font-medium text-yellow-800">
                    {result.total_errors} Hinweis(e)
                  </p>
                </div>
                <div className="max-h-40 overflow-y-auto rounded-md border p-2 text-xs text-muted-foreground space-y-1">
                  {result.errors.map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                </div>
              </div>
            )}

            {(result.rrp_changes_ignored ?? 0) > 0 && (
              <Alert variant="default" className="border-amber-300 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-900">
                  <strong>
                    {formatNumber(result.rrp_changes_ignored ?? 0)} UVP-Aenderung(en) ignoriert.
                  </strong>{" "}
                  UVP-Werte koennen nur im Artikelkatalog geaendert werden.
                </AlertDescription>
              </Alert>
            )}

            {result.updated === 0 &&
              (result.inserted ?? 0) === 0 &&
              result.total_errors === 0 &&
              result.skipped > 0 && (
                <p className="text-sm text-muted-foreground">
                  Es wurden keine Datensaetze geaendert. Aenderungen ohne ID
                  benoetigen eine gueltige Artikelnummer und einen Rabattsatz,
                  der vom Kundenstandard abweicht.
                </p>
              )}

            <DialogFooter>
              <Button
                type="button"
                onClick={() => handleOpenChange(false)}
              >
                Schliessen
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
