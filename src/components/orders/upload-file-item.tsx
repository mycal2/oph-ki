"use client";

import {
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mail,
  FileText,
  Sheet,
  AlertTriangle,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import type { UploadFileEntry } from "@/hooks/use-file-upload";

interface UploadFileItemProps {
  entry: UploadFileEntry;
  onRemove: (id: string) => void;
}

function FileTypeIcon({ filename }: { filename: string }) {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (ext === ".eml")
    return <Mail className="h-5 w-5 text-blue-500 shrink-0" />;
  if (ext === ".pdf")
    return <FileText className="h-5 w-5 text-red-500 shrink-0" />;
  if (ext === ".xlsx" || ext === ".xls")
    return <Sheet className="h-5 w-5 text-green-600 shrink-0" />;
  return <FileText className="h-5 w-5 text-muted-foreground shrink-0" />;
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
  });
}

export function UploadFileItem({ entry, onRemove }: UploadFileItemProps) {
  const { id, file, status, progress, error, isDuplicate, serverDuplicateDate } = entry;
  const canRemove = status === "pending" || status === "error";

  return (
    <div className="flex flex-col gap-1.5 rounded-md border p-3 bg-background">
      <div className="flex items-center gap-3">
        <FileTypeIcon filename={file.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Duplicate warning shown when file is still pending */}
          {isDuplicate && status === "pending" && (
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          )}
          {status === "uploading" && (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
          {status === "success" && !serverDuplicateDate && (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          )}
          {status === "success" && serverDuplicateDate && (
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          )}
          {status === "error" && (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
          {canRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onRemove(id)}
              aria-label={`${file.name} entfernen`}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {status === "uploading" && (
        <Progress value={progress} className="h-1.5 mt-1" />
      )}

      {isDuplicate && status === "pending" && (
        <p className="text-xs text-yellow-600 ml-8">
          Diese Datei wurde bereits in dieser Sitzung hinzugefügt
        </p>
      )}

      {status === "success" && serverDuplicateDate && (
        <p className="text-xs text-yellow-600 ml-8">
          Diese Datei wurde bereits am {formatDate(serverDuplicateDate)} hochgeladen
        </p>
      )}

      {status === "error" && error && (
        <p className="text-xs text-destructive ml-8">{error}</p>
      )}
    </div>
  );
}
