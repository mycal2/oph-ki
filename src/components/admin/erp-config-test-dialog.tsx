"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertTriangle, Play, FileText, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ErpConfigSavePayload, ErpConfigTestResult } from "@/lib/types";

/** Sample canonical JSON for testing. */
const SAMPLE_JSON = JSON.stringify(
  {
    order: {
      order_number: "TEST-12345",
      order_date: "2026-03-01",
      currency: "EUR",
      total_amount: 1234.56,
      notes: "Testbestellung",
      dealer: { id: null, name: "Test-Haendler" },
      sender: {
        company_name: "Musterfirma GmbH",
        customer_number: "KD-001",
        email: "test@example.com",
        phone: "+49 123 456789",
        street: "Musterstrasse 1",
        city: "Musterstadt",
        postal_code: "12345",
        country: "DE",
      },
      delivery_address: {
        company: "Musterfirma GmbH",
        street: "Lieferstrasse 2",
        city: "Lieferstadt",
        postal_code: "54321",
        country: "DE",
      },
      billing_address: null,
      line_items: [
        {
          position: 1,
          article_number: "ART-001",
          description: "Dental Composite A2",
          quantity: 10,
          unit: "Stk",
          unit_price: 49.90,
          total_price: 499.00,
          currency: "EUR",
        },
        {
          position: 2,
          article_number: "ART-002",
          description: "Bonding Agent Universal",
          quantity: 5,
          unit: "Stk",
          unit_price: 89.90,
          total_price: 449.50,
          currency: "EUR",
        },
      ],
    },
    extraction_metadata: {
      schema_version: "1.0",
      confidence_score: 0.95,
      model: "test",
      extracted_at: "2026-03-01T00:00:00Z",
      source_files: ["test.pdf"],
      dealer_hints_applied: false,
      column_mapping_applied: false,
      input_tokens: 0,
      output_tokens: 0,
    },
  },
  null,
  2
);

interface ErpConfigTestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ErpConfigSavePayload;
  onTest: (
    mode: "json" | "order",
    config: Omit<ErpConfigSavePayload, "comment">,
    jsonInput?: string,
    orderId?: string
  ) => Promise<ErpConfigTestResult | null>;
  onFetchOrders: () => Promise<{ id: string; order_number: string | null; created_at: string }[]>;
  isMutating: boolean;
}

export function ErpConfigTestDialog({
  open,
  onOpenChange,
  config,
  onTest,
  onFetchOrders,
  isMutating,
}: ErpConfigTestDialogProps) {
  const [mode, setMode] = useState<"json" | "order">("json");
  const [jsonInput, setJsonInput] = useState(SAMPLE_JSON);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [orders, setOrders] = useState<{ id: string; order_number: string | null; created_at: string }[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [result, setResult] = useState<ErpConfigTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Fetch orders when switching to order mode
  useEffect(() => {
    if (mode === "order" && orders.length === 0 && open) {
      setIsLoadingOrders(true);
      onFetchOrders()
        .then(setOrders)
        .finally(() => setIsLoadingOrders(false));
    }
  }, [mode, orders.length, open, onFetchOrders]);

  const handleTest = useCallback(async () => {
    setResult(null);
    setTestError(null);

    const { comment: _comment, ...configWithoutComment } = config;

    const testResult = await onTest(
      mode,
      configWithoutComment,
      mode === "json" ? jsonInput : undefined,
      mode === "order" ? selectedOrderId : undefined
    );

    if (testResult) {
      setResult(testResult);
    } else {
      setTestError("Test fehlgeschlagen. Bitte pruefen Sie die Konfiguration.");
    }
  }, [config, mode, jsonInput, selectedOrderId, onTest]);

  const handleClose = useCallback(() => {
    setResult(null);
    setTestError(null);
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Mapping-Konfiguration testen</DialogTitle>
          <DialogDescription>
            Testen Sie die aktuelle Konfiguration mit Beispieldaten oder einer existierenden Bestellung.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Input mode tabs */}
          <Tabs value={mode} onValueChange={(v) => setMode(v as "json" | "order")}>
            <TabsList>
              <TabsTrigger value="json" className="gap-1.5">
                <Code className="h-3.5 w-3.5" />
                JSON eingeben
              </TabsTrigger>
              <TabsTrigger value="order" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Bestellung waehlen
              </TabsTrigger>
            </TabsList>

            <TabsContent value="json" className="mt-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Canonical JSON</Label>
                <Textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder="Canonical JSON hier einfuegen..."
                  className="min-h-[200px] font-mono text-xs leading-relaxed"
                  spellCheck={false}
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setJsonInput(SAMPLE_JSON)}
                  >
                    Beispiel-JSON laden
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="order" className="mt-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Genehmigte Bestellung</Label>
                {isLoadingOrders ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Bestellungen werden geladen...
                  </div>
                ) : orders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Keine genehmigten Bestellungen fuer diesen Mandanten gefunden.
                  </p>
                ) : (
                  <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Bestellung auswaehlen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {orders.map((order) => (
                        <SelectItem key={order.id} value={order.id}>
                          {order.order_number ?? "Ohne Nummer"} --{" "}
                          {new Date(order.created_at).toLocaleDateString("de-DE")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {/* Run test button */}
          <Button
            onClick={handleTest}
            disabled={
              isMutating ||
              (mode === "json" && !jsonInput.trim()) ||
              (mode === "order" && !selectedOrderId)
            }
          >
            {isMutating ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-1.5 h-4 w-4" />
            )}
            Test ausfuehren
          </Button>

          {/* Error */}
          {testError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{testError}</AlertDescription>
            </Alert>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Ergebnis</Label>
                <Badge variant="secondary" className="text-xs">
                  {result.format.toUpperCase()}
                </Badge>
              </div>

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <ul className="list-disc pl-4 space-y-0.5 text-xs">
                      {result.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Output preview */}
              <ScrollArea className="max-h-[300px]">
                <pre className="rounded-lg border bg-muted/30 p-4 text-xs font-mono whitespace-pre-wrap break-all">
                  {result.output}
                </pre>
              </ScrollArea>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
