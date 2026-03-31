"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Save,
  Loader2,
  FlaskConical,
  History,
  AlertTriangle,
  ChevronRight,
  ChevronDown as ChevronDownIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import type {
  ErpConfigDetail,
  ErpConfigSavePayload,
  ErpConfigTestResult,
  ErpConfigAdmin,
  ErpColumnMappingExtended,
  ErpTransformationStep,
  ExportFormat,
  ErpEncoding,
  ErpLineEnding,
  ErpDecimalSeparator,
  ErpFallbackMode,
  TenantOutputFormat,
  FieldMapping,
  ApiResponse,
} from "@/lib/types";
import { CsvColumnBuilder } from "@/components/admin/erp-csv-column-builder";
import { XmlTemplateEditor } from "@/components/admin/erp-xml-template-editor";
import { ErpConfigVersionHistory } from "@/components/admin/erp-config-version-history";
import { ErpConfigTestDialog } from "@/components/admin/erp-config-test-dialog";
import { OutputFormatTab } from "@/components/admin/output-format-tab";
import { XmlTemplateSuggestion } from "@/components/admin/xml-template-suggestion";
import { FieldMapperPanel } from "@/components/admin/field-mapper-panel";
import { AutoMappingPanel } from "@/components/admin/auto-mapping-panel";
import { generateXmlTemplate } from "@/lib/xml-template-generator";
import { generateCsvColumnsFromMappings } from "@/lib/generate-template-from-mappings";

interface ErpConfigEditorProps {
  detail: ErpConfigDetail;
  onSave: (payload: ErpConfigSavePayload) => Promise<boolean>;
  onRollback: (versionId: string) => Promise<boolean>;
  onTest: (
    mode: "json" | "order",
    config: Omit<ErpConfigSavePayload, "comment" | "name" | "description">,
    jsonInput?: string,
    orderId?: string
  ) => Promise<ErpConfigTestResult | null>;
  onFetchOrders: () => Promise<{ id: string; order_number: string | null; created_at: string }[]>;
  isMutating: boolean;
  mutationError?: string | null;
}

/** Default config values when no config exists yet. */
function getDefaults(): Omit<ErpConfigAdmin, "id" | "name" | "description" | "created_at" | "updated_at"> {
  return {
    format: "csv",
    column_mappings: [],
    separator: ";",
    quote_char: '"',
    encoding: "utf-8",
    line_ending: "LF",
    decimal_separator: ".",
    fallback_mode: "block",
    xml_template: null,
    header_column_mappings: null,
    empty_value_placeholder: "",
    split_output_mode: null,
    header_filename_template: null,
    lines_filename_template: null,
    zip_filename_template: null,
  };
}

export function ErpConfigEditor({
  detail,
  onSave,
  onRollback,
  onTest,
  onFetchOrders,
  isMutating,
  mutationError,
}: ErpConfigEditorProps) {
  const config = detail.config;
  const defaults = getDefaults();

  // Editable state — name & description
  const [configName, setConfigName] = useState(config.name);
  const [configDescription, setConfigDescription] = useState(config.description ?? "");

  // Editable state — export settings
  const [format, setFormat] = useState<ExportFormat>(config?.format ?? defaults.format);
  const [columnMappings, setColumnMappings] = useState<ErpColumnMappingExtended[]>(
    config?.column_mappings ?? defaults.column_mappings
  );
  const [separator, setSeparator] = useState(config?.separator ?? defaults.separator);
  const [quoteChar, setQuoteChar] = useState(config?.quote_char ?? defaults.quote_char);
  const [encoding, setEncoding] = useState<ErpEncoding>(config?.encoding ?? defaults.encoding);
  const [lineEnding, setLineEnding] = useState<ErpLineEnding>(config?.line_ending ?? defaults.line_ending);
  const [decimalSeparator, setDecimalSeparator] = useState<ErpDecimalSeparator>(
    config?.decimal_separator ?? defaults.decimal_separator
  );
  const [fallbackMode, setFallbackMode] = useState<ErpFallbackMode>(
    config?.fallback_mode ?? defaults.fallback_mode
  );
  const [xmlTemplate, setXmlTemplate] = useState<string>(config?.xml_template ?? "");
  const [headerColumnMappings, setHeaderColumnMappings] = useState<ErpColumnMappingExtended[]>(
    config?.header_column_mappings ?? []
  );
  const [emptyValuePlaceholder, setEmptyValuePlaceholder] = useState(
    config?.empty_value_placeholder ?? ""
  );
  // OPH-61: Split CSV filename configuration
  const [splitOutputMode, setSplitOutputMode] = useState<"zip" | "separate">(
    config?.split_output_mode ?? "zip"
  );
  const [headerFilenameTemplate, setHeaderFilenameTemplate] = useState(
    config?.header_filename_template ?? ""
  );
  const [linesFilenameTemplate, setLinesFilenameTemplate] = useState(
    config?.lines_filename_template ?? ""
  );
  const [zipFilenameTemplate, setZipFilenameTemplate] = useState(
    config?.zip_filename_template ?? ""
  );
  const [comment, setComment] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // OPH-30: Output format and template suggestion state
  const [savedOutputFormat, setSavedOutputFormat] = useState<TenantOutputFormat | null>(null);
  const [showTemplateSuggestion, setShowTemplateSuggestion] = useState(false);
  const savedOutputFormatRef = useRef<TenantOutputFormat | null>(null);
  const isInitialFormatLoadRef = useRef(true);

  // OPH-59: Header output format for split_csv
  const [savedHeaderOutputFormat, setSavedHeaderOutputFormat] = useState<TenantOutputFormat | null>(null);

  // OPH-32: Field mapper saving state
  const [isFieldMapperSaving, setIsFieldMapperSaving] = useState(false);

  // OPH-45: Key to force re-mount of FieldMapperPanel after auto-mapping applies
  const [fieldMapperKey, setFieldMapperKey] = useState(0);

  // Test dialog
  const [testOpen, setTestOpen] = useState(false);

  const markDirty = useCallback(() => {
    setIsDirty(true);
    setSuccessMessage(null);
  }, []);

  // OPH-30 + OPH-33: Track format changes.
  // - XML samples: auto-fill the XML Template field directly (the uploaded XML IS the template)
  // - CSV/XLSX samples: auto-switch to CSV tab (Field Mapper handles pre-fill)
  // - JSON samples: auto-switch to JSON tab
  const handleOutputFormatChange = useCallback((fmt: TenantOutputFormat | null) => {
    const previousFormat = savedOutputFormatRef.current;
    savedOutputFormatRef.current = fmt;
    setSavedOutputFormat(fmt);

    // Skip on initial load (pre-existing format)
    if (isInitialFormatLoadRef.current) {
      isInitialFormatLoadRef.current = false;
      return;
    }

    if (
      fmt &&
      fmt.detected_schema.length > 0 &&
      (!previousFormat || previousFormat.id !== fmt.id || previousFormat.uploaded_at !== fmt.uploaded_at)
    ) {
      // OPH-59: Don't auto-switch format tabs when inside split_csv — samples are slot-specific
      if (format === "split_csv") {
        return;
      }

      // For XML samples: auto-fill the XML template field directly
      if (fmt.file_type === "xml") {
        const result = generateXmlTemplate(
          fmt.detected_schema,
          fmt.file_type,
          configName,
          fmt.xml_structure
        );
        if (result.template) {
          setXmlTemplate(result.template);
          if (format !== "xml") {
            setFormat("xml");
          }
          markDirty();
        }
        setShowTemplateSuggestion(false);
      } else if (fmt.file_type === "csv" || fmt.file_type === "xlsx") {
        // OPH-33: Auto-switch to CSV tab for CSV/XLSX samples
        if (format !== "csv") {
          setFormat("csv");
        }
        setShowTemplateSuggestion(false);
      } else if (fmt.file_type === "json") {
        // OPH-33: Auto-switch to JSON tab for JSON samples
        if (format !== "json") {
          setFormat("json");
        }
        setShowTemplateSuggestion(false);
      } else {
        // Fallback: show suggestion banner
        setShowTemplateSuggestion(true);
      }
    }
    if (!fmt) {
      setShowTemplateSuggestion(false);
    }
  }, [configName, format, markDirty]);

  // OPH-59: Handler for header slot output format changes
  const handleHeaderOutputFormatChange = useCallback((fmt: TenantOutputFormat | null) => {
    setSavedHeaderOutputFormat(fmt);
  }, []);

  const handleAcceptTemplateSuggestion = useCallback((template: string) => {
    setXmlTemplate(template);
    setShowTemplateSuggestion(false);
    markDirty();
  }, [markDirty]);

  const handleDismissTemplateSuggestion = useCallback(() => {
    setShowTemplateSuggestion(false);
  }, []);

  // OPH-32: Save field mappings via PUT endpoint
  const handleSaveFieldMappings = useCallback(
    async (mappings: FieldMapping[]): Promise<boolean> => {
      setIsFieldMapperSaving(true);
      try {
        const res = await fetch(`/api/admin/erp-configs/${config.id}/output-format`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field_mappings: mappings }),
        });
        const json = (await res.json()) as ApiResponse<TenantOutputFormat>;

        if (!res.ok || !json.success) {
          return false;
        }

        // Update the saved output format with new field_mappings
        if (json.data) {
          savedOutputFormatRef.current = json.data;
          setSavedOutputFormat(json.data);
        }
        return true;
      } catch {
        return false;
      } finally {
        setIsFieldMapperSaving(false);
      }
    },
    [config.id]
  );

  // OPH-45: Apply auto-mapping results to field mapper — also generate CSV columns for split_csv
  const handleAutoMappingApply = useCallback(
    async (mappings: FieldMapping[]): Promise<boolean> => {
      const success = await handleSaveFieldMappings(mappings);
      if (success) {
        // Increment key to force FieldMapperPanel to re-mount with new mappings
        setFieldMapperKey((k) => k + 1);

        // For split_csv: also auto-generate CSV columns from the mappings
        if (format === "split_csv" && savedOutputFormat) {
          const csvColumns = generateCsvColumnsFromMappings(
            savedOutputFormat.detected_schema,
            mappings
          );
          setColumnMappings(csvColumns);
          markDirty();
        }
      }
      return success;
    },
    [handleSaveFieldMappings, format, savedOutputFormat, markDirty]
  );

  // OPH-59: Save field mappings for header slot via PUT endpoint
  const handleSaveHeaderFieldMappings = useCallback(
    async (mappings: FieldMapping[]): Promise<boolean> => {
      setIsFieldMapperSaving(true);
      try {
        const res = await fetch(`/api/admin/erp-configs/${config.id}/output-format`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field_mappings: mappings, slot: "header" }),
        });
        const json = (await res.json()) as ApiResponse<TenantOutputFormat>;

        if (!res.ok || !json.success) {
          return false;
        }

        if (json.data) {
          setSavedHeaderOutputFormat(json.data);
        }
        return true;
      } catch {
        return false;
      } finally {
        setIsFieldMapperSaving(false);
      }
    },
    [config.id]
  );

  // OPH-59: Apply auto-mapping results for header slot — also generate CSV columns
  const handleHeaderAutoMappingApply = useCallback(
    async (mappings: FieldMapping[]): Promise<boolean> => {
      const success = await handleSaveHeaderFieldMappings(mappings);
      if (success && savedHeaderOutputFormat) {
        const csvColumns = generateCsvColumnsFromMappings(
          savedHeaderOutputFormat.detected_schema,
          mappings
        );
        setHeaderColumnMappings(csvColumns);
        markDirty();
      }
      return success;
    },
    [handleSaveHeaderFieldMappings, savedHeaderOutputFormat, markDirty]
  );

  // OPH-32: Accept generated template from field mapper
  const handleFieldMapperGenerateTemplate = useCallback(
    (template: string) => {
      setXmlTemplate(template);
      if (format !== "xml") setFormat("xml");
      markDirty();
    },
    [format, markDirty]
  );

  // OPH-33: Accept generated CSV columns from field mapper
  const handleFieldMapperGenerateCsvColumns = useCallback(
    (columns: import("@/lib/types").ErpColumnMappingExtended[]) => {
      setColumnMappings(columns);
      if (format !== "csv") setFormat("csv");
      markDirty();
    },
    [format, markDirty]
  );

  const buildPayload = useCallback((): ErpConfigSavePayload => {
    return {
      name: configName,
      description: configDescription.trim() || null,
      format,
      column_mappings: columnMappings,
      separator,
      quote_char: quoteChar,
      encoding,
      line_ending: lineEnding,
      decimal_separator: decimalSeparator,
      fallback_mode: fallbackMode,
      xml_template: format === "xml" ? xmlTemplate || null : null,
      header_column_mappings: format === "split_csv" ? headerColumnMappings : null,
      empty_value_placeholder: emptyValuePlaceholder,
      split_output_mode: format === "split_csv" ? splitOutputMode : null,
      header_filename_template: format === "split_csv" ? (headerFilenameTemplate.trim() || null) : null,
      lines_filename_template: format === "split_csv" ? (linesFilenameTemplate.trim() || null) : null,
      zip_filename_template: format === "split_csv" ? (zipFilenameTemplate.trim() || null) : null,
      comment: comment.trim() || undefined,
    };
  }, [configName, configDescription, format, columnMappings, separator, quoteChar, encoding, lineEnding, decimalSeparator, fallbackMode, xmlTemplate, headerColumnMappings, emptyValuePlaceholder, splitOutputMode, headerFilenameTemplate, linesFilenameTemplate, zipFilenameTemplate, comment]);

  const handleSave = useCallback(async () => {
    setSuccessMessage(null);
    const payload = buildPayload();
    const success = await onSave(payload);
    if (success) {
      setIsDirty(false);
      setComment("");
      setSuccessMessage("Konfiguration gespeichert (neue Version erstellt).");
    }
  }, [buildPayload, onSave]);

  const handleRollback = useCallback(
    async (versionId: string): Promise<boolean> => {
      const success = await onRollback(versionId);
      if (success) {
        setSuccessMessage("Version wiederhergestellt.");
      }
      return success;
    },
    [onRollback]
  );

  // Sync state when detail changes (e.g. after rollback/copy)
  const configId = config?.id;
  const configUpdatedAt = config?.updated_at;
  useEffect(() => {
    if (config) {
      setConfigName(config.name);
      setConfigDescription(config.description ?? "");
      setFormat(config.format);
      setColumnMappings(config.column_mappings);
      setSeparator(config.separator);
      setQuoteChar(config.quote_char);
      setEncoding(config.encoding);
      setLineEnding(config.line_ending);
      setDecimalSeparator(config.decimal_separator);
      setFallbackMode(config.fallback_mode);
      setXmlTemplate(config.xml_template ?? "");
      setHeaderColumnMappings(config.header_column_mappings ?? []);
      setEmptyValuePlaceholder(config.empty_value_placeholder ?? "");
      setSplitOutputMode(config.split_output_mode ?? "zip");
      setHeaderFilenameTemplate(config.header_filename_template ?? "");
      setLinesFilenameTemplate(config.lines_filename_template ?? "");
      setZipFilenameTemplate(config.zip_filename_template ?? "");
      setIsDirty(false);
    }
    // We intentionally depend on configId + configUpdatedAt to re-sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configId, configUpdatedAt]);

  const handleFormatChange = useCallback(
    (newFormat: string) => {
      setFormat(newFormat as ExportFormat);
      markDirty();
    },
    [markDirty]
  );

  return (
    <div className="space-y-6">
      {/* Success message */}
      {successMessage && (
        <Alert>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* Name & Description */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="config-name">Name *</Label>
          <Input
            id="config-name"
            value={configName}
            onChange={(e) => { setConfigName(e.target.value); markDirty(); }}
            placeholder="z.B. SAP Import CSV"
            maxLength={200}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="config-desc">Beschreibung</Label>
          <Textarea
            id="config-desc"
            value={configDescription}
            onChange={(e) => { setConfigDescription(e.target.value); markDirty(); }}
            placeholder="Optionale Beschreibung..."
            rows={1}
            className="min-h-[36px] resize-none"
            maxLength={1000}
          />
        </div>
      </div>

      {/* Format tabs */}
      <Tabs value={format} onValueChange={handleFormatChange}>
        <TabsList>
          <TabsTrigger value="csv">CSV</TabsTrigger>
          <TabsTrigger value="xml">XML</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
          <TabsTrigger value="split_csv">Split CSV</TabsTrigger>
        </TabsList>

        {/* Technical Settings - shown for all formats */}
        <div className="mt-6">
          <TechnicalSettingsPanel
            encoding={encoding}
            onEncodingChange={(v) => { setEncoding(v); markDirty(); }}
            decimalSeparator={decimalSeparator}
            onDecimalSeparatorChange={(v) => { setDecimalSeparator(v); markDirty(); }}
            lineEnding={lineEnding}
            onLineEndingChange={(v) => { setLineEnding(v); markDirty(); }}
            fallbackMode={fallbackMode}
            onFallbackModeChange={(v) => { setFallbackMode(v); markDirty(); }}
            separator={separator}
            onSeparatorChange={(v) => { setSeparator(v); markDirty(); }}
            quoteChar={quoteChar}
            onQuoteCharChange={(v) => { setQuoteChar(v); markDirty(); }}
            format={format}
          />
        </div>

        {/* CSV Column Builder */}
        <TabsContent value="csv" className="mt-6">
          <CsvColumnBuilder
            columns={columnMappings}
            onChange={(cols) => { setColumnMappings(cols); markDirty(); }}
          />
        </TabsContent>

        {/* XML Template Editor */}
        <TabsContent value="xml" className="mt-6">
          <XmlTemplateEditor
            template={xmlTemplate}
            onChange={(t) => { setXmlTemplate(t); markDirty(); }}
          />
        </TabsContent>

        {/* JSON - minimal config, just the technical settings above */}
        <TabsContent value="json" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">JSON-Export</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Der JSON-Export verwendet das Canonical-JSON-Format direkt. Die technischen
                Einstellungen oben (Zeichensatz, Dezimaltrennzeichen) werden auf die
                Ausgabedatei angewendet. Spalten-Mappings sind für JSON nicht erforderlich.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* OPH-58: Split CSV — Auftragskopf + Positionen */}
        <TabsContent value="split_csv" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Split CSV Export</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm text-muted-foreground">
                Erzeugt zwei CSV-Dateien: <strong>Auftragskopf</strong> (eine
                Zeile mit Bestelldaten) und <strong>Positionen</strong> (eine Zeile pro Artikel).
                Nicht zugeordnete Spalten erhalten den konfigurierten Platzhalter-Wert.
              </p>
              <div className="space-y-1.5">
                <Label className="text-sm">Platzhalter für leere Spalten</Label>
                <Input
                  value={emptyValuePlaceholder}
                  onChange={(e) => { setEmptyValuePlaceholder(e.target.value); markDirty(); }}
                  placeholder='z.B. "@" oder leer lassen'
                  className="w-40"
                  maxLength={10}
                />
                <p className="text-xs text-muted-foreground">
                  Wird für alle nicht zugeordneten Spalten eingesetzt (z.B. &quot;@&quot; für mesonic/WinLine).
                </p>
              </div>

              {/* OPH-61: Output mode and filename configuration */}
              <Separator />
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Ausgabemodus</Label>
                  <Select
                    value={splitOutputMode}
                    onValueChange={(v) => { setSplitOutputMode(v as "zip" | "separate"); markDirty(); }}
                  >
                    <SelectTrigger className="w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zip">ZIP-Archiv (eine Datei)</SelectItem>
                      <SelectItem value="separate">Zwei CSV-Dateien (separate Downloads)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Dateiname Auftragskopf</Label>
                    <div className="flex gap-1">
                      <Input
                        value={headerFilenameTemplate}
                        onChange={(e) => { setHeaderFilenameTemplate(e.target.value); markDirty(); }}
                        placeholder="Auftragskopf_{timestamp}"
                        maxLength={200}
                      />
                      <span className="text-sm text-muted-foreground self-center">.csv</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {["{order_number}", "{timestamp}", "{customer_number}", "{order_date}"].map((v) => (
                        <button
                          key={v}
                          type="button"
                          className="text-xs px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground font-mono"
                          onClick={() => { setHeaderFilenameTemplate((prev) => prev + v); markDirty(); }}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Vorschau: {(headerFilenameTemplate || "Auftragskopf_{timestamp}")
                        .replace(/\{order_number\}/g, "56878")
                        .replace(/\{timestamp\}/g, "202603300815")
                        .replace(/\{customer_number\}/g, "202124")
                        .replace(/\{order_date\}/g, "20260330")}.csv
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm">Dateiname Positionen</Label>
                    <div className="flex gap-1">
                      <Input
                        value={linesFilenameTemplate}
                        onChange={(e) => { setLinesFilenameTemplate(e.target.value); markDirty(); }}
                        placeholder="Positionen_{timestamp}"
                        maxLength={200}
                      />
                      <span className="text-sm text-muted-foreground self-center">.csv</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {["{order_number}", "{timestamp}", "{customer_number}", "{order_date}"].map((v) => (
                        <button
                          key={v}
                          type="button"
                          className="text-xs px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground font-mono"
                          onClick={() => { setLinesFilenameTemplate((prev) => prev + v); markDirty(); }}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Vorschau: {(linesFilenameTemplate || "Positionen_{timestamp}")
                        .replace(/\{order_number\}/g, "56878")
                        .replace(/\{timestamp\}/g, "202603300815")
                        .replace(/\{customer_number\}/g, "202124")
                        .replace(/\{order_date\}/g, "20260330")}.csv
                    </p>
                  </div>
                </div>

                {splitOutputMode === "zip" && (
                  <div className="space-y-1.5">
                    <Label className="text-sm">Dateiname ZIP-Archiv</Label>
                    <div className="flex gap-1">
                      <Input
                        value={zipFilenameTemplate}
                        onChange={(e) => { setZipFilenameTemplate(e.target.value); markDirty(); }}
                        placeholder="Export_{order_number}_{timestamp}"
                        className="max-w-md"
                        maxLength={200}
                      />
                      <span className="text-sm text-muted-foreground self-center">.zip</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {["{order_number}", "{timestamp}", "{customer_number}", "{order_date}"].map((v) => (
                        <button
                          key={v}
                          type="button"
                          className="text-xs px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground font-mono"
                          onClick={() => { setZipFilenameTemplate((prev) => prev + v); markDirty(); }}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Vorschau: {(zipFilenameTemplate || "Export_{order_number}_{timestamp}")
                        .replace(/\{order_number\}/g, "56878")
                        .replace(/\{timestamp\}/g, "202603300815")
                        .replace(/\{customer_number\}/g, "202124")
                        .replace(/\{order_date\}/g, "20260330")}.zip
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Sub-tabs for header vs. lines */}
          <Tabs defaultValue="header">
            <TabsList>
              <TabsTrigger value="header">Auftragskopf</TabsTrigger>
              <TabsTrigger value="lines">Positionen</TabsTrigger>
            </TabsList>

            <TabsContent value="header" className="mt-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Spalten für die Auftragskopf-Datei (eine Zeile pro Bestellung). Verwenden Sie
                  Felder mit <code>order.</code>-Präfix für Bestelldaten (z.B. <code>order.order_number</code>,{" "}
                  <code>order.sender.customer_number</code>).
                </p>

                {/* OPH-59: Output format sample upload for Auftragskopf */}
                <Collapsible defaultOpen={!savedHeaderOutputFormat}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:underline">
                    <ChevronRight className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-90" />
                    Beispieldatei hochladen (Auftragskopf)
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <OutputFormatTab configId={config.id} slot="header" onFormatChange={handleHeaderOutputFormatChange} />
                  </CollapsibleContent>
                </Collapsible>

                {/* OPH-59: Auto-mapping for Auftragskopf */}
                {savedHeaderOutputFormat &&
                  savedHeaderOutputFormat.detected_schema.length > 0 && (
                    <AutoMappingPanel
                      configId={config.id}
                      outputFormat={savedHeaderOutputFormat}
                      slot="header"
                      hasExistingMappings={
                        (savedHeaderOutputFormat.field_mappings ?? []).length > 0
                      }
                      onApplyMappings={handleHeaderAutoMappingApply}
                      isSaving={isFieldMapperSaving}
                    />
                  )}

                <CsvColumnBuilder
                  columns={headerColumnMappings}
                  onChange={(cols) => { setHeaderColumnMappings(cols); markDirty(); }}
                />
              </div>
            </TabsContent>

            <TabsContent value="lines" className="mt-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Spalten für die Positionen-Datei (eine Zeile pro Artikel). Verwenden Sie Felder
                  wie <code>article_number</code>, <code>quantity</code>, <code>position</code> etc.
                </p>

                {/* OPH-59: Output format sample upload for Positionen */}
                <Collapsible defaultOpen={!savedOutputFormat}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:underline">
                    <ChevronRight className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-90" />
                    Beispieldatei hochladen (Positionen)
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <OutputFormatTab configId={config.id} slot="lines" onFormatChange={handleOutputFormatChange} />
                  </CollapsibleContent>
                </Collapsible>

                {/* OPH-59: Auto-mapping for Positionen */}
                {savedOutputFormat &&
                  savedOutputFormat.detected_schema.length > 0 && (
                    <AutoMappingPanel
                      configId={config.id}
                      outputFormat={savedOutputFormat}
                      slot="lines"
                      hasExistingMappings={
                        (savedOutputFormat.field_mappings ?? []).length > 0
                      }
                      onApplyMappings={handleAutoMappingApply}
                      isSaving={isFieldMapperSaving}
                    />
                  )}

                <CsvColumnBuilder
                  columns={columnMappings}
                  onChange={(cols) => { setColumnMappings(cols); markDirty(); }}
                />
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* OPH-30: Template suggestion from output format sample */}
      {showTemplateSuggestion && savedOutputFormat && (
        <XmlTemplateSuggestion
          outputFormat={savedOutputFormat}
          configName={configName}
          currentTemplate={xmlTemplate}
          onAccept={handleAcceptTemplateSuggestion}
          onDismiss={handleDismissTemplateSuggestion}
        />
      )}

      <Separator />

      {/* Action bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTestOpen(true)}
            disabled={isMutating}
          >
            <FlaskConical className="mr-1.5 h-4 w-4" />
            Testen
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoryOpen(!historyOpen)}
          >
            <History className="mr-1.5 h-4 w-4" />
            Versionshistorie
            {detail.versions.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                {detail.versions.length}
              </Badge>
            )}
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Änderungskommentar (optional)"
            className="w-64"
          />
          <Button
            onClick={handleSave}
            disabled={isMutating || (!isDirty && !!config)}
            size="sm"
          >
            {isMutating ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Speichern
          </Button>
        </div>
      </div>

      {/* Version history (collapsible) */}
      {historyOpen && (
        <ErpConfigVersionHistory
          versions={detail.versions}
          onRollback={handleRollback}
          isMutating={isMutating}
        />
      )}

      <Separator />

      {/* OPH-28: Output Format Sample Upload & Management */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold tracking-tight">
          Output-Format (Beispieldatei)
        </h3>
        <p className="text-sm text-muted-foreground">
          Laden Sie eine Beispieldatei im gewünschten ERP-Ausgabeformat hoch. Das System
          erkennt die Spaltenstruktur und berechnet einen Confidence Score beim Export.
        </p>
        <OutputFormatTab configId={config.id} onFormatChange={handleOutputFormatChange} />
      </div>

      {/* OPH-45: AI Auto-Mapping Panel — shown when an output format with schema is saved */}
      {savedOutputFormat &&
        savedOutputFormat.detected_schema.length > 0 && (
          <>
            <Separator />
            <AutoMappingPanel
              configId={config.id}
              outputFormat={savedOutputFormat}
              hasExistingMappings={
                (savedOutputFormat.field_mappings ?? []).length > 0
              }
              onApplyMappings={handleAutoMappingApply}
              isSaving={isFieldMapperSaving}
            />
          </>
        )}

      {/* OPH-32: Field Mapper Panel — shown when an output format with schema is saved */}
      {savedOutputFormat &&
        savedOutputFormat.detected_schema.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="text-lg font-semibold tracking-tight">
                Feld-Zuordnung (Visual Field Mapper)
              </h3>
              <p className="text-sm text-muted-foreground">
                Ordnen Sie die erkannten Felder aus der Beispieldatei den verfügbaren Variablen
                zu. Klicken Sie danach auf &quot;Generieren&quot;, um die Konfiguration automatisch zu befüllen.
              </p>
              <FieldMapperPanel
                key={fieldMapperKey}
                outputFormat={savedOutputFormat}
                configName={configName}
                currentTemplate={xmlTemplate}
                currentColumnMappings={columnMappings}
                onGenerateTemplate={handleFieldMapperGenerateTemplate}
                onGenerateCsvColumns={handleFieldMapperGenerateCsvColumns}
                onSaveMappings={handleSaveFieldMappings}
                isSaving={isFieldMapperSaving}
              />
            </div>
          </>
        )}

      {/* Test dialog */}
      <ErpConfigTestDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        config={buildPayload()}
        onTest={onTest}
        onFetchOrders={onFetchOrders}
        isMutating={isMutating}
        mutationError={mutationError}
      />

    </div>
  );
}

/** Panel for technical export settings. */
function TechnicalSettingsPanel({
  encoding,
  onEncodingChange,
  decimalSeparator,
  onDecimalSeparatorChange,
  lineEnding,
  onLineEndingChange,
  fallbackMode,
  onFallbackModeChange,
  separator,
  onSeparatorChange,
  quoteChar,
  onQuoteCharChange,
  format,
}: {
  encoding: ErpEncoding;
  onEncodingChange: (v: ErpEncoding) => void;
  decimalSeparator: ErpDecimalSeparator;
  onDecimalSeparatorChange: (v: ErpDecimalSeparator) => void;
  lineEnding: ErpLineEnding;
  onLineEndingChange: (v: ErpLineEnding) => void;
  fallbackMode: ErpFallbackMode;
  onFallbackModeChange: (v: ErpFallbackMode) => void;
  separator: string;
  onSeparatorChange: (v: string) => void;
  quoteChar: string;
  onQuoteCharChange: (v: string) => void;
  format: ExportFormat;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="flex items-center gap-2 text-base">
              {open ? (
                <ChevronDownIcon className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              Technische Einstellungen
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Encoding */}
              <div className="space-y-1.5">
                <Label className="text-sm">Zeichensatz</Label>
                <Select value={encoding} onValueChange={(v) => onEncodingChange(v as ErpEncoding)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utf-8">UTF-8</SelectItem>
                    <SelectItem value="latin-1">Latin-1 (ISO 8859-1)</SelectItem>
                    <SelectItem value="windows-1252">Windows-1252</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Decimal separator */}
              <div className="space-y-1.5">
                <Label className="text-sm">Dezimaltrennzeichen</Label>
                <Select
                  value={decimalSeparator}
                  onValueChange={(v) => onDecimalSeparatorChange(v as ErpDecimalSeparator)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=".">Punkt (.)</SelectItem>
                    <SelectItem value=",">Komma (,)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Line ending */}
              <div className="space-y-1.5">
                <Label className="text-sm">Zeilenende</Label>
                <Select
                  value={lineEnding}
                  onValueChange={(v) => onLineEndingChange(v as ErpLineEnding)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LF">LF (Unix/macOS)</SelectItem>
                    <SelectItem value="CRLF">CRLF (Windows)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Fallback mode */}
              <div className="space-y-1.5">
                <Label className="text-sm">Fallback-Modus</Label>
                <Select
                  value={fallbackMode}
                  onValueChange={(v) => onFallbackModeChange(v as ErpFallbackMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="block">Block (Export verweigern)</SelectItem>
                    <SelectItem value="fallback_csv">Fallback CSV (generisch)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {fallbackMode === "block"
                    ? "Export wird verweigert wenn kein Mapping konfiguriert ist."
                    : "Generischer CSV mit allen Feldern wird verwendet."}
                </p>
              </div>

              {/* CSV-specific: separator */}
              {(format === "csv" || format === "split_csv") && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-sm">CSV-Trennzeichen</Label>
                    <Select value={separator} onValueChange={onSeparatorChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value=";">Semikolon (;)</SelectItem>
                        <SelectItem value=",">Komma (,)</SelectItem>
                        <SelectItem value="\t">Tabulator</SelectItem>
                        <SelectItem value="|">Pipe (|)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm">Anführungszeichen</Label>
                    <Select value={quoteChar || "none"} onValueChange={(v) => onQuoteCharChange(v === "none" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={'"'}>Doppeltes Anführungszeichen (&quot;)</SelectItem>
                        <SelectItem value="'">Einfaches Anführungszeichen (&apos;)</SelectItem>
                        <SelectItem value="none">Keins</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>

            {fallbackMode === "fallback_csv" && (
              <Alert className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Im Fallback-Modus wird bei fehlendem Mapping ein generischer CSV mit allen
                  Canonical-JSON-Feldern erzeugt. Transformationen werden nicht angewendet.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
