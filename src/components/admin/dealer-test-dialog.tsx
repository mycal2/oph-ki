"use client";

import { useState, useCallback } from "react";
import { Upload, Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { TestRecognitionResult, RecognitionMethod } from "@/lib/types";

const METHOD_LABELS: Record<RecognitionMethod, string> = {
  domain: "Domain",
  address: "Absender-Adresse",
  subject: "Betreff",
  filename: "Dateiname",
  manual: "Manuell",
  ai_content: "KI-Inhalt",
  body_text_match: "E-Mail-Text",
  none: "Nicht erkannt",
};

interface DealerTestDialogProps {
  onTest: (file: File) => Promise<TestRecognitionResult | null>;
  isMutating: boolean;
  children: React.ReactNode;
}

export function DealerTestDialog({
  onTest,
  isMutating,
  children,
}: DealerTestDialogProps) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<TestRecognitionResult | null>(null);
  const [testedFilename, setTestedFilename] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setTestedFilename(file.name);
      setResult(null);
      const res = await onTest(file);
      setResult(res);

      // Reset the input so the same file can be tested again
      e.target.value = "";
    },
    [onTest]
  );

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) {
      setResult(null);
      setTestedFilename(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Haendler-Erkennung testen</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Laden Sie eine Datei (.eml, .pdf, .xlsx) hoch, um zu pruefen, welcher Haendler
          erkannt wird. Die Datei wird nicht gespeichert.
        </p>

        <div className="flex flex-col items-center gap-4 py-4">
          <Button variant="outline" asChild disabled={isMutating}>
            <label className="cursor-pointer">
              {isMutating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Datei auswaehlen
              <input
                type="file"
                accept=".eml,.pdf,.xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
                disabled={isMutating}
              />
            </label>
          </Button>

          {testedFilename && (
            <p className="text-xs text-muted-foreground font-mono">
              {testedFilename}
            </p>
          )}
        </div>

        {result && (
          <div className="rounded-lg border p-4 space-y-3">
            {result.dealer_id ? (
              <>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-medium">Haendler erkannt</span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-medium">{result.dealer_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Methode:</span>
                    <Badge variant="secondary">
                      {METHOD_LABELS[result.recognition_method]}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Konfidenz:</span>
                    <ConfidenceBadge confidence={result.recognition_confidence} />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Kein Haendler erkannt. Pruefen Sie die Erkennungsregeln.
                </span>
              </div>
            )}
          </div>
        )}

        {!result && !isMutating && testedFilename && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            Erkennung fehlgeschlagen.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color =
    confidence >= 80
      ? "bg-green-100 text-green-800"
      : confidence >= 50
        ? "bg-yellow-100 text-yellow-800"
        : "bg-red-100 text-red-800";

  return (
    <Badge variant="secondary" className={color}>
      {confidence}%
    </Badge>
  );
}
