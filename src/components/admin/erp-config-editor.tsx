"use client";

import { useState, useCallback, useEffect } from "react";
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
} from "@/lib/types";
import { CsvColumnBuilder } from "@/components/admin/erp-csv-column-builder";
import { XmlTemplateEditor } from "@/components/admin/erp-xml-template-editor";
import { ErpConfigVersionHistory } from "@/components/admin/erp-config-version-history";
import { ErpConfigTestDialog } from "@/components/admin/erp-config-test-dialog";
import { OutputFormatTab } from "@/components/admin/output-format-tab";

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
  };
}

export function ErpConfigEditor({
  detail,
  onSave,
  onRollback,
  onTest,
  onFetchOrders,
  isMutating,
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
  const [comment, setComment] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Test dialog
  const [testOpen, setTestOpen] = useState(false);

  const markDirty = useCallback(() => {
    setIsDirty(true);
    setSuccessMessage(null);
  }, []);

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
      comment: comment.trim() || undefined,
    };
  }, [configName, configDescription, format, columnMappings, separator, quoteChar, encoding, lineEnding, decimalSeparator, fallbackMode, xmlTemplate, comment]);

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
                Ausgabedatei angewendet. Spalten-Mappings sind fuer JSON nicht erforderlich.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
            placeholder="Aenderungskommentar (optional)"
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
          Laden Sie eine Beispieldatei im gewuenschten ERP-Ausgabeformat hoch. Das System
          erkennt die Spaltenstruktur und berechnet einen Confidence Score beim Export.
        </p>
        <OutputFormatTab configId={config.id} />
      </div>

      {/* Test dialog */}
      <ErpConfigTestDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        config={buildPayload()}
        onTest={onTest}
        onFetchOrders={onFetchOrders}
        isMutating={isMutating}
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
              {format === "csv" && (
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
                        <SelectItem value={'"'}>Doppeltes Anfuehrungszeichen (&quot;)</SelectItem>
                        <SelectItem value="'">Einfaches Anfuehrungszeichen (&apos;)</SelectItem>
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
