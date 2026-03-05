"use client";

import { useState, useCallback } from "react";
import { Mail, FileText, Sheet, Download, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { OrderFile, FilePreviewUrl } from "@/lib/types";

interface OrderFileListProps {
  files: OrderFile[];
  orderId: string;
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

/**
 * Displays the list of files attached to an order on the detail page.
 * Fetches signed download URLs on demand.
 */
export function OrderFileList({ files, orderId }: OrderFileListProps) {
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchDownloadUrls = useCallback(async () => {
    if (hasFetched) return;
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
        }
      }
    } catch {
      // Silently fail — download buttons just won't appear
    } finally {
      setIsLoading(false);
      setHasFetched(true);
    }
  }, [orderId, hasFetched]);

  if (files.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          Dateien ({files.length})
        </CardTitle>
        {!hasFetched && (
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchDownloadUrls}
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
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 rounded-md border p-3 bg-background"
            >
              <FileTypeIcon filename={file.original_filename} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {file.original_filename}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.file_size_bytes)} | {file.mime_type} |{" "}
                  {formatDate(file.created_at)}
                </p>
              </div>
              {downloadUrls[file.id] && (
                <a
                  href={downloadUrls[file.id]}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={file.original_filename}
                  className="shrink-0"
                >
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`${file.original_filename} herunterladen`}>
                    <Download className="h-4 w-4" />
                  </Button>
                </a>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
