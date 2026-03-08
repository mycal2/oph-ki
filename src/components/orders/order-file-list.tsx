"use client";

import { useState, useCallback } from "react";
import { Mail, FileText, Sheet, Download, Loader2, ExternalLink, Eye } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { OrderFile, FilePreviewUrl } from "@/lib/types";

interface OrderFileListProps {
  files: OrderFile[];
  orderId: string;
  /** Callback when user clicks email_body.txt — scrolls to and expands the EmailBodyPanel. */
  onEmailBodyClick?: () => void;
}

function FileTypeIcon({ filename }: { filename: string }) {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (ext === ".eml")
    return <Mail className="h-4 w-4 text-blue-500 shrink-0" />;
  if (ext === ".pdf")
    return <FileText className="h-4 w-4 text-red-500 shrink-0" />;
  if (ext === ".xlsx" || ext === ".xls")
    return <Sheet className="h-4 w-4 text-green-600 shrink-0" />;
  return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

function isPdfFile(filename: string): boolean {
  return filename.toLowerCase().endsWith(".pdf");
}

/**
 * Displays the list of files attached to an order on the detail page.
 * Fetches signed download URLs on demand. Supports click-to-preview for PDF files
 * and open-in-new-tab for non-PDF files (OPH-27).
 */
export function OrderFileList({ files, orderId, onEmailBodyClick }: OrderFileListProps) {
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  /** Per-file loading state for on-demand URL fetching when clicking a file. */
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);
  /** PDF preview dialog state. */
  const [previewFile, setPreviewFile] = useState<{ filename: string; url: string } | null>(null);

  const fetchDownloadUrls = useCallback(async (): Promise<Record<string, string>> => {
    if (hasFetched) return downloadUrls;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/preview-url`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.files) {
          const urlMap: Record<string, string> = {};
          for (const f of json.data.files as FilePreviewUrl[]) {
            urlMap[f.fileId] = f.signedUrl;
          }
          setDownloadUrls(urlMap);
          setHasFetched(true);
          return urlMap;
        }
      }
      throw new Error("Failed to fetch URLs");
    } catch {
      // AC-7: Silent failure — no error message shown, file list unaffected
      return {};
    } finally {
      setIsLoading(false);
    }
  }, [orderId, hasFetched, downloadUrls]);

  /** Fetch URLs if not already fetched and return the URL for a specific file. */
  const getFileUrl = useCallback(
    async (fileId: string): Promise<string | null> => {
      // Already have the URL cached
      if (downloadUrls[fileId]) return downloadUrls[fileId];

      // Need to fetch all URLs first
      setLoadingFileId(fileId);
      try {
        const urls = await fetchDownloadUrls();
        return urls[fileId] ?? null;
      } finally {
        setLoadingFileId(null);
      }
    },
    [downloadUrls, fetchDownloadUrls]
  );

  /** Handle clicking a file row — preview PDF in dialog, open others in new tab. */
  const handleFileClick = useCallback(
    async (file: OrderFile) => {
      // AC-7: email_body.txt scrolls to EmailBodyPanel instead of opening
      if (file.original_filename === "email_body.txt") {
        if (onEmailBodyClick) {
          onEmailBodyClick();
        }
        return;
      }

      const url = await getFileUrl(file.id);
      if (!url) {
        // AC-7: Silent failure — no error message shown, file list unaffected
        return;
      }

      // AC-2: PDF files open in a preview dialog
      if (isPdfFile(file.original_filename)) {
        setPreviewFile({ filename: file.original_filename, url });
        return;
      }

      // AC-3: Non-PDF files open in a new browser tab
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [getFileUrl, onEmailBodyClick]
  );

  /** Open a fresh URL in a new tab (for the dialog "open in new tab" button). */
  const handleOpenInNewTab = useCallback(async () => {
    if (!previewFile) return;

    // Use the cached URL — it should still be valid
    window.open(previewFile.url, "_blank", "noopener,noreferrer");
  }, [previewFile]);

  if (files.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Dateien ({files.length})
          </CardTitle>
          {!hasFetched && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchDownloadUrls()}
              disabled={isLoading}
              className="text-xs"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  Downloads laden
                </>
              )}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {files.map((file) => {
              const isFileLoading = loadingFileId === file.id;
              const isEmailBody = file.original_filename === "email_body.txt";
              const isPdf = isPdfFile(file.original_filename);

              return (
                <div
                  key={file.id}
                  className="flex items-center gap-3 rounded-md border p-3 bg-background cursor-pointer hover:bg-muted/50 transition-colors group"
                  role="button"
                  tabIndex={0}
                  aria-label={
                    isEmailBody
                      ? `${file.original_filename} — E-Mail-Text anzeigen`
                      : isPdf
                        ? `${file.original_filename} — Vorschau oeffnen`
                        : `${file.original_filename} — In neuem Tab oeffnen`
                  }
                  onClick={() => handleFileClick(file)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleFileClick(file);
                    }
                  }}
                >
                  <FileTypeIcon filename={file.original_filename} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium group-hover:text-primary transition-colors">
                      {file.original_filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(file.file_size_bytes)} | {file.mime_type} |{" "}
                      {formatDate(file.created_at)}
                    </p>
                  </div>
                  {isFileLoading && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                  )}
                  {!isFileLoading && isPdf && (
                    <Eye className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  )}
                  {/* AC-8: Download button remains functional and independent */}
                  {downloadUrls[file.id] && (
                    <a
                      href={downloadUrls[file.id]}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={file.original_filename}
                      className="shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`${file.original_filename} herunterladen`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* AC-2, AC-4, AC-9: PDF preview dialog */}
      <Dialog
        open={previewFile !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewFile(null);
        }}
      >
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="flex flex-row items-center justify-between px-6 py-4 border-b shrink-0">
            <div className="flex-1 min-w-0 pr-8">
              <DialogTitle className="truncate text-base">
                {previewFile?.filename}
              </DialogTitle>
              <DialogDescription className="sr-only">
                PDF-Vorschau von {previewFile?.filename}
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenInNewTab}
              className="shrink-0 gap-1.5 mr-8"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              In neuem Tab oeffnen
            </Button>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {previewFile && (
              <iframe
                src={previewFile.url}
                title={`Vorschau: ${previewFile.filename}`}
                className="w-full h-full border-0"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
