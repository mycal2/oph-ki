"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, X } from "lucide-react";
import * as XLSX from "xlsx";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ArticleImportResult } from "@/lib/types";

interface ArticleImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (file: File) => Promise<{ ok: boolean; data?: ArticleImportResult; error?: string }>;
}

type ImportStep = "select" | "preview" | "uploading" | "result";

/** Column name mapping for client-side preview parsing (same as server-side). */
const COLUMN_MAP: Record<string, string> = {
  "article_number": "article_number",
  "artikelnummer": "article_number",
  "herst.-art.-nr.": "article_number",
  "herst-art-nr": "article_number",
  "herst art nr": "article_number",
  "art.-nr.": "article_number",
  "art-nr": "article_number",
  "art nr": "article_number",
  "artnr": "article_number",
  "name": "name",
  "artikelbezeichnung": "name",
  "bezeichnung": "name",
  "description": "name",
  "produktname": "name",
  "category": "category",
  "kategorie": "category",
  "color": "color",
  "farbe": "color",
  "shade": "color",
  "farbe / shade": "color",
  "farbe/shade": "color",
  "packaging": "packaging",
  "verpackung": "packaging",
  "verpackungseinheit": "packaging",
  "vpe": "packaging",
  "size1": "size1",
  "groesse 1": "size1",
  "groesse1": "size1",
  "größe 1": "size1",
  "größe1": "size1",
  "size2": "size2",
  "groesse 2": "size2",
  "groesse2": "size2",
  "größe 2": "size2",
  "größe2": "size2",
  "ref_no": "ref_no",
  "ref-nr": "ref_no",
  "ref.-nr.": "ref_no",
  "ref nr": "ref_no",
  "referenznummer": "ref_no",
  "reference": "ref_no",
  "gtin": "gtin",
  "ean": "gtin",
  "gtin / ean": "gtin",
  "gtin/ean": "gtin",
  "barcode": "gtin",
  "keywords": "keywords",
  "suchbegriffe": "keywords",
  "aliase": "keywords",
  "suchbegriffe / aliase": "keywords",
};

interface PreviewRow {
  article_number: string;
  name: string;
  category: string | null;
}

interface PreviewData {
  rows: PreviewRow[];
  totalValid: number;
  skippedCount: number;
  parseErrors: string[];
}

/** Maximum rows to show in preview table. */
const PREVIEW_LIMIT = 10;

function parseFileForPreview(arrayBuffer: ArrayBuffer, filename: string): PreviewData {
  const parseErrors: string[] = [];

  const workbook = XLSX.read(arrayBuffer, {
    type: "array",
    codepage: 65001,
    raw: true,
  });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], totalValid: 0, skippedCount: 0, parseErrors: ["Datei enthaelt keine Tabellenblaetter."] };
  }

  const sheet = workbook.Sheets[sheetName];
  const rawData: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  }) as string[][];

  if (rawData.length < 2) {
    return {
      rows: [],
      totalValid: 0,
      skippedCount: 0,
      parseErrors: ["Datei muss mindestens eine Kopfzeile und eine Datenzeile enthalten."],
    };
  }

  // Map headers
  const rawHeaders = rawData[0].map((h) => String(h).trim());
  const fieldIndexes: Record<string, number> = {};

  for (let i = 0; i < rawHeaders.length; i++) {
    const normalized = rawHeaders[i].toLowerCase().trim();
    const canonicalField = COLUMN_MAP[normalized];
    if (canonicalField && fieldIndexes[canonicalField] === undefined) {
      fieldIndexes[canonicalField] = i;
    }
  }

  if (fieldIndexes["article_number"] === undefined) {
    parseErrors.push("Spalte 'Herst.-Art.-Nr.' (oder 'article_number', 'Artikelnummer', 'Art.-Nr.') nicht gefunden.");
  }
  if (fieldIndexes["name"] === undefined) {
    parseErrors.push("Spalte 'Artikelbezeichnung' (oder 'name', 'Bezeichnung') nicht gefunden.");
  }

  if (parseErrors.length > 0) {
    return { rows: [], totalValid: 0, skippedCount: 0, parseErrors };
  }

  const artNumIdx = fieldIndexes["article_number"]!;
  const nameIdx = fieldIndexes["name"]!;
  const catIdx = fieldIndexes["category"];

  // Deduplicate by article_number (last wins)
  const rowMap = new Map<string, PreviewRow>();
  let skippedCount = 0;

  for (let i = 1; i < rawData.length; i++) {
    const cols = rawData[i];
    const articleNumber = String(cols[artNumIdx] ?? "").trim();
    const articleName = String(cols[nameIdx] ?? "").trim();

    if (!articleNumber || !articleName) {
      skippedCount++;
      parseErrors.push(`Zeile ${i + 1}: Herst.-Art.-Nr. oder Artikelbezeichnung fehlt — wird uebersprungen.`);
      continue;
    }

    if (articleNumber.length > 200) {
      skippedCount++;
      parseErrors.push(`Zeile ${i + 1}: Herst.-Art.-Nr. zu lang (max. 200 Zeichen) — wird uebersprungen.`);
      continue;
    }

    if (articleName.length > 500) {
      skippedCount++;
      parseErrors.push(`Zeile ${i + 1}: Artikelbezeichnung zu lang (max. 500 Zeichen) — wird uebersprungen.`);
      continue;
    }

    const category = catIdx !== undefined ? String(cols[catIdx] ?? "").trim() || null : null;

    rowMap.set(articleNumber.toLowerCase(), {
      article_number: articleNumber,
      name: articleName,
      category,
    });
  }

  const allRows = Array.from(rowMap.values());
  return {
    rows: allRows.slice(0, PREVIEW_LIMIT),
    totalValid: allRows.length,
    skippedCount,
    parseErrors,
  };
}

export function ArticleImportDialog({
  open,
  onOpenChange,
  onImport,
}: ArticleImportDialogProps) {
  const [step, setStep] = useState<ImportStep>("select");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ArticleImportResult | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("select");
    setSelectedFile(null);
    setError(null);
    setResult(null);
    setPreview(null);
    setIsParsing(false);
    setIsDragging(false);
  }, []);

  // Reset when dialog opens/closes
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        reset();
      }
      onOpenChange(open);
    },
    [onOpenChange, reset]
  );

  const validateFile = (file: File): boolean => {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv") && !name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      setError("Nur CSV- und Excel-Dateien (.csv, .xlsx, .xls) sind erlaubt.");
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

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleParsePreview = async () => {
    if (!selectedFile) return;

    setIsParsing(true);
    setError(null);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const previewData = parseFileForPreview(arrayBuffer, selectedFile.name);

      if (previewData.parseErrors.length > 0 && previewData.totalValid === 0) {
        // Fatal parse errors — cannot proceed
        setError(previewData.parseErrors.join(" "));
        setIsParsing(false);
        return;
      }

      setPreview(previewData);
      setStep("preview");
    } catch {
      setError("Datei konnte nicht gelesen werden.");
    } finally {
      setIsParsing(false);
    }
  };

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
      setStep("preview");
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatNumber = (n: number): string => {
    return n.toLocaleString("de-DE");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Artikelstamm importieren</DialogTitle>
          <DialogDescription>
            CSV- oder Excel-Datei mit Artikeldaten hochladen. Bestehende Artikel
            mit gleicher Herst.-Art.-Nr. werden aktualisiert.
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
            {/* Drop zone */}
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
                  CSV, XLSX oder XLS (max. 10 MB)
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Selected file */}
            {selectedFile && (
              <div className="flex items-center gap-3 rounded-md border p-3">
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{selectedFile.name}</p>
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
                onClick={handleParsePreview}
                disabled={!selectedFile || isParsing}
              >
                {isParsing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Wird gelesen...
                  </>
                ) : (
                  "Vorschau"
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step: Preview */}
        {step === "preview" && preview && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
              <p className="text-sm font-medium">
                {formatNumber(preview.totalValid)} Artikel erkannt
                {preview.skippedCount > 0 && (
                  <span className="text-muted-foreground font-normal">
                    {" "}({formatNumber(preview.skippedCount)} uebersprungen)
                  </span>
                )}
              </p>
            </div>

            {/* Preview table */}
            {preview.rows.length > 0 && (
              <div className="rounded-md border overflow-x-auto max-h-60 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">Herst.-Art.-Nr.</TableHead>
                      <TableHead className="min-w-[180px]">Artikelbezeichnung</TableHead>
                      <TableHead>Kategorie</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-xs">{row.article_number}</TableCell>
                        <TableCell className="text-xs">
                          <span className="line-clamp-1">{row.name}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.category ?? "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {preview.totalValid > PREVIEW_LIMIT && (
              <p className="text-xs text-muted-foreground">
                Vorschau zeigt die ersten {PREVIEW_LIMIT} von {formatNumber(preview.totalValid)} Artikeln.
              </p>
            )}

            {/* Parse warnings */}
            {preview.parseErrors.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
                  <p className="text-sm font-medium text-yellow-800">
                    {preview.parseErrors.length} Hinweis(e)
                  </p>
                </div>
                <div className="max-h-32 overflow-y-auto rounded-md border p-2 text-xs text-muted-foreground space-y-1">
                  {preview.parseErrors.map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPreview(null);
                  setStep("select");
                }}
              >
                Zurueck
              </Button>
              <Button
                type="button"
                onClick={handleConfirmImport}
                disabled={preview.totalValid === 0}
              >
                {formatNumber(preview.totalValid)} Artikel importieren
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step: Uploading (BUG-5 fix: show row count) */}
        {step === "uploading" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {preview
                ? `Importiere ${formatNumber(preview.totalValid)} Artikel...`
                : "Datei wird importiert..."}
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
              <Badge variant="secondary" className="text-green-700 bg-green-50">
                {result.created} neu erstellt
              </Badge>
              <Badge variant="secondary" className="text-blue-700 bg-blue-50">
                {result.updated} aktualisiert
              </Badge>
              {result.skipped > 0 && (
                <Badge variant="secondary" className="text-yellow-700 bg-yellow-50">
                  {result.skipped} uebersprungen
                </Badge>
              )}
            </div>

            {result.errors.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
                  <p className="text-sm font-medium text-yellow-800">
                    {result.errors.length} Hinweis(e)
                  </p>
                </div>
                <div className="max-h-40 overflow-y-auto rounded-md border p-2 text-xs text-muted-foreground space-y-1">
                  {result.errors.map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Schliessen
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
