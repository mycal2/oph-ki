"use client";

import { useCallback } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ErpTransformationStep } from "@/lib/types";

const TRANSFORM_OPTIONS: {
  value: ErpTransformationStep["type"];
  label: string;
  hasParam: boolean;
  paramLabel?: string;
  paramPlaceholder?: string;
}[] = [
  { value: "to_uppercase", label: "Grossbuchstaben", hasParam: false },
  { value: "to_lowercase", label: "Kleinbuchstaben", hasParam: false },
  { value: "trim", label: "Leerzeichen entfernen", hasParam: false },
  { value: "round", label: "Runden", hasParam: true, paramLabel: "Dezimalstellen", paramPlaceholder: "2" },
  { value: "multiply", label: "Multiplizieren", hasParam: true, paramLabel: "Faktor", paramPlaceholder: "1.19" },
  { value: "date_format", label: "Datumsformat", hasParam: true, paramLabel: "Pattern", paramPlaceholder: "dd.MM.yyyy" },
  { value: "default", label: "Standardwert", hasParam: true, paramLabel: "Fallback-Wert", paramPlaceholder: "N/A" },
];

interface ErpTransformationEditorProps {
  transformations: ErpTransformationStep[];
  onChange: (transformations: ErpTransformationStep[]) => void;
}

export function ErpTransformationEditor({
  transformations,
  onChange,
}: ErpTransformationEditorProps) {
  const handleAdd = useCallback(() => {
    onChange([...transformations, { type: "trim" }]);
  }, [transformations, onChange]);

  const handleRemove = useCallback(
    (index: number) => {
      onChange(transformations.filter((_, i) => i !== index));
    },
    [transformations, onChange]
  );

  const handleUpdateType = useCallback(
    (index: number, type: ErpTransformationStep["type"]) => {
      const updated = [...transformations];
      const option = TRANSFORM_OPTIONS.find((o) => o.value === type);
      updated[index] = { type, param: option?.hasParam ? "" : undefined };
      onChange(updated);
    },
    [transformations, onChange]
  );

  const handleUpdateParam = useCallback(
    (index: number, param: string) => {
      const updated = [...transformations];
      updated[index] = { ...updated[index], param };
      onChange(updated);
    },
    [transformations, onChange]
  );

  const handleMove = useCallback(
    (index: number, direction: "up" | "down") => {
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= transformations.length) return;
      const updated = [...transformations];
      [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
      onChange(updated);
    },
    [transformations, onChange]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Transformationen</Label>
        {transformations.length < 10 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={handleAdd}
          >
            <Plus className="mr-1 h-3 w-3" />
            Transformation
          </Button>
        )}
      </div>

      {transformations.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">
          Keine Transformationen konfiguriert.
        </p>
      ) : (
        <div className="space-y-1.5">
          {transformations.map((transform, index) => {
            const option = TRANSFORM_OPTIONS.find((o) => o.value === transform.type);
            return (
              <div
                key={index}
                className="flex items-center gap-2 rounded border bg-muted/30 px-2 py-1.5"
              >
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {index + 1}
                </Badge>

                {/* Transform type */}
                <Select
                  value={transform.type}
                  onValueChange={(v) => handleUpdateType(index, v as ErpTransformationStep["type"])}
                >
                  <SelectTrigger className="h-7 w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSFORM_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Parameter input (if needed) */}
                {option?.hasParam && (
                  <Input
                    value={transform.param ?? ""}
                    onChange={(e) => handleUpdateParam(index, e.target.value)}
                    placeholder={option.paramPlaceholder}
                    className="h-7 w-28 text-xs font-mono"
                    aria-label={option.paramLabel}
                  />
                )}

                {/* Move / remove */}
                <div className="flex items-center gap-0.5 ml-auto shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => handleMove(index, "up")}
                    disabled={index === 0}
                    aria-label="Nach oben"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => handleMove(index, "down")}
                    disabled={index === transformations.length - 1}
                    aria-label="Nach unten"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-destructive hover:text-destructive"
                    onClick={() => handleRemove(index)}
                    aria-label="Entfernen"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
