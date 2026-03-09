"use client";

import { useState, useMemo } from "react";
import { Check, X, Wand2, AlertTriangle, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { generateXmlTemplate } from "@/lib/xml-template-generator";
import type { TenantOutputFormat } from "@/lib/types";

interface XmlTemplateSuggestionProps {
  /** The saved output format with detected schema. */
  outputFormat: TenantOutputFormat;
  /** The ERP config name (used as root element for flat formats). */
  configName: string;
  /** Current content of the XML template editor field. */
  currentTemplate: string;
  /** Callback to set the XML template in the editor. */
  onAccept: (template: string) => void;
  /** Callback to dismiss the suggestion. */
  onDismiss: () => void;
}

/**
 * OPH-30: Suggestion panel for auto-generated XML templates.
 *
 * Shows a generated Handlebars XML template based on the output format
 * schema. The admin can accept (copy to editor) or dismiss.
 * If the XML template editor already has content, a confirmation dialog
 * is shown before overwriting.
 */
export function XmlTemplateSuggestion({
  outputFormat,
  configName,
  currentTemplate,
  onAccept,
  onDismiss,
}: XmlTemplateSuggestionProps) {
  const [overwriteConfirmOpen, setOverwriteConfirmOpen] = useState(false);

  const result = useMemo(
    () =>
      generateXmlTemplate(
        outputFormat.detected_schema,
        outputFormat.file_type,
        configName,
        outputFormat.xml_structure
      ),
    [outputFormat.detected_schema, outputFormat.file_type, configName, outputFormat.xml_structure]
  );

  // If generation failed (no columns), show the warning inline and nothing else
  if (!result.template) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {result.warnings[0] ?? "Template-Generierung nicht möglich."}
        </AlertDescription>
      </Alert>
    );
  }

  const handleAcceptClick = () => {
    if (currentTemplate.trim()) {
      // Existing template -- ask for confirmation
      setOverwriteConfirmOpen(true);
    } else {
      onAccept(result.template);
    }
  };

  const handleConfirmOverwrite = () => {
    setOverwriteConfirmOpen(false);
    onAccept(result.template);
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(result.template);
    } catch {
      // Silently fail -- the template is visible in the preview
    }
  };

  return (
    <>
      <Card className="border-dashed border-primary/40 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            Template-Vorschlag
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Basierend auf der Beispieldatei{" "}
            <span className="font-medium">{outputFormat.file_name}</span> wurde
            ein XML-Template generiert. Prüfen Sie die Struktur und übernehmen
            Sie das Template in den Editor.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Warnings */}
          {result.warnings.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc pl-4 text-sm space-y-1">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Template preview */}
          <ScrollArea className="max-h-[400px]">
            <pre className="rounded-md border bg-muted/30 p-4 text-xs font-mono leading-relaxed whitespace-pre overflow-x-auto">
              {result.template}
            </pre>
          </ScrollArea>

          {/* Hint */}
          <p className="text-xs text-muted-foreground">
            Die Platzhalter (z.B. <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">ArticleNumber</code>)
            müssen noch durch Handlebars-Variablen ersetzt werden (z.B.{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{"{{this.article_number}}"}</code>).
            Verwenden Sie die Variablen-Referenz im XML-Template-Editor.
          </p>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" onClick={handleAcceptClick}>
              <Check className="mr-1.5 h-4 w-4" />
              Übernehmen
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyToClipboard}
            >
              <Copy className="mr-1.5 h-4 w-4" />
              Kopieren
            </Button>
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              <X className="mr-1.5 h-4 w-4" />
              Verwerfen
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Overwrite confirmation dialog */}
      <Dialog open={overwriteConfirmOpen} onOpenChange={setOverwriteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bestehendes Template überschreiben?</DialogTitle>
            <DialogDescription>
              Das XML-Template-Feld enthält bereits Inhalt. Möchten Sie diesen
              durch den generierten Vorschlag ersetzen?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setOverwriteConfirmOpen(false)}
            >
              Abbrechen
            </Button>
            <Button onClick={handleConfirmOverwrite}>
              Überschreiben
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
