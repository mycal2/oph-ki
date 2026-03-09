"use client";

import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  Wand2,
  X,
  GripVertical,
  AlertTriangle,
  Loader2,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TransformationPicker } from "@/components/admin/transformation-picker";
import type {
  OutputFormatSchemaColumn,
  TenantOutputFormat,
  FieldMapping,
  XmlStructureNode,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Variable definitions (same as in erp-xml-template-editor.tsx, grouped)
// ---------------------------------------------------------------------------

interface VariableDefinition {
  path: string;
  description: string;
}

interface VariableGroup {
  label: string;
  variables: VariableDefinition[];
}

const VARIABLE_GROUPS: VariableGroup[] = [
  {
    label: "Bestellung",
    variables: [
      { path: "order.order_number", description: "Bestellnummer" },
      { path: "order.order_date", description: "Bestelldatum" },
      { path: "order.currency", description: "Waehrung" },
      { path: "order.total_amount", description: "Gesamtbetrag" },
      { path: "order.notes", description: "Notizen" },
      { path: "order.dealer.name", description: "Haendlername" },
    ],
  },
  {
    label: "Absender",
    variables: [
      { path: "order.sender.company_name", description: "Firma" },
      { path: "order.sender.customer_number", description: "Kundennummer" },
      { path: "order.sender.email", description: "E-Mail" },
      { path: "order.sender.phone", description: "Telefon" },
      { path: "order.sender.street", description: "Strasse" },
      { path: "order.sender.city", description: "Stadt" },
      { path: "order.sender.postal_code", description: "PLZ" },
      { path: "order.sender.country", description: "Land" },
    ],
  },
  {
    label: "Lieferadresse",
    variables: [
      { path: "order.delivery_address.company", description: "Firma" },
      { path: "order.delivery_address.street", description: "Strasse" },
      { path: "order.delivery_address.city", description: "Stadt" },
      { path: "order.delivery_address.postal_code", description: "PLZ" },
      { path: "order.delivery_address.country", description: "Land" },
    ],
  },
  {
    label: "Bestellpositionen",
    variables: [
      { path: "this.position", description: "Position" },
      { path: "this.article_number", description: "Artikelnummer" },
      { path: "this.description", description: "Beschreibung" },
      { path: "this.quantity", description: "Menge" },
      { path: "this.unit", description: "Einheit" },
      { path: "this.unit_price", description: "Stueckpreis" },
      { path: "this.total_price", description: "Gesamtpreis" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FieldMapperPanelProps {
  outputFormat: TenantOutputFormat;
  configName: string;
  currentTemplate: string;
  onGenerateTemplate: (template: string) => void;
  onSaveMappings: (mappings: FieldMapping[]) => Promise<boolean>;
  isSaving: boolean;
}

// ---------------------------------------------------------------------------
// Helpers: determine which fields belong to repeating section
// ---------------------------------------------------------------------------

/**
 * Collect tag names from repeating (is_array) nodes in the XML structure tree.
 */
function collectRepeatingFieldNames(node: XmlStructureNode): Set<string> {
  const names = new Set<string>();

  function walk(n: XmlStructureNode, insideArray: boolean) {
    if (n.is_array || insideArray) {
      // Leaf inside array -> it's a repeating field
      if (n.text !== undefined && (!n.children || n.children.length === 0)) {
        names.add(n.tag);
      }
      if (n.children) {
        for (const child of n.children) {
          walk(child, true);
        }
      }
    } else if (n.children) {
      for (const child of n.children) {
        walk(child, false);
      }
    }
  }

  walk(node, false);
  return names;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A draggable variable chip in the right panel. */
function DraggableVariableChip({
  variable,
}: {
  variable: VariableDefinition;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `var-${variable.path}`,
    data: { variablePath: variable.path },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs cursor-grab active:cursor-grabbing transition-colors hover:border-primary/50 hover:bg-primary/5 ${
        isDragging ? "opacity-50" : ""
      }`}
      role="button"
      aria-label={`Variable ${variable.path} ziehen`}
    >
      <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
      <code className="font-mono text-[10px] shrink-0">{`{{${variable.path}}}`}</code>
      <span className="text-muted-foreground truncate">{variable.description}</span>
    </div>
  );
}

/** The drag overlay that follows the pointer during drag. */
function DragOverlayContent({ variablePath }: { variablePath: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-primary bg-background px-2 py-1 text-xs shadow-lg">
      <GripVertical className="h-3 w-3 text-primary shrink-0" />
      <code className="font-mono text-[10px]">{`{{${variablePath}}}`}</code>
    </div>
  );
}

/** A drop zone for a single target field. */
function TargetFieldDropZone({
  fieldName,
  dataType,
  isRequired,
  mapping,
  onRemoveMapping,
  onEditTransformation,
}: {
  fieldName: string;
  dataType: string;
  isRequired: boolean;
  mapping: FieldMapping | undefined;
  onRemoveMapping: (fieldName: string) => void;
  onEditTransformation: (fieldName: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `field-${fieldName}`,
    data: { fieldName },
  });

  const dataTypeLabel =
    dataType === "number" ? "Zahl" : dataType === "date" ? "Datum" : "Text";

  const transformationLabel = mapping
    ? mapping.transformation_type === "date"
      ? "Datum"
      : mapping.transformation_type === "number"
        ? "Zahl"
        : mapping.transformation_type === "prefix_suffix"
          ? "Prefix/Suffix"
          : null
    : null;

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-2 rounded-md border px-3 py-2 min-h-[44px] transition-colors ${
        isOver
          ? "border-primary bg-primary/10"
          : mapping
            ? "border-green-500/30 bg-green-50/50 dark:bg-green-950/20"
            : "border-dashed"
      }`}
    >
      {/* Field name + type */}
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <span className="text-sm font-mono truncate max-w-[200px]">{fieldName}</span>
        <Badge variant="outline" className="text-[9px] font-normal shrink-0">
          {dataTypeLabel}
        </Badge>
        {isRequired && (
          <Badge variant="secondary" className="text-[9px] font-normal shrink-0">
            Pflicht
          </Badge>
        )}
      </div>

      {/* Arrow or spacer */}
      <span className="text-muted-foreground text-xs shrink-0 mx-1">
        {mapping ? " -> " : ""}
      </span>

      {/* Mapping or drop target */}
      <div className="flex-1 min-w-0">
        {mapping ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant="default"
              className="cursor-pointer hover:bg-primary/80 text-[10px] font-mono"
              onClick={() => onEditTransformation(fieldName)}
            >
              {`{{${mapping.variable_path}}}`}
              {transformationLabel && (
                <span className="ml-1 font-sans text-[9px] opacity-80">
                  ({transformationLabel})
                </span>
              )}
            </Badge>
            <button
              type="button"
              onClick={() => onRemoveMapping(fieldName)}
              className="rounded-full p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label={`Zuordnung fuer ${fieldName} entfernen`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">
            {isOver ? "Loslassen zum Zuordnen" : "Hierher ziehen"}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FieldMapperPanel({
  outputFormat,
  configName,
  currentTemplate,
  onGenerateTemplate,
  onSaveMappings,
  isSaving,
}: FieldMapperPanelProps) {
  const [mappings, setMappings] = useState<FieldMapping[]>(
    outputFormat.field_mappings ?? []
  );
  const [activeDragPath, setActiveDragPath] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [overwriteConfirmOpen, setOverwriteConfirmOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Build mapping lookup
  const mappingMap = useMemo(() => {
    const map = new Map<string, FieldMapping>();
    for (const m of mappings) {
      map.set(m.target_field, m);
    }
    return map;
  }, [mappings]);

  // Determine which fields are repeating (line items) vs header
  const { headerFields, lineItemFields } = useMemo(() => {
    const columns = outputFormat.detected_schema;
    if (
      outputFormat.file_type === "xml" &&
      outputFormat.xml_structure
    ) {
      const repeatingNames = collectRepeatingFieldNames(outputFormat.xml_structure);
      const header: OutputFormatSchemaColumn[] = [];
      const lineItems: OutputFormatSchemaColumn[] = [];
      for (const col of columns) {
        if (repeatingNames.has(col.column_name)) {
          lineItems.push(col);
        } else {
          header.push(col);
        }
      }
      return { headerFields: header, lineItemFields: lineItems };
    }
    // For flat formats, all fields are treated as line-item by default
    return { headerFields: [] as OutputFormatSchemaColumn[], lineItemFields: columns };
  }, [outputFormat]);

  // Check for unmapped required fields
  const unmappedRequired = useMemo(() => {
    return outputFormat.detected_schema.filter(
      (c) => c.is_required && !mappingMap.has(c.column_name)
    );
  }, [outputFormat.detected_schema, mappingMap]);

  // Drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const path = event.active.data.current?.variablePath as string | undefined;
    setActiveDragPath(path ?? null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragPath(null);

      const { active, over } = event;
      if (!over) return;

      const variablePath = active.data.current?.variablePath as string | undefined;
      const fieldName = over.data.current?.fieldName as string | undefined;
      if (!variablePath || !fieldName) return;

      // Create or update the mapping for this field
      setMappings((prev) => {
        const existing = prev.find((m) => m.target_field === fieldName);
        if (existing) {
          return prev.map((m) =>
            m.target_field === fieldName
              ? { ...m, variable_path: variablePath }
              : m
          );
        }
        return [
          ...prev,
          {
            target_field: fieldName,
            variable_path: variablePath,
            transformation_type: "none" as const,
          },
        ];
      });

      // Open transformation picker for the newly mapped field
      setEditingField(fieldName);
    },
    []
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragPath(null);
  }, []);

  const handleRemoveMapping = useCallback((fieldName: string) => {
    setMappings((prev) => prev.filter((m) => m.target_field !== fieldName));
  }, []);

  const handleEditTransformation = useCallback((fieldName: string) => {
    setEditingField(fieldName);
  }, []);

  const handleTransformationSave = useCallback(
    (updated: FieldMapping) => {
      setMappings((prev) =>
        prev.map((m) => (m.target_field === updated.target_field ? updated : m))
      );
      setEditingField(null);
    },
    []
  );

  const handleTransformationClose = useCallback(() => {
    setEditingField(null);
  }, []);

  // Save mappings to backend
  const handleSaveMappings = useCallback(async () => {
    await onSaveMappings(mappings);
  }, [mappings, onSaveMappings]);

  // Generate template from mappings
  const handleGenerateTemplate = useCallback(async () => {
    // First save mappings
    const saved = await onSaveMappings(mappings);
    if (!saved) return;

    // Import the generator
    const { generateTemplateFromMappings } = await import(
      "@/lib/generate-template-from-mappings"
    );

    const result = generateTemplateFromMappings(
      outputFormat.detected_schema,
      outputFormat.file_type,
      configName,
      mappings,
      outputFormat.xml_structure
    );

    if (!result.template) return;

    // Check if template already has content
    if (currentTemplate.trim()) {
      setPendingTemplate(result.template);
      setOverwriteConfirmOpen(true);
    } else {
      onGenerateTemplate(result.template);
    }
  }, [
    mappings,
    outputFormat,
    configName,
    currentTemplate,
    onSaveMappings,
    onGenerateTemplate,
  ]);

  const handleConfirmOverwrite = useCallback(() => {
    if (pendingTemplate) {
      onGenerateTemplate(pendingTemplate);
    }
    setOverwriteConfirmOpen(false);
    setPendingTemplate(null);
  }, [pendingTemplate, onGenerateTemplate]);

  // The field being edited in the transformation picker
  const editingMapping = editingField ? mappingMap.get(editingField) : undefined;

  // No fields detected
  if (outputFormat.detected_schema.length === 0) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Keine Felder erkannt -- bitte zuerst eine Beispieldatei hochladen.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Feld-Zuordnung (Field Mapper)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Ziehen Sie eine Variable aus der rechten Spalte auf ein Zielfeld links, um die
            Zuordnung herzustellen. Optional koennen Sie danach eine Transformation konfigurieren.
          </p>
        </CardHeader>
        <CardContent>
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
              {/* Right column: Available variables (shown first on mobile, sticky on desktop) */}
              <div className="lg:order-2 lg:sticky lg:top-4 lg:self-start space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Verfuegbare Variablen
                </h4>
                <div className="space-y-4">
                    {VARIABLE_GROUPS.map((group) => (
                      <div key={group.label} className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          {group.label}
                        </p>
                        <div className="space-y-1">
                          {group.variables.map((v) => (
                            <DraggableVariableChip key={v.path} variable={v} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
              </div>

              {/* Left column: Target fields */}
              <div className="lg:order-1 space-y-4">
                {/* Header fields (only for XML with structure) */}
                {headerFields.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">
                      Bestellkopf-Felder
                    </h4>
                    <div className="space-y-1.5">
                      {headerFields.map((col) => (
                        <TargetFieldDropZone
                          key={col.column_name}
                          fieldName={col.column_name}
                          dataType={col.data_type}
                          isRequired={col.is_required}
                          mapping={mappingMap.get(col.column_name)}
                          onRemoveMapping={handleRemoveMapping}
                          onEditTransformation={handleEditTransformation}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {headerFields.length > 0 && lineItemFields.length > 0 && (
                  <Separator />
                )}

                {/* Line item fields */}
                {lineItemFields.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">
                      {outputFormat.file_type === "xml" && headerFields.length > 0
                        ? "Bestellpositionen (Wiederholend)"
                        : "Zielfelder"}
                    </h4>
                    <div className="space-y-1.5">
                        {lineItemFields.map((col) => (
                          <TargetFieldDropZone
                            key={col.column_name}
                            fieldName={col.column_name}
                            dataType={col.data_type}
                            isRequired={col.is_required}
                            mapping={mappingMap.get(col.column_name)}
                            onRemoveMapping={handleRemoveMapping}
                            onEditTransformation={handleEditTransformation}
                          />
                        ))}
                      </div>
                  </div>
                )}

                {/* Summary */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2">
                  <span>
                    {mappings.length} von {outputFormat.detected_schema.length} Feldern zugeordnet
                  </span>
                  {unmappedRequired.length > 0 && (
                    <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {unmappedRequired.length} Pflichtfeld(er) ohne Zuordnung
                    </span>
                  )}
                </div>
              </div>

            </div>

            {/* Drag overlay */}
            <DragOverlay>
              {activeDragPath ? (
                <DragOverlayContent variablePath={activeDragPath} />
              ) : null}
            </DragOverlay>
          </DndContext>

          <Separator className="my-4" />

          {/* Unmapped required fields warning */}
          {unmappedRequired.length > 0 && (
            <Alert className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>{unmappedRequired.length} Pflichtfeld(er)</strong> haben keine Zuordnung:{" "}
                {unmappedRequired.map((c) => c.column_name).join(", ")}
              </AlertDescription>
            </Alert>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={handleGenerateTemplate}
              disabled={mappings.length === 0 || isSaving}
            >
              {isSaving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-1.5 h-4 w-4" />
              )}
              Template generieren
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveMappings}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              Zuordnungen speichern
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transformation picker popover */}
      {editingField && editingMapping && (
        <TransformationPicker
          open={!!editingField}
          onOpenChange={(open) => {
            if (!open) handleTransformationClose();
          }}
          mapping={editingMapping}
          onSave={handleTransformationSave}
        />
      )}

      {/* Overwrite confirmation dialog */}
      <Dialog open={overwriteConfirmOpen} onOpenChange={setOverwriteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bestehendes Template ueberschreiben?</DialogTitle>
            <DialogDescription>
              Das XML-Template-Feld enthaelt bereits Inhalt. Moechten Sie diesen durch
              das aus den Zuordnungen generierte Template ersetzen?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setOverwriteConfirmOpen(false);
                setPendingTemplate(null);
              }}
            >
              Abbrechen
            </Button>
            <Button onClick={handleConfirmOverwrite}>Ueberschreiben</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
