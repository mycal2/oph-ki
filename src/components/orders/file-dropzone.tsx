"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  onFilesAdded: (files: File[]) => void;
  disabled?: boolean;
}

const ACCEPTED = ".eml,.pdf,.xlsx,.xls,.csv";

export function FileDropzone({ onFilesAdded, disabled }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      if (disabled) return;
      onFilesAdded(Array.from(files));
    },
    [disabled, onFilesAdded]
  );

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragging(true);
    },
    [disabled]
  );

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (disabled) return;
      const { files } = e.dataTransfer;
      if (files.length > 0) handleFiles(files);
    },
    [disabled, handleFiles]
  );

  const onClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Dateien hier ablegen oder klicken um auszuwählen"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors cursor-pointer select-none",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
        disabled && "cursor-not-allowed opacity-50 pointer-events-none"
      )}
    >
      <UploadCloud
        className={cn(
          "h-10 w-10 transition-colors",
          isDragging ? "text-primary" : "text-muted-foreground/50"
        )}
      />
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {isDragging
            ? "Dateien hier ablegen"
            : "Dateien hierher ziehen oder klicken zum Auswählen"}
        </p>
        <p className="text-xs text-muted-foreground">
          .eml, .pdf, .xlsx, .xls, .csv · max. 25 MB · bis zu 10 Dateien
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            handleFiles(e.target.files);
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}
