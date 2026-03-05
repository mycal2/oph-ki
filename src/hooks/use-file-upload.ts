"use client";

import { useState, useCallback, useMemo } from "react";
import type { RecognitionMethod } from "@/lib/types";

export type FileStatus = "pending" | "uploading" | "success" | "error";

/** Dealer recognition result returned by the confirm endpoint after upload. */
export interface UploadDealerResult {
  dealerId: string | null;
  dealerName: string | null;
  recognitionMethod: RecognitionMethod;
  recognitionConfidence: number;
}

export interface UploadFileEntry {
  id: string;
  file: File;
  hash: string;
  status: FileStatus;
  progress: number;
  error?: string;
  /** Client-side duplicate: same file is already in the list (warning only, upload still proceeds) */
  isDuplicate?: boolean;
  /** Server confirmed this file was uploaded before — set after a successful upload response */
  serverDuplicateDate?: string;
  /** Order ID returned by the presign step. */
  orderId?: string;
  /** Dealer recognition result returned by the confirm step. */
  dealer?: UploadDealerResult;
}

const ALLOWED_EXTENSIONS = [".eml", ".pdf", ".xlsx", ".xls", ".csv"];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 10;

async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function useFileUpload() {
  const [files, setFiles] = useState<UploadFileEntry[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  /** OPH-25: Optional email subject passed along with every upload presign request. */
  const [subject, setSubject] = useState("");

  const updateFileState = useCallback(
    (id: string, update: Partial<UploadFileEntry>) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...update } : f))
      );
    },
    []
  );

  const addFiles = useCallback(
    async (incoming: File[]): Promise<string[]> => {
      const errors: string[] = [];
      const validEntries: UploadFileEntry[] = [];

      for (const file of incoming) {
        const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          errors.push(
            `"${file.name}": Nicht unterstütztes Format. Erlaubt: ${ALLOWED_EXTENSIONS.join(", ")}`
          );
          continue;
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
          errors.push(
            `"${file.name}": Zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 25 MB`
          );
          continue;
        }

        const hash = await hashFile(file);
        validEntries.push({
          id: crypto.randomUUID(),
          file,
          hash,
          status: "pending",
          progress: 0,
          isDuplicate: false,
        });
      }

      // Warn user if files will be dropped due to the 10-file limit (BUG-2 fix)
      const availableSlots = MAX_FILES - files.length;
      if (validEntries.length > availableSlots) {
        const droppedCount = validEntries.length - availableSlots;
        errors.push(
          `${droppedCount} ${droppedCount === 1 ? "Datei wurde" : "Dateien wurden"} nicht hinzugefügt: Maximale Anzahl von ${MAX_FILES} Dateien erreicht.`
        );
      }

      // Flag client-side duplicates as warnings (upload still proceeds — BUG-11 fix)
      const existingHashes = new Set(files.map((f) => f.hash));
      const tagged = validEntries.map((entry) => {
        const isDup = existingHashes.has(entry.hash);
        if (!isDup) existingHashes.add(entry.hash);
        return isDup ? { ...entry, isDuplicate: true } : entry;
      });

      setFiles((prev) => {
        const combined = [...prev, ...tagged];
        return combined.slice(0, MAX_FILES);
      });

      return errors;
    },
    [files]
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const uploadFiles = useCallback(async () => {
    const pending = files.filter((f) => f.status === "pending");
    if (pending.length === 0 || isUploading) return;

    setIsUploading(true);

    for (const entry of pending) {
      // ────────────────────────────────────────────────────────────────────────
      // Two-step upload flow (avoids Next.js / Vercel body-size limits):
      //   Step 1: POST /api/orders/upload  — validate metadata, create order record,
      //           receive a short-lived Supabase Storage signed upload URL
      //   Step 2: PUT {signedUrl}          — upload file DIRECTLY to Supabase Storage
      //           with XHR so we can track progress
      //   Step 3: POST /api/orders/upload/confirm — register file metadata in DB
      // ────────────────────────────────────────────────────────────────────────

      updateFileState(entry.id, { status: "uploading", progress: 0 });

      // ── Step 1: Presign ──────────────────────────────────────────────────
      let presignData: {
        orderId: string;
        signedUrl: string;
        storagePath: string;
        token: string;
      };

      try {
        const presignRes = await fetch("/api/orders/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: entry.file.name,
            fileSize: entry.file.size,
            mimeType: entry.file.type || "application/octet-stream",
            sha256Hash: entry.hash,
            // OPH-25: Include optional email subject for extraction context
            ...(subject.trim().length > 0 ? { subject: subject.trim() } : {}),
          }),
        });

        const presignJson = (await presignRes.json()) as {
          success: boolean;
          data?: typeof presignData;
          error?: string;
        };

        if (!presignRes.ok || !presignJson.success || !presignJson.data) {
          updateFileState(entry.id, {
            status: "error",
            error: presignJson.error ?? "Upload-Vorbereitung fehlgeschlagen.",
          });
          continue;
        }

        presignData = presignJson.data;
      } catch {
        updateFileState(entry.id, {
          status: "error",
          error: "Verbindungsfehler bei der Upload-Vorbereitung.",
        });
        continue;
      }

      // ── Step 2: Direct upload to Supabase Storage via XHR (with progress) ──
      const storageUploadOk = await new Promise<boolean>((resolve) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            // Map storage upload to 5–95% to leave room for presign (0–5%) and confirm (95–100%)
            const progress = 5 + Math.round((e.loaded / e.total) * 90);
            updateFileState(entry.id, { progress });
          }
        };

        xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
        xhr.onerror = () => resolve(false);

        xhr.open("PUT", presignData.signedUrl);
        xhr.setRequestHeader(
          "Content-Type",
          entry.file.type || "application/octet-stream"
        );
        xhr.send(entry.file);
      });

      if (!storageUploadOk) {
        updateFileState(entry.id, {
          status: "error",
          error: "Datei-Upload fehlgeschlagen. Bitte erneut versuchen.",
        });
        continue;
      }

      // ── Step 3: Confirm — register file metadata in DB ──────────────────
      try {
        const confirmRes = await fetch("/api/orders/upload/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: presignData.orderId,
            storagePath: presignData.storagePath,
            sha256Hash: entry.hash,
            originalFilename: entry.file.name,
          }),
        });

        const confirmJson = (await confirmRes.json()) as {
          success: boolean;
          data?: {
            orderId: string;
            filename: string;
            isDuplicate: boolean;
            duplicateDate?: string;
            dealer?: {
              dealerId: string | null;
              dealerName: string | null;
              recognitionMethod: RecognitionMethod;
              recognitionConfidence: number;
            };
          };
          error?: string;
        };

        if (!confirmRes.ok || !confirmJson.success) {
          updateFileState(entry.id, {
            status: "error",
            error: confirmJson.error ?? "Datei-Registrierung fehlgeschlagen.",
          });
          continue;
        }

        updateFileState(entry.id, {
          status: "success",
          progress: 100,
          orderId: presignData.orderId,
          serverDuplicateDate: confirmJson.data?.duplicateDate,
          dealer: confirmJson.data?.dealer
            ? {
                dealerId: confirmJson.data.dealer.dealerId,
                dealerName: confirmJson.data.dealer.dealerName,
                recognitionMethod: confirmJson.data.dealer.recognitionMethod,
                recognitionConfidence: confirmJson.data.dealer.recognitionConfidence,
              }
            : undefined,
        });

        // Trigger AI extraction from the client as a reliable backup.
        // The server also triggers via after(), but this ensures extraction
        // starts even if the server-side trigger fails.
        fetch(`/api/orders/${presignData.orderId}/extract`, {
          method: "POST",
        }).catch(() => {
          // Silently ignore — server-side after() should also trigger extraction
        });
      } catch {
        updateFileState(entry.id, {
          status: "error",
          error: "Verbindungsfehler bei der Bestätigung.",
        });
      }
    }

    setIsUploading(false);
  }, [files, isUploading, updateFileState, subject]);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setSubject("");
  }, []);

  // Upload is complete when all files have been processed (success or error)
  const uploadComplete = useMemo(() => {
    if (isUploading || files.length === 0) return false;
    return files.every((f) => f.status === "success" || f.status === "error");
  }, [files, isUploading]);

  const canUpload = !isUploading && files.some((f) => f.status === "pending");
  const pendingCount = files.filter((f) => f.status === "pending").length;
  const successCount = files.filter((f) => f.status === "success").length;
  const errorCount   = files.filter((f) => f.status === "error").length;

  return {
    files,
    isUploading,
    uploadComplete,
    canUpload,
    pendingCount,
    successCount,
    errorCount,
    /** OPH-25: Optional email subject for extraction context. */
    subject,
    setSubject,
    addFiles,
    removeFile,
    uploadFiles,
    clearFiles,
  };
}
