"use client";

import { UploadFileItem } from "./upload-file-item";
import type { UploadFileEntry } from "@/hooks/use-file-upload";

interface UploadFileListProps {
  files: UploadFileEntry[];
  onRemove: (id: string) => void;
}

export function UploadFileList({ files, onRemove }: UploadFileListProps) {
  if (files.length === 0) return null;

  return (
    <div className="space-y-2">
      {files.map((entry) => (
        <UploadFileItem key={entry.id} entry={entry} onRemove={onRemove} />
      ))}
    </div>
  );
}
