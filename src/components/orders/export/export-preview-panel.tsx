"use client";

import { AlertCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ExportPreviewResponse } from "@/lib/types";

interface ExportPreviewPanelProps {
  /** The preview data to display. */
  preview: ExportPreviewResponse | null;
  /** Whether the preview is currently loading. */
  isLoading: boolean;
  /** Error message, if any. */
  error: string | null;
}

/**
 * Displays a preview of the export data.
 * For CSV: shows a table with headers and first 10 rows.
 * For XML/JSON: shows the raw content in a code block.
 */
export function ExportPreviewPanel({
  preview,
  isLoading,
  error,
}: ExportPreviewPanelProps) {
  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  // Empty state
  if (!preview) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        Waehlen Sie ein Format, um die Vorschau zu laden.
      </p>
    );
  }

  // CSV format: table preview
  if (preview.format === "csv" && preview.headers.length > 0) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Vorschau: {Math.min(preview.rows.length, 10)} von {preview.totalRows} Zeilen
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            {preview.filename}
          </p>
        </div>
        <ScrollArea className="max-h-[320px]">
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {preview.headers.map((header, i) => (
                    <TableHead
                      key={i}
                      className="text-xs font-medium whitespace-nowrap"
                    >
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <TableCell
                        key={cellIndex}
                        className="text-xs whitespace-nowrap max-w-[200px] truncate"
                      >
                        {cell || (
                          <span className="text-muted-foreground italic">-</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {preview.rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={preview.headers.length}
                      className="text-center text-sm text-muted-foreground py-6"
                    >
                      Keine Bestellpositionen vorhanden.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
        {preview.totalRows > preview.rows.length && (
          <p className="text-xs text-muted-foreground text-center">
            ... und {preview.totalRows - preview.rows.length} weitere Zeilen
          </p>
        )}
      </div>
    );
  }

  // XML/JSON format: code preview
  if (preview.rawContent) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Vorschau ({preview.format.toUpperCase()})
            {preview.totalRows > 0 && ` - ${preview.totalRows} Positionen`}
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            {preview.filename}
          </p>
        </div>
        <ScrollArea className="max-h-[320px]">
          <pre className="rounded-md border bg-muted/50 p-4 text-xs font-mono whitespace-pre overflow-x-auto">
            {preview.rawContent}
          </pre>
        </ScrollArea>
      </div>
    );
  }

  return (
    <p className="text-sm text-muted-foreground text-center py-6">
      Keine Vorschau verfuegbar.
    </p>
  );
}
