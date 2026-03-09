"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FieldMapping } from "@/lib/types";

interface TransformationPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mapping: FieldMapping;
  onSave: (updated: FieldMapping) => void;
}

type TransformationType = FieldMapping["transformation_type"];

const TYPE_LABELS: Record<TransformationType, string> = {
  none: "Kein (Wert direkt)",
  date: "Datumsformat",
  number: "Zahlenformat",
  prefix_suffix: "Text-Praefix / -Suffix",
};

/**
 * OPH-32: Dialog for selecting and configuring a transformation
 * for a field mapping (date format, number format, prefix/suffix).
 */
export function TransformationPicker({
  open,
  onOpenChange,
  mapping,
  onSave,
}: TransformationPickerProps) {
  const [type, setType] = useState<TransformationType>(
    mapping.transformation_type
  );
  const [format, setFormat] = useState(
    mapping.transformation_options?.format ?? ""
  );
  const [prefix, setPrefix] = useState(
    mapping.transformation_options?.prefix ?? ""
  );
  const [suffix, setSuffix] = useState(
    mapping.transformation_options?.suffix ?? ""
  );

  const handleSave = useCallback(() => {
    const updated: FieldMapping = {
      ...mapping,
      transformation_type: type,
      transformation_options:
        type === "none"
          ? undefined
          : type === "date"
            ? { format: format || "DD.MM.YYYY" }
            : type === "number"
              ? { format: format || "2" }
              : type === "prefix_suffix"
                ? { prefix, suffix }
                : undefined,
    };
    onSave(updated);
  }, [mapping, type, format, prefix, suffix, onSave]);

  // Preview of the resulting Handlebars expression
  const preview = (() => {
    const vp = mapping.variable_path;
    switch (type) {
      case "date":
        return `{{formatDate ${vp} "${format || "DD.MM.YYYY"}"}}`;
      case "number":
        return `{{formatNumber ${vp} ${format || "2"}}}`;
      case "prefix_suffix":
        return `${prefix}{{${vp}}}${suffix}`;
      case "none":
      default:
        return `{{${vp}}}`;
    }
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            Transformation: {mapping.target_field}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Variable info */}
          <div className="text-sm">
            <span className="text-muted-foreground">Variable: </span>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {`{{${mapping.variable_path}}}`}
            </code>
          </div>

          {/* Transformation type */}
          <div className="space-y-1.5">
            <Label className="text-sm">Transformation</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as TransformationType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABELS) as TransformationType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Format options based on type */}
          {type === "date" && (
            <div className="space-y-1.5">
              <Label className="text-sm">Datumsformat</Label>
              <Input
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                placeholder="DD.MM.YYYY"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Beispiele: DD.MM.YYYY, YYYY-MM-DD, DD/MM/YYYY
              </p>
            </div>
          )}

          {type === "number" && (
            <div className="space-y-1.5">
              <Label className="text-sm">Dezimalstellen</Label>
              <Input
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                placeholder="2"
                className="font-mono text-sm"
                type="number"
                min={0}
                max={10}
              />
              <p className="text-xs text-muted-foreground">
                Anzahl der Nachkommastellen (z.B. 2 fuer 1.00).
              </p>
            </div>
          )}

          {type === "prefix_suffix" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Praefix</Label>
                <Input
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="z.B. ART-"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Suffix</Label>
                <Input
                  value={suffix}
                  onChange={(e) => setSuffix(e.target.value)}
                  placeholder="z.B. -DE"
                  className="font-mono text-sm"
                />
              </div>
            </div>
          )}

          {/* Preview */}
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">Vorschau</Label>
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <code className="font-mono text-xs break-all">{preview}</code>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave}>Uebernehmen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
