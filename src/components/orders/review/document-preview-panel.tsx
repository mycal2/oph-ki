"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, Download, ExternalLink, Loader2, AlertCircle, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { FilePreviewUrl, ApiResponse, PreviewUrlResponse } from "@/lib/types";

interface DocumentPreviewPanelProps {
  orderId: string;
}

/** Check whether a file should be rendered as inline text. */
function isTextFile(file: FilePreviewUrl): boolean {
  return (
    file.mimeType === "text/plain" ||
    file.filename === "email_body.txt"
  );
}

/**
 * Inline text preview sub-component.
 * Fetches the text content from the signed URL and renders it in a scrollable block.
 */
function TextFilePreview({ file }: { file: FilePreviewUrl }) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoadingText, setIsLoadingText] = useState(true);
  const [textError, setTextError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingText(true);
    setTextError(null);
    setTextContent(null);

    async function fetchText() {
      try {
        const res = await fetch(file.signedUrl);

        if (!res.ok) {
          if (!cancelled) {
            setTextError("Text konnte nicht geladen werden.");
          }
          return;
        }

        const text = await res.text();
        if (!cancelled) {
          setTextContent(text);
        }
      } catch {
        if (!cancelled) {
          setTextError("Verbindungsfehler beim Laden des Textes.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingText(false);
        }
      }
    }

    fetchText();
    return () => {
      cancelled = true;
    };
  }, [file.signedUrl]);

  // Loading state
  if (isLoadingText) {
    return (
      <div className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border bg-muted/20 flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>E-Mail-Text wird geladen...</span>
        </div>
      </div>
    );
  }

  // Error state with download fallback
  if (textError) {
    return (
      <div className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border bg-muted/20 flex flex-col items-center justify-center gap-3 px-4">
        <Alert variant="destructive" className="max-w-sm">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{textError}</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <a
            href={file.signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${file.filename} herunterladen`}
          >
            <Download className="h-3.5 w-3.5" />
            Datei herunterladen
          </a>
        </Button>
      </div>
    );
  }

  // Empty file
  if (textContent !== null && textContent.length === 0) {
    return (
      <div className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border bg-muted/20 flex flex-col items-center justify-center text-center">
        <Mail className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          Kein E-Mail-Text vorhanden.
        </p>
      </div>
    );
  }

  // Rendered text content
  return (
    <pre
      className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border bg-muted/20 p-4 text-sm whitespace-pre-wrap break-words overflow-y-auto font-mono"
      aria-label={`Textinhalt: ${file.filename}`}
    >
      {textContent}
    </pre>
  );
}

/**
 * Left panel of the review page showing file previews.
 * PDFs are embedded via iframe using signed URLs.
 * Text files (email_body.txt) are rendered inline.
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
  const isImage = /^image\/(jpeg|jpg|png|webp|tiff|bmp)$/.test(activeFile?.mimeType ?? "");
  const isText = activeFile ? isTextFile(activeFile) : false;

  return (
    <Card className={cn("h-full flex flex-col", stickyClasses)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Dokument-Vorschau</CardTitle>
          {activeFile && (
            <div className="flex items-center gap-1">
              {/* OPH-70: Download button for text files (secondary action) */}
              {isText && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="gap-1.5 text-xs"
                >
                  <a
                    href={activeFile.signedUrl}
                    download={activeFile.filename}
                    aria-label={`${activeFile.filename} herunterladen`}
                  >
                    <Download className="h-3 w-3" />
                    Download
                  </a>
                </Button>
              )}
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
            </div>
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
                {isTextFile(f) ? (
                  <Mail className="h-3 w-3" />
                ) : (
                  <FileText className="h-3 w-3" />
                )}
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
        ) : isImage ? (
          <div className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border overflow-auto bg-muted/20 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeFile.signedUrl}
              alt={activeFile.filename}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        ) : isText ? (
          <TextFilePreview file={activeFile} />
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
