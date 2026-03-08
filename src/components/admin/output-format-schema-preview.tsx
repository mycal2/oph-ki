"use client";

import { Check, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { OutputFormatSchemaColumn } from "@/lib/types";

interface OutputFormatSchemaPreviewProps {
  /** Detected schema columns to display. */
  columns: OutputFormatSchemaColumn[];
}

const DATA_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  number: "Zahl",
  date: "Datum",
};

/**
 * Displays the detected schema from a sample output format file
 * as a table with column name, inferred type, and required flag.
 */
export function OutputFormatSchemaPreview({
  columns,
}: OutputFormatSchemaPreviewProps) {
  if (columns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        Keine Spalten erkannt.
      </p>
    );
  }

  const requiredCount = columns.filter((c) => c.is_required).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {columns.length} Spalten erkannt, davon {requiredCount} als Pflichtfeld markiert
        </p>
      </div>
      <ScrollArea className="max-h-[320px]">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-medium">Spaltenname</TableHead>
                <TableHead className="text-xs font-medium w-[100px]">Datentyp</TableHead>
                <TableHead className="text-xs font-medium w-[100px] text-center">
                  Pflichtfeld
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {columns.map((col, index) => (
                <TableRow key={index}>
                  <TableCell className="text-sm font-mono">
                    {col.column_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {DATA_TYPE_LABELS[col.data_type] ?? col.data_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {col.is_required ? (
                      <Check
                        className="h-4 w-4 text-green-600 mx-auto"
                        aria-label="Pflichtfeld"
                      />
                    ) : (
                      <X
                        className="h-4 w-4 text-muted-foreground mx-auto"
                        aria-label="Optional"
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ScrollArea>
    </div>
  );
}
