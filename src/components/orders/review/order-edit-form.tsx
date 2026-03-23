"use client";

import { useCallback, useState } from "react";
import { Plus, Trash2, AlertTriangle, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type {
  CanonicalOrderData,
  CanonicalOrder,
  CanonicalLineItem,
  CanonicalAddress,
  CanonicalSender,
} from "@/lib/types";

interface OrderEditFormProps {
  data: CanonicalOrderData;
  onChange: (data: CanonicalOrderData) => void;
}

/** Creates an empty address object. */
function emptyAddress(): CanonicalAddress {
  return {
    company: null,
    street: null,
    city: null,
    postal_code: null,
    country: null,
  };
}

/** Creates a new line item with the next position number. */
function newLineItem(position: number): CanonicalLineItem {
  return {
    position,
    article_number: null,
    dealer_article_number: null,
    description: "",
    quantity: 1,
    unit: null,
    unit_price: null,
    total_price: null,
    currency: null,
  };
}

/**
 * Editable form for order review data.
 * Contains header fields, line items table, address sections, totals, and notes.
 * All changes are passed to the parent via onChange for auto-save.
 */
export function OrderEditForm({ data, onChange }: OrderEditFormProps) {
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);

  const order = data.order;
  const confidence = data.extraction_metadata.confidence_score;
  const isLowConfidence = confidence < 0.8;

  // Helper to update the order part while keeping metadata intact
  const updateOrder = useCallback(
    (patch: Partial<CanonicalOrder>) => {
      onChange({
        ...data,
        order: { ...data.order, ...patch },
      });
    },
    [data, onChange]
  );

  // ---- Line Item Helpers ----

  const updateLineItem = useCallback(
    (index: number, patch: Partial<CanonicalLineItem>) => {
      const items = [...order.line_items];
      items[index] = { ...items[index], ...patch };
      updateOrder({ line_items: items });
    },
    [order.line_items, updateOrder]
  );

  const addLineItem = useCallback(() => {
    const nextPosition =
      order.line_items.length > 0
        ? Math.max(...order.line_items.map((i) => i.position)) + 1
        : 1;
    updateOrder({
      line_items: [...order.line_items, newLineItem(nextPosition)],
    });
  }, [order.line_items, updateOrder]);

  const removeLineItem = useCallback(
    (index: number) => {
      const items = order.line_items.filter((_, i) => i !== index);
      // Re-number positions
      const renumbered = items.map((item, i) => ({
        ...item,
        position: i + 1,
      }));
      updateOrder({ line_items: renumbered });
    },
    [order.line_items, updateOrder]
  );

  // ---- Sender Helpers ----

  const updateSender = useCallback(
    (patch: Partial<CanonicalSender>) => {
      const current = order.sender ?? {
        company_name: null,
        street: null,
        city: null,
        postal_code: null,
        country: null,
        email: null,
        phone: null,
        customer_number: null,
      };
      updateOrder({ sender: { ...current, ...patch } });
    },
    [order.sender, updateOrder]
  );

  // ---- Address Helpers ----

  const updateAddress = useCallback(
    (
      field: "delivery_address" | "billing_address",
      patch: Partial<CanonicalAddress>
    ) => {
      const current = order[field] ?? emptyAddress();
      updateOrder({ [field]: { ...current, ...patch } });
    },
    [order, updateOrder]
  );

  // Parse a numeric string safely
  const parseNum = (val: string): number | null => {
    if (val.trim() === "") return null;
    const n = parseFloat(val.replace(",", "."));
    return isNaN(n) ? null : n;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Bestelldaten bearbeiten</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Low confidence warning */}
        {isLowConfidence && (
          <Alert
            className="border-yellow-500/50 bg-yellow-50 text-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-200 dark:border-yellow-500/30"
          >
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <AlertTitle>Niedrige Extraktionskonfidenz ({Math.round(confidence * 100)}%)</AlertTitle>
            <AlertDescription>
              Die KI war sich bei der Extraktion unsicher. Bitte prüfen Sie alle Felder sorgfältig.
            </AlertDescription>
          </Alert>
        )}

        {/* ---- Header Section ---- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="review-order-number">Bestellnummer</Label>
            <Input
              id="review-order-number"
              value={order.order_number ?? ""}
              onChange={(e) =>
                updateOrder({
                  order_number: e.target.value || null,
                })
              }
              placeholder="z.B. PO-2024-001"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="review-order-date">Bestelldatum</Label>
            <Input
              id="review-order-date"
              type="date"
              value={order.order_date ?? ""}
              onChange={(e) =>
                updateOrder({
                  order_date: e.target.value || null,
                })
              }
            />
          </div>
        </div>

        <Separator />

        {/* ---- Sender Section ---- */}
        <div>
          <h3 className="text-sm font-medium mb-3">Absender</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="review-customer-number" className="flex items-center gap-1">
                Kundennummer{" "}
                <span className="text-muted-foreground font-normal">(Kd.-Nr.)</span>
                {order.sender?.customer_number_source?.startsWith("catalog_") && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 h-4 border-violet-300 text-violet-600 cursor-help"
                        >
                          KI-Vorschlag
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-xs">
                          {order.sender?.customer_number_match_reason ?? "Automatisch aus dem Kundenkatalog zugeordnet."}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </Label>
              <Input
                id="review-customer-number"
                value={order.sender?.customer_number ?? ""}
                onChange={(e) => {
                  const value = e.target.value || null;
                  updateSender({
                    customer_number: value,
                    customer_number_source: "extracted",
                    customer_number_match_reason: null,
                  });
                }}
                placeholder="z.B. 12345 oder KD-12345-DE"
                maxLength={100}
                aria-label="Kundennummer des Herstellers für den Händler"
              />
              <p className="text-xs text-muted-foreground">
                Vom Hersteller vergebene Kundennummer des Bestellers (optional).
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* ---- Line Items ---- */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">
              Positionen ({order.line_items.length})
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={addLineItem}
              className="gap-1 text-xs"
            >
              <Plus className="h-3 w-3" />
              Position hinzufügen
            </Button>
          </div>

          {order.line_items.length === 0 ? (
            <div className="text-center py-8 border rounded-md bg-muted/30">
              <p className="text-sm text-muted-foreground mb-3">
                Keine Bestellpositionen vorhanden.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={addLineItem}
                className="gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Erste Position hinzufügen
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {order.line_items.map((item, index) => (
                <LineItemRow
                  key={`line-${index}-${item.position}`}
                  item={item}
                  index={index}
                  onChange={(patch) => updateLineItem(index, patch)}
                  onRemove={() => removeLineItem(index)}
                  parseNum={parseNum}
                />
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* ---- Addresses (collapsible) ---- */}
        <AddressCollapsible
          title="Lieferadresse"
          isOpen={deliveryOpen}
          onToggle={setDeliveryOpen}
          address={order.delivery_address}
          onChange={(patch) => updateAddress("delivery_address", patch)}
          idPrefix="delivery"
        />

        <AddressCollapsible
          title="Rechnungsadresse"
          isOpen={billingOpen}
          onToggle={setBillingOpen}
          address={order.billing_address}
          onChange={(patch) => updateAddress("billing_address", patch)}
          idPrefix="billing"
        />

        <Separator />

        {/* ---- Totals ---- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="review-total-amount">Gesamtbetrag</Label>
            <Input
              id="review-total-amount"
              type="text"
              inputMode="decimal"
              value={order.total_amount !== null ? String(order.total_amount) : ""}
              onChange={(e) =>
                updateOrder({ total_amount: parseNum(e.target.value) })
              }
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="review-currency">Währung</Label>
            <Input
              id="review-currency"
              value={order.currency ?? ""}
              onChange={(e) =>
                updateOrder({ currency: e.target.value || null })
              }
              placeholder="EUR"
            />
          </div>
        </div>

        <Separator />

        {/* ---- Notes ---- */}
        <div className="space-y-2">
          <Label htmlFor="review-notes">Anmerkungen</Label>
          <Textarea
            id="review-notes"
            value={order.notes ?? ""}
            onChange={(e) =>
              updateOrder({ notes: e.target.value || null })
            }
            placeholder="Zusätzliche Anmerkungen zur Bestellung..."
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Sub-components ----

interface LineItemRowProps {
  item: CanonicalLineItem;
  index: number;
  onChange: (patch: Partial<CanonicalLineItem>) => void;
  onRemove: () => void;
  parseNum: (val: string) => number | null;
}

function LineItemRow({ item, index, onChange, onRemove, parseNum }: LineItemRowProps) {
  return (
    <div className="border rounded-md p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Position {item.position}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          aria-label={`Position ${item.position} entfernen`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`line-${index}-article`} className="text-xs flex items-center gap-1">
            Herst.-Art.-Nr.
            {item.article_number_source === "catalog_match" && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1 py-0 gap-0.5 font-normal text-violet-700 border-violet-300 dark:text-violet-400 dark:border-violet-600 cursor-help"
                    >
                      <Sparkles className="h-2.5 w-2.5" />
                      KI-Vorschlag
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">
                      {item.article_number_match_reason ?? "Automatisch aus dem Artikelkatalog zugeordnet."}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </Label>
          <Input
            id={`line-${index}-article`}
            value={item.article_number ?? ""}
            onChange={(e) =>
              onChange({
                article_number: e.target.value || null,
                article_number_source: "manual",
                article_number_match_reason: null,
              })
            }
            placeholder="-"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`line-${index}-dealer-article`} className="text-xs">
            Händler-Art.-Nr.
          </Label>
          <Input
            id={`line-${index}-dealer-article`}
            value={item.dealer_article_number ?? ""}
            onChange={(e) =>
              onChange({ dealer_article_number: e.target.value || null })
            }
            placeholder="-"
            className="h-8 text-sm"
            aria-label={`Lieferantenartikelnummer Position ${item.position}`}
          />
        </div>
        <div className="space-y-1 col-span-2">
          <Label htmlFor={`line-${index}-desc`} className="text-xs">
            Beschreibung *
          </Label>
          <Input
            id={`line-${index}-desc`}
            value={item.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Produktbeschreibung"
            className={cn(
              "h-8 text-sm",
              !item.description && "border-yellow-500/50"
            )}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`line-${index}-qty`} className="text-xs">
            Menge *
          </Label>
          <Input
            id={`line-${index}-qty`}
            type="text"
            inputMode="decimal"
            value={String(item.quantity)}
            onChange={(e) =>
              onChange({ quantity: parseNum(e.target.value) ?? 0 })
            }
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`line-${index}-unit`} className="text-xs">
            Einheit
          </Label>
          <Input
            id={`line-${index}-unit`}
            value={item.unit ?? ""}
            onChange={(e) => onChange({ unit: e.target.value || null })}
            placeholder="Stk."
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`line-${index}-price`} className="text-xs">
            Einzelpreis
          </Label>
          <Input
            id={`line-${index}-price`}
            type="text"
            inputMode="decimal"
            value={item.unit_price !== null ? String(item.unit_price) : ""}
            onChange={(e) =>
              onChange({ unit_price: parseNum(e.target.value) })
            }
            placeholder="0.00"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`line-${index}-total`} className="text-xs">
            Gesamt
          </Label>
          <Input
            id={`line-${index}-total`}
            type="text"
            inputMode="decimal"
            value={item.total_price !== null ? String(item.total_price) : ""}
            onChange={(e) =>
              onChange({ total_price: parseNum(e.target.value) })
            }
            placeholder="0.00"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`line-${index}-curr`} className="text-xs">
            Währung
          </Label>
          <Input
            id={`line-${index}-curr`}
            value={item.currency ?? ""}
            onChange={(e) =>
              onChange({ currency: e.target.value || null })
            }
            placeholder="EUR"
            className="h-8 text-sm"
          />
        </div>
      </div>
    </div>
  );
}

interface AddressCollapsibleProps {
  title: string;
  isOpen: boolean;
  onToggle: (open: boolean) => void;
  address: CanonicalAddress | null;
  onChange: (patch: Partial<CanonicalAddress>) => void;
  idPrefix: string;
}

function AddressCollapsible({
  title,
  isOpen,
  onToggle,
  address,
  onChange,
  idPrefix,
}: AddressCollapsibleProps) {
  const addr = address ?? emptyAddress();
  const hasData = Object.values(addr).some((v) => v !== null && v !== "");

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between gap-2 text-sm font-medium h-9"
        >
          <span>
            {title}
            {hasData && (
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                (ausgefüllt)
              </span>
            )}
          </span>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={`${idPrefix}-company`} className="text-xs">
              Firma
            </Label>
            <Input
              id={`${idPrefix}-company`}
              value={addr.company ?? ""}
              onChange={(e) =>
                onChange({ company: e.target.value || null })
              }
              placeholder="Firmenname"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={`${idPrefix}-street`} className="text-xs">
              Straße
            </Label>
            <Input
              id={`${idPrefix}-street`}
              value={addr.street ?? ""}
              onChange={(e) =>
                onChange({ street: e.target.value || null })
              }
              placeholder="Straße und Hausnummer"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-postal`} className="text-xs">
              PLZ
            </Label>
            <Input
              id={`${idPrefix}-postal`}
              value={addr.postal_code ?? ""}
              onChange={(e) =>
                onChange({ postal_code: e.target.value || null })
              }
              placeholder="PLZ"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-city`} className="text-xs">
              Stadt
            </Label>
            <Input
              id={`${idPrefix}-city`}
              value={addr.city ?? ""}
              onChange={(e) =>
                onChange({ city: e.target.value || null })
              }
              placeholder="Stadt"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={`${idPrefix}-country`} className="text-xs">
              Land
            </Label>
            <Input
              id={`${idPrefix}-country`}
              value={addr.country ?? ""}
              onChange={(e) =>
                onChange({ country: e.target.value || null })
              }
              placeholder="z.B. Deutschland"
              className="h-8 text-sm"
            />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
