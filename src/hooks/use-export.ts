"use client";

import { useState, useCallback } from "react";
import type { ExportFormat, ExportPreviewResponse, ApiResponse } from "@/lib/types";

interface UseExportOptions {
  orderId: string;
}

interface UseExportReturn {
  /** The current preview data, if loaded. */
  preview: ExportPreviewResponse | null;
  /** Whether the preview is loading. */
  isLoadingPreview: boolean;
  /** Whether a download is in progress. */
  isDownloading: boolean;
  /** Error message, if any. */
  error: string | null;
  /** Fetch the export preview for a given format. */
  fetchPreview: (format: ExportFormat) => Promise<void>;
  /** Trigger the file download for a given format. */
  download: (format: ExportFormat) => Promise<boolean>;
  /** Clear the current error. */
  clearError: () => void;
}

/**
 * Custom hook for managing ERP export preview and download.
 */
export function useExport({ orderId }: UseExportOptions): UseExportReturn {
  const [preview, setPreview] = useState<ExportPreviewResponse | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreview = useCallback(
    async (format: ExportFormat) => {
      setIsLoadingPreview(true);
      setError(null);
      setPreview(null);

      try {
        const res = await fetch(
          `/api/orders/${orderId}/export/preview?format=${format}`
        );
        const json = (await res.json()) as ApiResponse<ExportPreviewResponse>;

        if (!res.ok || !json.success || !json.data) {
          setError(json.error ?? "Vorschau konnte nicht geladen werden.");
          return;
        }

        setPreview(json.data);
      } catch {
        setError("Verbindungsfehler beim Laden der Vorschau.");
      } finally {
        setIsLoadingPreview(false);
      }
    },
    [orderId]
  );

  /** Triggers a single file download from a fetch response. */
  const triggerDownload = async (res: Response, fallbackName: string): Promise<boolean> => {
    if (!res.ok) {
      try {
        const json = (await res.json()) as ApiResponse;
        setError(json.error ?? "Export fehlgeschlagen.");
      } catch {
        setError("Export fehlgeschlagen.");
      }
      return false;
    }

    const contentDisposition = res.headers.get("Content-Disposition");
    let filename = fallbackName;
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="(.+?)"/);
      if (match) filename = match[1];
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  };

  const download = useCallback(
    async (format: ExportFormat): Promise<boolean> => {
      setIsDownloading(true);
      setError(null);

      try {
        // OPH-61: For split_csv in "separate" mode, download two files sequentially
        if (format === "split_csv" && preview?.splitOutputMode === "separate") {
          // Download header file first
          const headerRes = await fetch(
            `/api/orders/${orderId}/export?format=split_csv&file=header`
          );
          const headerOk = await triggerDownload(headerRes, "Auftragskopf.csv");
          if (!headerOk) return false;

          // Small delay to avoid browser blocking the second download
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Download lines file
          const linesRes = await fetch(
            `/api/orders/${orderId}/export?format=split_csv&file=lines`
          );
          const linesOk = await triggerDownload(linesRes, "Positionen.csv");
          return linesOk;
        }

        // Standard single-file download (ZIP or other formats)
        const res = await fetch(
          `/api/orders/${orderId}/export?format=${format}`
        );
        return await triggerDownload(res, `export.${format}`);
      } catch {
        setError("Verbindungsfehler beim Export.");
        return false;
      } finally {
        setIsDownloading(false);
      }
    },
    [orderId, preview?.splitOutputMode]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    preview,
    isLoadingPreview,
    isDownloading,
    error,
    fetchPreview,
    download,
    clearError,
  };
}
