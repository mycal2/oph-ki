"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, Download, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { FilePreviewUrl, ApiResponse, PreviewUrlResponse } from "@/lib/types";

interface DocumentPreviewPanelProps {
  orderId: string;
}

/**
 * Left panel of the review page showing file previews.
 * PDFs are embedded via iframe using signed URLs.
 * Non-PDF files show a download link fallback.
 */
export function DocumentPreviewPanel({ orderId }: DocumentPreviewPanelProps) {
  const [files, setFiles] = useState<FilePreviewUrl[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFileIndex, setActiveFileIndex] = useState(0);

  const fetchPreviewUrls = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/orders/${orderId}/preview-url`);
      const json = (await res.json()) as ApiResponse<PreviewUrlResponse>;

      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? "Vorschau-URLs konnten nicht geladen werden.");
        return;
      }

      setFiles(json.data.files);
    } catch {
      setError("Verbindungsfehler beim Laden der Vorschau.");
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchPreviewUrls();
  }, [fetchPreviewUrls]);

  // Shared sticky classes for the panel wrapper on desktop
  const stickyClasses = "lg:sticky lg:top-[4.25rem] lg:h-[calc(100vh-4.25rem-1.5rem)]";

  if (isLoading) {
    return (
      <Card className={cn("h-full", stickyClasses)}>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[500px] w-full rounded-md" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("h-full", stickyClasses)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dokument-Vorschau</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button variant="outline" size="sm" onClick={fetchPreviewUrls} className="mt-3">
            Erneut versuchen
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (files.length === 0) {
    return (
      <Card className={cn("h-full", stickyClasses)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dokument-Vorschau</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              Keine Dateien für die Vorschau verfügbar.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const activeFile = files[activeFileIndex];
  const isPdf = activeFile?.mimeType === "application/pdf";

  return (
    <Card className={cn("h-full flex flex-col", stickyClasses)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Dokument-Vorschau</CardTitle>
          {activeFile && (
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="gap-1.5 text-xs"
            >
              <a
                href={activeFile.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${activeFile.filename} in neuem Tab öffnen`}
              >
                <ExternalLink className="h-3 w-3" />
                In neuem Tab
              </a>
            </Button>
          )}
        </div>

        {/* File tabs */}
        {files.length > 1 && (
          <div className="flex gap-1 flex-wrap mt-2">
            {files.map((f, i) => (
              <Button
                key={f.fileId}
                variant={i === activeFileIndex ? "default" : "outline"}
                size="sm"
                className={cn("text-xs h-7 gap-1", i === activeFileIndex && "pointer-events-none")}
                onClick={() => setActiveFileIndex(i)}
              >
                <FileText className="h-3 w-3" />
                <span className="truncate max-w-[100px]">{f.filename}</span>
              </Button>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 min-h-0">
        {isPdf ? (
          <iframe
            src={activeFile.signedUrl}
            className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border"
            title={`Vorschau: ${activeFile.filename}`}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center border rounded-md bg-muted/30">
            <FileText className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium mb-1">{activeFile.filename}</p>
            <p className="text-xs text-muted-foreground mb-4">
              Vorschau für diesen Dateityp nicht verfügbar.
            </p>
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <a
                href={activeFile.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="h-3.5 w-3.5" />
                Datei herunterladen
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
