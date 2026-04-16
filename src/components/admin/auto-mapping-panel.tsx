"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Sparkles,
  Loader2,
  Check,
  CheckCheck,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  AutoMappingResult,
  FieldMapping,
  TenantOutputFormat,
  ApiResponse,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Canonical variable definitions (same as in field-mapper-panel.tsx)
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
      { path: "order.email_subject", description: "E-Mail-Betreff" },
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
      {
        path: "this.dealer_article_number",
        description: "Lieferantenartikelnr.",
      },
      { path: "this.description", description: "Beschreibung" },
      { path: "this.quantity", description: "Menge" },
      { path: "this.unit", description: "Einheit" },
      { path: "this.unit_price", description: "Stueckpreis" },
      { path: "this.total_price", description: "Gesamtpreis" },
    ],
  },
];

/** Build a flat lookup: path -> description */
const CANONICAL_FIELD_MAP = new Map<string, string>();
for (const group of VARIABLE_GROUPS) {
  for (const v of group.variables) {
    CANONICAL_FIELD_MAP.set(v.path, v.description);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AutoMappingRow extends AutoMappingResult {
  /** Whether the admin has confirmed this row (green rows auto-confirmed via bulk, or manually). */
  confirmed: boolean;
  /** The currently selected canonical field (may differ from AI suggestion after manual edit). */
  selected_field: string | null;
}

type PanelStatus = "idle" | "loading" | "done" | "error";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AutoMappingPanelProps {
  configId: string;
  outputFormat: TenantOutputFormat;
  /** OPH-59: Which template slot to auto-map. Defaults to "lines". */
  slot?: "lines" | "header";
  /** Whether the field mapper already has mappings (to show overwrite dialog). */
  hasExistingMappings: boolean;
  /** Callback to apply confirmed mappings to the FieldMapperPanel. */
  onApplyMappings: (mappings: FieldMapping[]) => Promise<boolean>;
  isSaving: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getConfidenceLevel(confidence: number): "green" | "yellow" | "red" {
  if (confidence >= 0.8) return "green";
  if (confidence >= 0.5) return "yellow";
  return "red";
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const level = getConfidenceLevel(confidence);
  const percent = Math.round(confidence * 100);

  const variants: Record<string, string> = {
    green: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    yellow:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    red: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${variants[level]}`}
      aria-label={`Konfidenz: ${percent}%`}
    >
      {percent}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AutoMappingPanel({
  configId,
  outputFormat,
  slot = "lines",
  hasExistingMappings,
  onApplyMappings,
  isSaving,
}: AutoMappingPanelProps) {
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [rows, setRows] = useState<AutoMappingRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [overwriteConfirmOpen, setOverwriteConfirmOpen] = useState(false);

  const hasDetectedSchema =
    outputFormat.detected_schema && outputFormat.detected_schema.length > 0;

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const greenRows = useMemo(
    () => rows.filter((r) => getConfidenceLevel(r.confidence) === "green"),
    [rows]
  );

  const unconfirmedCount = useMemo(
    () => rows.filter((r) => !r.confirmed).length,
    [rows]
  );

  const allConfirmed = useMemo(
    () => rows.length > 0 && rows.every((r) => r.confirmed),
    [rows]
  );

  const unconfirmedGreenCount = useMemo(
    () => greenRows.filter((r) => !r.confirmed).length,
    [greenRows]
  );

  // ---------------------------------------------------------------------------
  // API call: Start auto-mapping
  // ---------------------------------------------------------------------------

  const handleStartAutoMapping = useCallback(async () => {
    setStatus("loading");
    setErrorMessage(null);
    setRows([]);

    try {
      const res = await fetch(
        `/api/admin/erp-configs/${configId}/auto-map`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slot }),
        }
      );
      const json = (await res.json()) as ApiResponse<{
        mappings: AutoMappingResult[];
      }>;

      if (!res.ok || !json.success || !json.data) {
        setStatus("error");
        setErrorMessage(
          json.error ?? "Auto-Mapping fehlgeschlagen. Bitte erneut versuchen."
        );
        return;
      }

      const mappingRows: AutoMappingRow[] = json.data.mappings.map((m) => ({
        ...m,
        confirmed: false,
        selected_field: m.canonical_field,
      }));

      setRows(mappingRows);
      setStatus("done");
    } catch {
      setStatus("error");
      setErrorMessage(
        "Verbindungsfehler. Bitte pruefen Sie Ihre Internetverbindung und versuchen Sie es erneut."
      );
    }
  }, [configId]);

  // ---------------------------------------------------------------------------
  // Row actions
  // ---------------------------------------------------------------------------

  const handleFieldChange = useCallback(
    (rowIndex: number, newField: string | null) => {
      setRows((prev) =>
        prev.map((r, i) =>
          i === rowIndex
            ? { ...r, selected_field: newField, confirmed: true }
            : r
        )
      );
    },
    []
  );

  const handleConfirmRow = useCallback((rowIndex: number) => {
    setRows((prev) =>
      prev.map((r, i) =>
        i === rowIndex ? { ...r, confirmed: true } : r
      )
    );
  }, []);

  const handleBulkConfirm = useCallback(() => {
    setRows((prev) =>
      prev.map((r) =>
        getConfidenceLevel(r.confidence) === "green"
          ? { ...r, confirmed: true }
          : r
      )
    );
  }, []);

  // ---------------------------------------------------------------------------
  // Apply mappings
  // ---------------------------------------------------------------------------

  const buildFieldMappings = useCallback((): FieldMapping[] => {
    return rows
      .filter((r) => r.confirmed && r.selected_field)
      .map((r) => ({
        target_field: r.target_column,
        variable_path: r.selected_field!,
        transformation_type: "none" as const,
      }));
  }, [rows]);

  const handleApplyMappings = useCallback(async () => {
    // Check if field mapper already has mappings -> show overwrite dialog
    if (hasExistingMappings) {
      setOverwriteConfirmOpen(true);
      return;
    }

    const mappings = buildFieldMappings();
    await onApplyMappings(mappings);
  }, [hasExistingMappings, buildFieldMappings, onApplyMappings]);

  const handleConfirmOverwrite = useCallback(async () => {
    setOverwriteConfirmOpen(false);
    const mappings = buildFieldMappings();
    await onApplyMappings(mappings);
  }, [buildFieldMappings, onApplyMappings]);

  // ---------------------------------------------------------------------------
  // Re-run confirmation (EC-5)
  // ---------------------------------------------------------------------------

  const handleRerun = useCallback(() => {
    if (rows.length > 0) {
      // Show a simple confirm before re-running
      const confirmed = window.confirm(
        "Bestehendes Auto-Mapping ueberschreiben?"
      );
      if (!confirmed) return;
    }
    handleStartAutoMapping();
  }, [rows.length, handleStartAutoMapping]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          KI-gesteuerte Feld-Zuordnung
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Lassen Sie die KI automatisch die Spalten aus Ihrer Beispieldatei den
          kanonischen Bestellfeldern zuordnen. Sie koennen jede Zuordnung
          anschliessend pruefen und anpassen.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Idle state: show start button */}
        {status === "idle" && (
          <div className="flex items-center gap-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="sm"
                      onClick={handleStartAutoMapping}
                      disabled={!hasDetectedSchema}
                    >
                      <Sparkles className="mr-1.5 h-4 w-4" />
                      Auto-Mapping starten
                    </Button>
                  </span>
                </TooltipTrigger>
                {!hasDetectedSchema && (
                  <TooltipContent>
                    <p>
                      Bitte laden Sie zuerst eine Beispieldatei hoch, damit
                      Spalten erkannt werden koennen.
                    </p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        )}

        {/* Loading state */}
        {status === "loading" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              KI analysiert die Spalten und erstellt Zuordnungen...
            </div>
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-12" />
                  <Skeleton className="h-8 w-48" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error state */}
        {status === "error" && (
          <div className="space-y-3">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {errorMessage}
              </AlertDescription>
            </Alert>
            <Button
              size="sm"
              variant="outline"
              onClick={handleStartAutoMapping}
            >
              Erneut versuchen
            </Button>
          </div>
        )}

        {/* Done state: mapping review table */}
        {status === "done" && rows.length > 0 && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                {rows.length} Spalten erkannt
              </span>
              <span className="text-muted-foreground">
                {rows.filter((r) => r.confirmed).length} bestaetigt
              </span>
              {unconfirmedCount > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  {unconfirmedCount} offen
                </span>
              )}
            </div>

            {/* Bulk confirm button */}
            {unconfirmedGreenCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkConfirm}
              >
                <CheckCheck className="mr-1.5 h-4 w-4" />
                Alle bestaetigen ({unconfirmedGreenCount} Vorschlaege mit hoher
                Konfidenz)
              </Button>
            )}

            {/* Mapping review table */}
            <div className="max-h-[500px] overflow-y-auto rounded-md border">
              <table className="w-full text-sm" role="table">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Zielspalte
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-muted-foreground w-20">
                      Konfidenz
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Kanonisches Feld
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-muted-foreground w-24">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => {
                    const level = getConfidenceLevel(row.confidence);
                    const isHighlighted = level === "red" && !row.confirmed;

                    return (
                      <tr
                        key={`${rowIndex}-${row.target_column}`}
                        className={`border-t transition-colors ${
                          row.confirmed
                            ? "bg-green-50/30 dark:bg-green-950/10"
                            : isHighlighted
                              ? "bg-amber-50 dark:bg-amber-950/20"
                              : ""
                        }`}
                      >
                        {/* Target column name */}
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs">
                            {row.target_column}
                          </span>
                        </td>

                        {/* Confidence badge */}
                        <td className="px-3 py-2 text-center">
                          <ConfidenceBadge confidence={row.confidence} />
                        </td>

                        {/* Canonical field dropdown */}
                        <td className="px-3 py-2">
                          <Select
                            value={row.selected_field ?? "__unmapped__"}
                            onValueChange={(val) =>
                              handleFieldChange(
                                rowIndex,
                                val === "__unmapped__" ? null : val
                              )
                            }
                          >
                            <SelectTrigger className="h-8 text-xs w-full max-w-[320px]">
                              <SelectValue placeholder="Nicht zugeordnet" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__unmapped__">
                                <span className="text-muted-foreground">
                                  -- Nicht zugeordnet --
                                </span>
                              </SelectItem>
                              {VARIABLE_GROUPS.map((group) => (
                                <SelectGroup key={group.label}>
                                  <SelectLabel>{group.label}</SelectLabel>
                                  {group.variables.map((v) => (
                                    <SelectItem key={v.path} value={v.path}>
                                      <span className="font-mono text-[10px]">
                                        {v.path}
                                      </span>
                                      <span className="ml-2 text-muted-foreground">
                                        ({v.description})
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>

                        {/* Confirm status / button */}
                        <td className="px-3 py-2 text-center">
                          {row.confirmed ? (
                            <Badge
                              variant="outline"
                              className="text-green-700 dark:text-green-400 border-green-300 dark:border-green-700 text-[10px]"
                            >
                              <Check className="mr-1 h-3 w-3" />
                              OK
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                handleConfirmRow(rowIndex)
                              }
                            >
                              <Check className="mr-1 h-3 w-3" />
                              OK
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button
                size="sm"
                onClick={handleApplyMappings}
                disabled={
                  isSaving ||
                  rows.filter((r) => r.confirmed && r.selected_field).length ===
                    0
                }
              >
                {isSaving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-1.5 h-4 w-4" />
                )}
                Mapping uebernehmen
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRerun}
                disabled={isSaving}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                Erneut ausfuehren
              </Button>

              {!allConfirmed && (
                <span className="text-xs text-muted-foreground">
                  {unconfirmedCount} Zuordnung(en) noch nicht bestaetigt
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>

      {/* Overwrite confirmation dialog */}
      <Dialog open={overwriteConfirmOpen} onOpenChange={setOverwriteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bestehende Mappings ueberschreiben?</DialogTitle>
            <DialogDescription>
              Der Visual Field Mapper enthaelt bereits Feld-Zuordnungen. Moechten
              Sie diese durch die KI-generierten Zuordnungen ersetzen?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setOverwriteConfirmOpen(false)}
            >
              Abbrechen
            </Button>
            <Button onClick={handleConfirmOverwrite} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              Ueberschreiben
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
