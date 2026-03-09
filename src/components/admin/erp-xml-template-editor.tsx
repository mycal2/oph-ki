"use client";

import { useState, useRef, useCallback } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface XmlTemplateEditorProps {
  template: string;
  onChange: (template: string) => void;
}

const EXAMPLE_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<Order>
  <OrderNumber>{{order.order_number}}</OrderNumber>
  <OrderDate>{{order.order_date}}</OrderDate>
  <Customer>
    <Name>{{order.sender.company_name}}</Name>
    <CustomerNumber>{{order.sender.customer_number}}</CustomerNumber>
  </Customer>
  <Items>
    {{#each order.line_items}}
    <Item>
      <Position>{{this.position}}</Position>
      <ArticleNumber>{{this.article_number}}</ArticleNumber>
      <Description>{{this.description}}</Description>
      <Quantity>{{this.quantity}}</Quantity>
      <Unit>{{this.unit}}</Unit>
      <UnitPrice>{{this.unit_price}}</UnitPrice>
      <TotalPrice>{{this.total_price}}</TotalPrice>
    </Item>
    {{/each}}
  </Items>
  <TotalAmount>{{order.total_amount}}</TotalAmount>
  <Currency>{{order.currency}}</Currency>
</Order>`;

const AVAILABLE_VARIABLES = [
  { path: "order.order_number", description: "Bestellnummer" },
  { path: "order.order_date", description: "Bestelldatum" },
  { path: "order.currency", description: "Währung" },
  { path: "order.total_amount", description: "Gesamtbetrag" },
  { path: "order.notes", description: "Notizen" },
  { path: "order.dealer.name", description: "Händlername" },
  { path: "order.sender.company_name", description: "Absender-Firma" },
  { path: "order.sender.customer_number", description: "Kundennummer" },
  { path: "order.sender.email", description: "E-Mail" },
  { path: "order.sender.phone", description: "Telefon" },
  { path: "order.sender.street", description: "Strasse" },
  { path: "order.sender.city", description: "Stadt" },
  { path: "order.sender.postal_code", description: "PLZ" },
  { path: "order.sender.country", description: "Land" },
  { path: "order.delivery_address.company", description: "Lieferadresse Firma" },
  { path: "order.delivery_address.street", description: "Lieferadresse Strasse" },
  { path: "order.delivery_address.city", description: "Lieferadresse Stadt" },
  { path: "order.delivery_address.postal_code", description: "Lieferadresse PLZ" },
  { path: "order.delivery_address.country", description: "Lieferadresse Land" },
  { path: "order.line_items", description: "Bestellpositionen (Array, mit #each)" },
  { path: "this.position", description: "Position (in #each)" },
  { path: "this.article_number", description: "Artikelnummer (in #each)" },
  { path: "this.description", description: "Beschreibung (in #each)" },
  { path: "this.quantity", description: "Menge (in #each)" },
  { path: "this.unit", description: "Einheit (in #each)" },
  { path: "this.unit_price", description: "Stückpreis (in #each)" },
  { path: "this.total_price", description: "Gesamtpreis (in #each)" },
];

export function XmlTemplateEditor({ template, onChange }: XmlTemplateEditorProps) {
  const [refOpen, setRefOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorPosRef = useRef<number | null>(null); // null = textarea never focused

  // Track cursor position on every interaction with the textarea
  const handleCursorChange = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      cursorPosRef.current = el.selectionStart;
    }
  }, []);

  // OPH-31: Insert variable at cursor position
  const handleVariableClick = useCallback((variablePath: string) => {
    const snippet = `{{${variablePath}}}`;
    const el = textareaRef.current;
    // Use last known cursor position; fall back to end of template if never focused
    const pos = cursorPosRef.current ?? template.length;
    const selEnd = el ? el.selectionEnd : pos;

    const before = template.slice(0, pos);
    const after = template.slice(selEnd);
    const newTemplate = before + snippet + after;
    onChange(newTemplate);

    // Restore focus and set cursor after inserted snippet
    const newCursorPos = pos + snippet.length;
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        cursorPosRef.current = newCursorPos;
      }
    });
  }, [template, onChange]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">XML-Template (Handlebars-Syntax)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Verwenden Sie Handlebars-Syntax für dynamische Werte:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
            {"{{order.order_number}}"}
          </code>{" "}
          für skalare Werte,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
            {"{{#each order.line_items}}...{{/each}}"}
          </code>{" "}
          für Listen.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Template textarea */}
        <div className="space-y-1.5">
          <Label className="text-sm">Template</Label>
          <Textarea
            ref={textareaRef}
            value={template}
            onChange={(e) => { onChange(e.target.value); handleCursorChange(); }}
            onClick={handleCursorChange}
            onKeyUp={handleCursorChange}
            placeholder={EXAMPLE_TEMPLATE}
            className="min-h-[300px] font-mono text-xs leading-relaxed"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            {template.length} Zeichen
          </p>
        </div>

        {/* Available variables reference */}
        <Collapsible open={refOpen} onOpenChange={setRefOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            {refOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Verfügbare Variablen
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {AVAILABLE_VARIABLES.map((v) => (
                  <button
                    key={v.path}
                    type="button"
                    className="group flex items-baseline gap-2 text-xs text-left rounded px-1 py-0.5 -mx-1 hover:bg-primary/10 transition-colors cursor-pointer"
                    onClick={() => handleVariableClick(v.path)}
                    title="Klicken zum Einfügen an Cursorposition"
                  >
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] shrink-0 group-hover:bg-primary/20">
                      {`{{${v.path}}}`}
                    </code>
                    <span className="text-muted-foreground truncate">{v.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Example template button */}
        {!template && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(EXAMPLE_TEMPLATE)}
          >
            Beispiel-Template einfügen
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
