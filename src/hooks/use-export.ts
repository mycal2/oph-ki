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

  const download = useCallback(
    async (format: ExportFormat): Promise<boolean> => {
      setIsDownloading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/orders/${orderId}/export?format=${format}`
        );

        if (!res.ok) {
          // Try to parse error JSON
          try {
            const json = (await res.json()) as ApiResponse;
            setError(json.error ?? "Export fehlgeschlagen.");
          } catch {
            setError("Export fehlgeschlagen.");
          }
          return false;
        }

        // Get filename from Content-Disposition header
        const contentDisposition = res.headers.get("Content-Disposition");
        let filename = `export.${format}`;
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="(.+?)"/);
          if (match) {
            filename = match[1];
          }
        }

        // Create blob and trigger download
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
      } catch {
        setError("Verbindungsfehler beim Export.");
        return false;
      } finally {
        setIsDownloading(false);
      }
    },
    [orderId]
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
