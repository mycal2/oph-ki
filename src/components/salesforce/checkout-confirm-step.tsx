"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Loader2,
  AlertCircle,
  MapPin,
  MessageSquare,
  ShoppingCart,
  Building2,
  PartyPopper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCheckout } from "@/hooks/use-checkout";
import { useBasket } from "@/hooks/use-basket";
import type { ApiResponse, SalesforceOrderResponse } from "@/lib/types";

interface CheckoutConfirmStepProps {
  slug: string;
}

/**
 * OPH-80: Checkout step 3 — Order Review & Submission.
 *
 * Shows full order summary, submits to POST /api/sf/orders,
 * then shows a confirmation screen with order ID.
 */
export function CheckoutConfirmStep({ slug }: CheckoutConfirmStepProps) {
  const router = useRouter();
  const {
    isDealerIdentified,
    identificationMethod,
    selectedCustomer,
    manualDealer,
    deliveryAddress,
    notes,
    resetCheckout,
  } = useCheckout();
  const { items, itemCount, clearBasket } = useBasket();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedOrder, setSubmittedOrder] = useState<{
    orderId: string;
    confidenceScore: number;
  } | null>(null);

  // Flow guard: redirect to step 1 if no dealer or empty basket.
  // Skip guard when submittedOrder is set — avoids race condition when
  // handleNewOrder clears checkout state before router.push takes effect.
  useEffect(() => {
    if (submittedOrder) return;
    if (!isDealerIdentified) {
      router.replace(`/sf/${slug}/checkout`);
    } else if (items.length === 0) {
      router.replace(`/sf/${slug}`);
    }
  }, [isDealerIdentified, items.length, submittedOrder, router, slug]);

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      // Build the request body matching sfOrderSubmitSchema
      const lineItems = items.map((item) => ({
        articleId: item.article.id,
        articleNumber: item.article.article_number,
        name: item.article.name,
        quantity: item.quantity,
      }));

      let dealer:
        | {
            method: "customer_number" | "dropdown";
            customerId: string;
            customerNumber: string;
            companyName: string;
          }
        | {
            method: "manual";
            companyName: string;
            contactPerson: string;
            email: string;
            phone: string;
            address: string;
          };

      if (
        (identificationMethod === "customer_number" ||
          identificationMethod === "dropdown") &&
        selectedCustomer
      ) {
        dealer = {
          method: identificationMethod,
          customerId: selectedCustomer.id,
          customerNumber: selectedCustomer.customer_number,
          companyName: selectedCustomer.company_name,
        };
      } else if (identificationMethod === "manual" && manualDealer) {
        dealer = {
          method: "manual",
          companyName: manualDealer.companyName,
          contactPerson: manualDealer.contactPerson,
          email: manualDealer.email,
          phone: manualDealer.phone,
          address: manualDealer.address,
        };
      } else {
        setError("Haendler-Informationen fehlen. Bitte gehen Sie zurueck zu Schritt 1.");
        setIsSubmitting(false);
        return;
      }

      const body = {
        lineItems,
        dealer,
        deliveryAddress: deliveryAddress ?? null,
        notes: notes || "",
      };

      const res = await fetch("/api/sf/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json: ApiResponse<SalesforceOrderResponse> = await res.json();

      if (!json.success) {
        setError(json.error ?? "Bestellung konnte nicht erstellt werden.");
        setIsSubmitting(false);
        return;
      }

      setSubmittedOrder(json.data!);
    } catch {
      setError("Netzwerkfehler. Bitte pruefen Sie Ihre Internetverbindung und versuchen Sie es erneut.");
      setIsSubmitting(false);
    }
  };

  const handleNewOrder = () => {
    clearBasket();
    resetCheckout();
    router.push(`/sf/${slug}`);
  };

  // Don't render if guard will redirect (skip when post-submission)
  if (!submittedOrder && (!isDealerIdentified || items.length === 0)) {
    return null;
  }

  // ---- SUCCESS SCREEN ----
  if (submittedOrder) {
    return (
      <div className="flex flex-col items-center text-center py-8">
        <div className="rounded-full bg-primary/10 p-4 mb-4">
          <PartyPopper className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-xl font-bold mb-2">Bestellung aufgegeben!</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Ihre Bestellung wurde erfolgreich uebermittelt und wird jetzt bearbeitet.
        </p>

        <Card className="w-full mb-6">
          <CardContent className="pt-4 pb-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Bestell-ID</span>
              <span className="font-mono text-xs">
                {submittedOrder.orderId.slice(0, 8)}...
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Artikel</span>
              <span>{itemCount} Positionen</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Konfidenz</span>
              <span>{submittedOrder.confidenceScore}%</span>
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleNewOrder} className="w-full font-semibold">
          <ShoppingCart className="h-4 w-4" />
          Neue Bestellung
        </Button>
      </div>
    );
  }

  // ---- ORDER REVIEW ----

  const methodLabels: Record<string, string> = {
    customer_number: "Kundennummer",
    dropdown: "Aus Liste",
    manual: "Manuell",
  };

  const dealerName =
    selectedCustomer?.company_name ?? manualDealer?.companyName ?? "—";

  return (
    <div className="flex flex-col pb-28">
      {/* Progress indicator */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <span className="text-muted-foreground">1. Haendler</span>
          <Separator className="flex-1" />
          <span className="text-muted-foreground">2. Lieferung</span>
          <Separator className="flex-1" />
          <span className="font-semibold text-primary">3. Bestaetigung</span>
        </div>
        <h1 className="text-lg font-semibold">Bestellung pruefen</h1>
        <p className="text-sm text-muted-foreground">
          Bitte pruefen Sie Ihre Bestellung und senden Sie sie ab.
        </p>
      </div>

      {/* Dealer summary */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Haendler
            </span>
            <Badge variant="secondary" className="text-[10px] ml-auto">
              {methodLabels[identificationMethod ?? ""] ?? "—"}
            </Badge>
          </div>
          <p className="text-sm font-semibold">{dealerName}</p>
          {selectedCustomer && (
            <p className="text-xs text-muted-foreground tabular-nums">
              Nr. {selectedCustomer.customer_number}
            </p>
          )}
          {selectedCustomer?.city && (
            <p className="text-xs text-muted-foreground">
              {[
                selectedCustomer.street,
                selectedCustomer.postal_code,
                selectedCustomer.city,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
          {manualDealer?.contactPerson && (
            <p className="text-xs text-muted-foreground">
              {manualDealer.contactPerson}
            </p>
          )}
          {manualDealer?.email && (
            <p className="text-xs text-muted-foreground">
              {manualDealer.email}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Delivery address (if set) */}
      {deliveryAddress && (
        <Card className="mb-4">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Abweichende Lieferadresse
              </span>
            </div>
            <p className="text-sm">
              {[
                deliveryAddress.companyName,
                deliveryAddress.street,
                [deliveryAddress.zipCode, deliveryAddress.city]
                  .filter(Boolean)
                  .join(" "),
                deliveryAddress.country,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Notes (if set) */}
      {notes && (
        <Card className="mb-4">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Bemerkungen
              </span>
            </div>
            <p className="text-sm whitespace-pre-line">{notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Line items */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Artikel ({items.length})
          </span>
        </div>
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.article.id}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-primary tabular-nums">
                  {item.article.article_number}
                </p>
                <p className="text-sm leading-snug truncate">
                  {item.article.name}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0 tabular-nums">
                {item.quantity}x
              </Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background p-4">
        <div className="mx-auto flex max-w-lg gap-3">
          <Button variant="outline" className="shrink-0" asChild>
            <Link href={`/sf/${slug}/checkout/delivery`}>
              <ArrowLeft className="h-4 w-4" />
              Zurueck
            </Link>
          </Button>
          <Button
            className="flex-1 font-semibold"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird gesendet...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Bestellung absenden
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
