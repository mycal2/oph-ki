"use client";

import { useCallback } from "react";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ErpColumnMappingExtended, ErpTransformationStep } from "@/lib/types";
import { ErpTransformationEditor } from "@/components/admin/erp-transformation-editor";

/** Common canonical field suggestions for source_field. */
const SOURCE_FIELD_SUGGESTIONS = [
  "order.order_number",
  "order.order_date",
  "order.currency",
  "order.total_amount",
  "order.notes",
  "order.email_subject",
  "order.dealer.name",
  "order.sender.company_name",
  "order.sender.customer_number",
  "order.sender.email",
  "order.sender.phone",
  "order.sender.street",
  "order.sender.city",
  "order.sender.postal_code",
  "order.sender.country",
  "order.delivery_address.company",
  "order.delivery_address.street",
  "order.delivery_address.city",
  "order.delivery_address.postal_code",
  "order.delivery_address.country",
  "order.billing_address.company",
  "order.billing_address.street",
  "order.billing_address.city",
  "order.billing_address.postal_code",
  "order.billing_address.country",
  "items[].position",
  "items[].article_number",
  "items[].dealer_article_number",
  "items[].description",
  "items[].quantity",
  "items[].unit",
  "items[].unit_price",
  "items[].total_price",
  "items[].currency",
];

interface CsvColumnBuilderProps {
  columns: ErpColumnMappingExtended[];
  onChange: (columns: ErpColumnMappingExtended[]) => void;
}

export function CsvColumnBuilder({ columns, onChange }: CsvColumnBuilderProps) {
  const handleAddColumn = useCallback(() => {
    onChange([
      ...columns,
      {
        source_field: "",
        target_column_name: "",
        required: false,
        transformations: [],
      },
    ]);
  }, [columns, onChange]);

  const handleRemoveColumn = useCallback(
    (index: number) => {
      onChange(columns.filter((_, i) => i !== index));
    },
    [columns, onChange]
  );

  const handleUpdateColumn = useCallback(
    (index: number, field: keyof ErpColumnMappingExtended, value: unknown) => {
      const updated = [...columns];
      updated[index] = { ...updated[index], [field]: value };
      onChange(updated);
    },
    [columns, onChange]
  );

  const handleMoveColumn = useCallback(
    (index: number, direction: "up" | "down") => {
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= columns.length) return;
      const updated = [...columns];
      [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
      onChange(updated);
    },
    [columns, onChange]
  );

  const handleUpdateTransformations = useCallback(
    (index: number, transformations: ErpTransformationStep[]) => {
      const updated = [...columns];
      updated[index] = { ...updated[index], transformations };
      onChange(updated);
    },
    [columns, onChange]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">CSV-Spalten-Konfiguration</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={handleAddColumn}>
            <Plus className="mr-1.5 h-4 w-4" />
            Spalte hinzufügen
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Definieren Sie die Spaltenreihenfolge, Quellfelder und Transformationen für den CSV-Export.
        </p>
      </CardHeader>
      <CardContent>
        {columns.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Noch keine Spalten konfiguriert.
            </p>
            <Button size="sm" onClick={handleAddColumn}>
              <Plus className="mr-1.5 h-4 w-4" />
              Erste Spalte hinzufügen
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {columns.map((column, index) => (
              <ColumnRow
                key={index}
                column={column}
                index={index}
                total={columns.length}
                onUpdate={handleUpdateColumn}
                onRemove={handleRemoveColumn}
                onMove={handleMoveColumn}
                onUpdateTransformations={handleUpdateTransformations}
              />
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddColumn}
              className="mt-2"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Spalte hinzufügen
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** A single column configuration row. */
function ColumnRow({
  column,
  index,
  total,
  onUpdate,
  onRemove,
  onMove,
  onUpdateTransformations,
}: {
  column: ErpColumnMappingExtended;
  index: number;
  total: number;
  onUpdate: (index: number, field: keyof ErpColumnMappingExtended, value: unknown) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: "up" | "down") => void;
  onUpdateTransformations: (index: number, transformations: ErpTransformationStep[]) => void;
}) {
  // OPH-60: Determine if this column uses a fixed value
  const isFixed = column.fixed_value !== undefined && column.fixed_value !== null;

  return (
    <div className="rounded-lg border p-3 space-y-3">
      {/* Row header with ordering controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground/50" />
          <span className="text-xs font-medium text-muted-foreground">
            Spalte {index + 1}
          </span>
          {column.required && (
            <span className="text-xs text-red-600 font-medium">Pflichtfeld</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onMove(index, "up")}
            disabled={index === 0}
            aria-label="Nach oben verschieben"
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onMove(index, "down")}
            disabled={index === total - 1}
            aria-label="Nach unten verschieben"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={() => onRemove(index)}
            aria-label="Spalte entfernen"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Main fields */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Target column name */}
        <div className="space-y-1.5">
          <Label className="text-xs">Ausgabe-Spaltenname *</Label>
          <Input
            value={column.target_column_name}
            onChange={(e) => onUpdate(index, "target_column_name", e.target.value)}
            placeholder="z.B. Bestellnummer"
            className="h-8 text-xs"
          />
        </div>

        {/* OPH-60: Source type — dynamic extraction or fixed value */}
        {isFixed ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Fester Wert</Label>
              <Badge
                variant="outline"
                className="text-[10px] px-1 py-0 cursor-pointer hover:bg-muted"
                onClick={() => {
                  onUpdate(index, "fixed_value", null);
                  onUpdate(index, "source_field", "");
                }}
              >
                Zu Extraktion wechseln
              </Badge>
            </div>
            <Input
              value={column.fixed_value ?? ""}
              onChange={(e) => onUpdate(index, "fixed_value", e.target.value)}
              placeholder='z.B. 81, EUR, ...'
              className="h-8 text-xs"
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Quellfeld (Canonical JSON) *</Label>
              <Badge
                variant="outline"
                className="text-[10px] px-1 py-0 cursor-pointer hover:bg-muted"
                onClick={() => {
                  onUpdate(index, "fixed_value", "");
                  onUpdate(index, "source_field", "");
                }}
              >
                Fester Wert
              </Badge>
            </div>
            <Input
              value={column.source_field}
              onChange={(e) => onUpdate(index, "source_field", e.target.value)}
              placeholder="z.B. order.order_number"
              className="h-8 text-xs font-mono"
              list={`source-suggestions-${index}`}
            />
            <datalist id={`source-suggestions-${index}`}>
              {SOURCE_FIELD_SUGGESTIONS.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
        )}

        {/* Required toggle */}
        <div className="flex items-center gap-2 pt-5">
          <Switch
            checked={column.required ?? false}
            onCheckedChange={(checked) => onUpdate(index, "required", checked)}
            id={`required-${index}`}
          />
          <Label htmlFor={`required-${index}`} className="text-xs">
            Pflichtfeld
          </Label>
        </div>
      </div>

      {/* Transformations — hidden for fixed-value columns */}
      {!isFixed && (
        <ErpTransformationEditor
          transformations={column.transformations}
          onChange={(transforms) => onUpdateTransformations(index, transforms)}
        />
      )}
    </div>
  );
}
