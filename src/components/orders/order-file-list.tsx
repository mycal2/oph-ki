import { Mail, FileText, Sheet } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { OrderFile } from "@/lib/types";

interface OrderFileListProps {
  files: OrderFile[];
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
 */
export function OrderFileList({ files }: OrderFileListProps) {
  if (files.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Dateien ({files.length})
        </CardTitle>
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
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
