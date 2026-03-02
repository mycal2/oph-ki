"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Trash2, ChevronUp, ChevronDown, Save, AlertTriangle } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useDealerColumnMappings } from "@/hooks/use-dealer-column-mappings";
import type {
  ColumnMappingFormatType,
  ColumnMappingMatchType,
  ColumnMappingEntry,
} from "@/lib/types";

interface DealerColumnMappingTabProps {
  dealerId: string;
}

const FORMAT_TYPE_OPTIONS: { value: ColumnMappingFormatType; label: string }[] = [
  { value: "pdf_table", label: "PDF-Tabelle" },
  { value: "excel", label: "Excel" },
  { value: "email_text", label: "E-Mail-Text" },
];

const MATCH_TYPE_OPTIONS: { value: ColumnMappingMatchType; label: string }[] = [
  { value: "position", label: "Position" },
  { value: "header", label: "Header" },
  { value: "both", label: "Beides" },
];

/** Common canonical field suggestions. */
const FIELD_SUGGESTIONS = [
  "order_number",
  "order_date",
  "items[].product_code",
  "items[].description",
  "items[].quantity",
  "items[].unit",
  "items[].unit_price",
  "items[].total_price",
  "items[].iso_number",
  "items[].ean_code",
  "items[].manufacturer_code",
  "sender.customer_number",
  "sender.company_name",
  "delivery_address.company",
  "total_amount",
  "currency",
  "notes",
];

/** Entry with a stable client-side key for React reconciliation. */
interface KeyedEntry extends ColumnMappingEntry {
  _key: string;
}

let nextEntryKey = 0;

function withKey(entry: ColumnMappingEntry): KeyedEntry {
  return { ...entry, _key: `cm-${nextEntryKey++}` };
}

function stripKey({ _key, ...rest }: KeyedEntry): ColumnMappingEntry {
  return rest;
}

function createEmptyEntry(): KeyedEntry {
  return {
    _key: `cm-${nextEntryKey++}`,
    match_type: "position",
    position: null,
    header_text: null,
    target_field: "",
  };
}

export function DealerColumnMappingTab({ dealerId }: DealerColumnMappingTabProps) {
  const {
    profiles,
    isLoading,
    isSaving,
    error,
    saveError,
    clearSaveError,
    fetchProfiles,
    saveProfile,
    deleteProfile,
  } = useDealerColumnMappings();

  const [activeFormatType, setActiveFormatType] = useState<ColumnMappingFormatType>("pdf_table");
  const [editingMappings, setEditingMappings] = useState<KeyedEntry[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load profiles when dealerId changes
  useEffect(() => {
    fetchProfiles(dealerId);
  }, [dealerId, fetchProfiles]);

  // Sync editing state when profile or tab changes
  useEffect(() => {
    const profile = profiles.find((p) => p.format_type === activeFormatType);
    setEditingMappings(profile ? profile.mappings.map(withKey) : []);
    setIsDirty(false);
    setValidationErrors([]);
    setSuccessMessage(null);
    clearSaveError();
  }, [profiles, activeFormatType, clearSaveError]);

  const currentProfile = profiles.find((p) => p.format_type === activeFormatType);
  const hasProfile = !!currentProfile;

  const handleCreateProfile = useCallback(() => {
    setEditingMappings([createEmptyEntry()]);
    setIsDirty(true);
    setSuccessMessage(null);
  }, []);

  const handleAddRow = useCallback(() => {
    setEditingMappings((prev) => [...prev, createEmptyEntry()]);
    setIsDirty(true);
  }, []);

  const handleRemoveRow = useCallback((index: number) => {
    setEditingMappings((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  }, []);

  const handleFormatTypeChange = useCallback(
    (newType: string) => {
      if (isDirty) {
        const confirmed = window.confirm(
          "Es gibt ungespeicherte Aenderungen. Moechten Sie den Tab wirklich wechseln?"
        );
        if (!confirmed) return;
      }
      setActiveFormatType(newType as ColumnMappingFormatType);
    },
    [isDirty]
  );

  const handleUpdateEntry = useCallback(
    (index: number, field: keyof ColumnMappingEntry, value: unknown) => {
      setEditingMappings((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };
        return updated;
      });
      setIsDirty(true);
      setSuccessMessage(null);
    },
    []
  );

  const handleMoveRow = useCallback((index: number, direction: "up" | "down") => {
    setEditingMappings((prev) => {
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      const updated = [...prev];
      [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
      return updated;
    });
    setIsDirty(true);
  }, []);

  const validate = useCallback((): string[] => {
    const errors: string[] = [];

    if (editingMappings.length === 0) {
      errors.push("Mindestens eine Spalten-Zuordnung ist erforderlich.");
      return errors;
    }

    const targets = new Set<string>();
    const positions = new Set<number>();

    editingMappings.forEach((entry, i) => {
      const row = i + 1;

      if (!entry.target_field.trim()) {
        errors.push(`Zeile ${row}: Zielfeld ist erforderlich.`);
      } else {
        const lowerTarget = entry.target_field.toLowerCase();
        if (targets.has(lowerTarget)) {
          errors.push(`Zeile ${row}: Zielfeld "${entry.target_field}" ist doppelt vergeben.`);
        }
        targets.add(lowerTarget);
      }

      if (entry.match_type === "position" || entry.match_type === "both") {
        if (entry.position === null || entry.position < 1) {
          errors.push(`Zeile ${row}: Position muss mindestens 1 sein.`);
        } else if (positions.has(entry.position)) {
          errors.push(`Zeile ${row}: Position ${entry.position} ist doppelt vergeben.`);
        } else {
          positions.add(entry.position);
        }
      }

      if (entry.match_type === "header" || entry.match_type === "both") {
        if (!entry.header_text?.trim()) {
          errors.push(`Zeile ${row}: Header-Text ist erforderlich.`);
        }
      }
    });

    return errors;
  }, [editingMappings]);

  const handleSave = useCallback(async () => {
    setSuccessMessage(null);
    const errors = validate();
    setValidationErrors(errors);
    if (errors.length > 0) return;

    const success = await saveProfile(dealerId, activeFormatType, editingMappings.map(stripKey));
    if (success) {
      setIsDirty(false);
      setSuccessMessage("Spalten-Mapping gespeichert.");
    }
  }, [validate, saveProfile, dealerId, activeFormatType, editingMappings]);

  const handleDelete = useCallback(async () => {
    const confirmed = window.confirm(
      "Moechten Sie dieses Profil wirklich loeschen? Diese Aktion kann nicht rueckgaengig gemacht werden."
    );
    if (!confirmed) return;

    const success = await deleteProfile(dealerId, activeFormatType);
    if (success) {
      setEditingMappings([]);
      setIsDirty(false);
      setSuccessMessage("Profil geloescht.");
    }
  }, [deleteProfile, dealerId, activeFormatType]);

  if (isLoading) {
    return (
      <div className="space-y-4 px-6 pb-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 pb-6">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="px-6 pb-6 space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          Definieren Sie, welche Spalte in den Bestellungen dieses Haendlers welchem
          Canonical-JSON-Feld entspricht. Pro Format-Typ ein Profil.
        </p>
      </div>

      {/* Format type sub-tabs */}
      <Tabs
        value={activeFormatType}
        onValueChange={handleFormatTypeChange}
      >
        <TabsList>
          {FORMAT_TYPE_OPTIONS.map((opt) => {
            const hasData = profiles.some((p) => p.format_type === opt.value);
            return (
              <TabsTrigger key={opt.value} value={opt.value} className="gap-1.5">
                {opt.label}
                {hasData && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                    {profiles.find((p) => p.format_type === opt.value)!.mappings.length}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {FORMAT_TYPE_OPTIONS.map((opt) => (
          <TabsContent key={opt.value} value={opt.value} className="mt-4 space-y-4">
            {/* Error / success messages */}
            {saveError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}
            {successMessage && (
              <Alert>
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            )}
            {validationErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc pl-4 space-y-0.5 text-xs">
                    {validationErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* No profile yet */}
            {!hasProfile && editingMappings.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
                <p className="text-sm text-muted-foreground mb-3">
                  Kein Spalten-Mapping fuer {opt.label} konfiguriert.
                </p>
                <Button size="sm" onClick={handleCreateProfile}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Profil erstellen
                </Button>
              </div>
            ) : (
              <>
                {/* Mapping rows */}
                <div className="space-y-3">
                  {editingMappings.map((entry, index) => (
                    <MappingRow
                      key={entry._key}
                      entry={entry}
                      index={index}
                      total={editingMappings.length}
                      onUpdate={handleUpdateEntry}
                      onRemove={handleRemoveRow}
                      onMove={handleMoveRow}
                    />
                  ))}
                </div>

                {/* Add row */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddRow}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Zeile hinzufuegen
                </Button>

                <Separator />

                {/* Actions */}
                <div className="flex items-center justify-between">
                  <div>
                    {hasProfile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={handleDelete}
                        disabled={isSaving}
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        Profil loeschen
                      </Button>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving || (!isDirty && hasProfile)}
                  >
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-1.5 h-4 w-4" />
                    Spalten-Mapping speichern
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/** A single mapping row. */
function MappingRow({
  entry,
  index,
  total,
  onUpdate,
  onRemove,
  onMove,
}: {
  entry: KeyedEntry;
  index: number;
  total: number;
  onUpdate: (index: number, field: keyof ColumnMappingEntry, value: unknown) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: "up" | "down") => void;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Zuordnung {index + 1}
        </span>
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
            aria-label="Zuordnung entfernen"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Match type */}
        <div className="space-y-1.5">
          <Label className="text-xs">Match-Typ</Label>
          <Select
            value={entry.match_type}
            onValueChange={(v) => onUpdate(index, "match_type", v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MATCH_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Target field */}
        <div className="space-y-1.5">
          <Label className="text-xs">Zielfeld *</Label>
          <Input
            value={entry.target_field}
            onChange={(e) => onUpdate(index, "target_field", e.target.value)}
            placeholder="z.B. items[].product_code"
            className="h-8 text-xs font-mono"
            list={`field-suggestions-${index}`}
          />
          <datalist id={`field-suggestions-${index}`}>
            {FIELD_SUGGESTIONS.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Position */}
        {(entry.match_type === "position" || entry.match_type === "both") && (
          <div className="space-y-1.5">
            <Label className="text-xs">Spalten-Position *</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={entry.position ?? ""}
              onChange={(e) =>
                onUpdate(
                  index,
                  "position",
                  e.target.value ? parseInt(e.target.value, 10) : null
                )
              }
              placeholder="1"
              className="h-8 text-xs"
            />
          </div>
        )}

        {/* Header text */}
        {(entry.match_type === "header" || entry.match_type === "both") && (
          <div className="space-y-1.5">
            <Label className="text-xs">Header-Text *</Label>
            <Input
              value={entry.header_text ?? ""}
              onChange={(e) =>
                onUpdate(index, "header_text", e.target.value || null)
              }
              placeholder="z.B. Best.-Nr."
              className="h-8 text-xs"
            />
          </div>
        )}
      </div>
    </div>
  );
}
