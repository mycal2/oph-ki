"use client";

import { useState, useCallback } from "react";
import { Upload, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { MappingType } from "@/lib/types";

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealerId: string;
  dealerName: string;
  mappingType: MappingType;
  onImport: (csvContent: string, dealerId: string, mappingType: MappingType) => Promise<{ created: number; updated: number; errors: string[] }>;
}

const TYPE_LABELS: Record<MappingType, string> = {
  article_number: "Artikelnummern",
  unit_conversion: "Einheiten",
  field_label: "Feldbeschriftungen",
};

export function CsvImportDialog({
  open,
  onOpenChange,
  dealerId,
  dealerName,
  mappingType,
  onImport,
}: CsvImportDialogProps) {
  const [csvContent, setCsvContent] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);

  const handleImport = useCallback(async () => {
    if (!csvContent.trim()) return;

    setIsImporting(true);
    setError(null);
    setResult(null);

    try {
      const importResult = await onImport(csvContent, dealerId, mappingType);
      setResult(importResult);
      if (importResult.errors.length === 0) {
        // Auto-close after success
        setTimeout(() => {
          onOpenChange(false);
          setCsvContent("");
          setResult(null);
        }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import fehlgeschlagen.");
    } finally {
      setIsImporting(false);
    }
  }, [csvContent, dealerId, mappingType, onImport, onOpenChange]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvContent(event.target?.result as string);
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setCsvContent("");
    setError(null);
    setResult(null);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>CSV Import: {TYPE_LABELS[mappingType]}</DialogTitle>
          <DialogDescription>
            Importieren Sie {TYPE_LABELS[mappingType]}-Zuordnungen fuer {dealerName} aus einer CSV-Datei.
            Trennzeichen: Semikolon (;).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-xs text-muted-foreground bg-muted/50 rounded p-3 font-mono">
            dealer_value;erp_value;conversion_factor;description
            <br />
            HS-12345;MFG-6789;;Hauptkatalog
            <br />
            HS-67890;MFG-1234;;Sonderposten
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1" asChild>
              <label>
                <Upload className="h-3.5 w-3.5" />
                Datei waehlen
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </Button>
            <span className="text-xs text-muted-foreground">oder direkt einfuegen:</span>
          </div>

          <Textarea
            placeholder="CSV-Inhalt hier einfuegen..."
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            rows={8}
            className="font-mono text-sm"
            disabled={isImporting}
          />

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result && (
            <Alert variant={result.errors.length > 0 ? "default" : "default"}>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>
                {result.created} erstellt, {result.updated} aktualisiert.
                {result.errors.length > 0 && (
                  <div className="mt-2 text-xs text-destructive">
                    {result.errors.slice(0, 5).map((err, i) => (
                      <div key={i}>{err}</div>
                    ))}
                    {result.errors.length > 5 && (
                      <div>...und {result.errors.length - 5} weitere Fehler</div>
                    )}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isImporting}>
            {result ? "Schliessen" : "Abbrechen"}
          </Button>
          {!result && (
            <Button onClick={handleImport} disabled={!csvContent.trim() || isImporting}>
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importieren...
                </>
              ) : (
                "Importieren"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
