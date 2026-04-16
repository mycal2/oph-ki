"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Upload,
  Loader2,
  Trash2,
  Download,
  FileUp,
  RefreshCw,
  AlertTriangle,
  FileText,
  Calendar,
  Columns3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useOutputFormat } from "@/hooks/use-output-format";
import { OutputFormatSchemaPreview } from "@/components/admin/output-format-schema-preview";
import type { OutputFormatParseResponse, TenantOutputFormat } from "@/lib/types";

interface OutputFormatTabProps {
  configId: string;
  /** OPH-59: Which template slot this upload manages. Defaults to "lines". */
  slot?: "lines" | "header";
  /** OPH-30: Callback when the saved output format changes (saved, replaced, or deleted). */
  onFormatChange?: (format: TenantOutputFormat | null) => void;
}

const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xml", ".json"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Admin tab for uploading and managing tenant output format samples.
 * Provides file upload, schema preview, and format management (replace/delete/download).
 * OPH-59: Supports slot parameter for split_csv header/lines samples.
 */
export function OutputFormatTab({ configId, slot = "lines", onFormatChange }: OutputFormatTabProps) {
  const {
    format,
    isLoading,
    error,
    isMutating,
    mutationError,
    refetch,
    parseFile,
    saveFormat,
    deleteFormat,
    clearMutationError,
  } = useOutputFormat(configId, slot);

  // OPH-30: Notify parent when the saved format changes
  useEffect(() => {
    if (!isLoading) {
      onFormatChange?.(format);
    }
  }, [format, isLoading, onFormatChange]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<OutputFormatParseResponse | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const validateFile = useCallback((file: File): string | null => {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Nicht unterstütztes Format. Erlaubt: ${ALLOWED_EXTENSIONS.join(", ")}`;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `Datei zu gross (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 10 MB.`;
    }
    return null;
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset state
      setFileError(null);
      setParseResult(null);
      setSuccessMessage(null);
      clearMutationError();

      // Validate
      const validationError = validateFile(file);
      if (validationError) {
        setFileError(validationError);
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      setSelectedFile(file);

      // Parse file to get schema preview
      const result = await parseFile(file);
      if (result) {
        setParseResult(result);
      }

      // Reset file input for re-selection
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [parseFile, validateFile, clearMutationError]
  );

  const handleSave = useCallback(async () => {
    if (!selectedFile) return;

    setSuccessMessage(null);
    const success = await saveFormat(selectedFile);
    if (success) {
      setSelectedFile(null);
      setParseResult(null);
      setSuccessMessage("Output-Format wurde gespeichert.");
    }
  }, [selectedFile, saveFormat]);

  const handleCancel = useCallback(() => {
    setSelectedFile(null);
    setParseResult(null);
    setFileError(null);
    clearMutationError();
  }, [clearMutationError]);

  const handleDelete = useCallback(async () => {
    const success = await deleteFormat();
    if (success) {
      setDeleteConfirmOpen(false);
      setSuccessMessage("Output-Format wurde gelöscht.");
    }
  }, [deleteFormat]);

  const handleDownloadOriginal = useCallback(() => {
    window.open(`/api/admin/erp-configs/${configId}/output-format/download?slot=${slot}`, "_blank");
  }, [configId, slot]);

  const handleReplace = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  // Error loading format
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error}{" "}
          <Button variant="link" className="h-auto p-0" onClick={refetch}>
            Erneut versuchen
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xml,.json"
        className="hidden"
        onChange={handleFileSelect}
        aria-label="Output-Format-Datei auswählen"
      />

      {/* Success message */}
      {successMessage && (
        <Alert>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* Mutation error */}
      {mutationError && (
        <Alert variant="destructive">
          <AlertDescription>
            {mutationError}{" "}
            <Button variant="link" className="h-auto p-0" onClick={clearMutationError}>
              Schließen
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* File validation error */}
      {fileError && (
        <Alert variant="destructive">
          <AlertDescription>{fileError}</AlertDescription>
        </Alert>
      )}

      {/* Current format summary (if assigned) */}
      {format && !parseResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Aktuelles Output-Format
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-2 text-sm">
                <FileUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Datei:</span>
                <span className="font-medium truncate">{format.file_name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Hochgeladen:</span>
                <span className="font-medium">
                  {new Date(format.uploaded_at).toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Columns3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Spalten:</span>
                <span className="font-medium">
                  {format.column_count} gesamt, {format.required_column_count} Pflicht
                </span>
              </div>
            </div>

            <Separator />

            {/* Schema display */}
            <OutputFormatSchemaPreview columns={format.detected_schema} />

            <Separator />

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReplace}
                disabled={isMutating}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Ersetzen
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadOriginal}
                disabled={isMutating}
              >
                <Download className="mr-1.5 h-4 w-4" />
                Original herunterladen
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={isMutating}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Löschen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload area (shown when no format is assigned and no parse result pending) */}
      {!format && !parseResult && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="rounded-full bg-muted p-4">
                <Upload className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  Kein Output-Format zugewiesen
                </p>
                <p className="text-xs text-muted-foreground max-w-md">
                  Laden Sie eine Beispieldatei im gewünschten ERP-Ausgabeformat hoch
                  (CSV, Excel, XML oder JSON). Das System erkennt automatisch die
                  Spaltenstruktur und Datentypen.
                </p>
              </div>
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isMutating}
                size="sm"
              >
                {isMutating ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-4 w-4" />
                )}
                Beispieldatei hochladen
              </Button>
              <p className="text-[10px] text-muted-foreground">
                Erlaubte Formate: CSV, XLSX, XML, JSON -- Max. 10 MB
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Parse result preview (review before saving) */}
      {parseResult && selectedFile && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Schema-Vorschau: {parseResult.file_name}
              <Badge variant="outline" className="ml-2 text-[10px] font-mono">
                .{parseResult.file_type}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Warnings */}
            {parseResult.warnings.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc pl-4 text-sm space-y-1">
                    {parseResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Summary */}
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                {parseResult.column_count} Spalten erkannt
              </span>
              <span className="text-muted-foreground">
                {parseResult.required_column_count} Pflichtfelder
              </span>
            </div>

            {/* Schema table */}
            <OutputFormatSchemaPreview columns={parseResult.detected_schema} />

            <Separator />

            {/* Save / Cancel */}
            <div className="flex items-center gap-3 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isMutating}
              >
                Abbrechen
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isMutating}
              >
                {isMutating ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-4 w-4" />
                )}
                Speichern & Zuweisen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mutating overlay (parsing in progress but no result yet) */}
      {isMutating && !parseResult && selectedFile && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Datei wird analysiert...
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Output-Format löschen</DialogTitle>
            <DialogDescription>
              Sind Sie sicher, dass Sie das zugewiesene Output-Format löschen möchten?
              Der Confidence Score wird für zukünftige Exporte nicht mehr berechnet.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={isMutating}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isMutating}
            >
              {isMutating ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-4 w-4" />
              )}
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
