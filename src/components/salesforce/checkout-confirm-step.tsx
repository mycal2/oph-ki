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
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCheckout } from "@/hooks/use-checkout";
import { useBasket } from "@/hooks/use-basket";
import { useSfBasePath } from "@/hooks/use-sf-base-path";
import type { ApiResponse, SalesforceOrderResponse } from "@/lib/types";
import type { BasketItem } from "@/hooks/use-basket";

interface CheckoutConfirmStepProps {
  slug: string;
}

export function CheckoutConfirmStep({ slug }: CheckoutConfirmStepProps) {
  const t = useTranslations("salesforce.checkout.confirm");
  const tCheckout = useTranslations("salesforce.checkout");
  const tDealer = useTranslations("salesforce.checkout.dealer");
  const router = useRouter();
  const basePath = useSfBasePath(slug);
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

  useEffect(() => {
    if (submittedOrder) return;
    if (!isDealerIdentified) {
      router.replace(`${basePath}/checkout`);
    } else if (items.length === 0) {
      router.replace(`${basePath}/order`);
    }
  }, [isDealerIdentified, items.length, submittedOrder, router, basePath]);

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);

    try {
      let dealer:
        | { method: "customer_number" | "dropdown"; customerId: string; customerNumber: string; companyName: string }
        | { method: "manual"; companyName: string; contactPerson: string; email: string; phone: string; address: string };

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
        setError(t("missingCustomer"));
        setIsSubmitting(false);
        return;
      }

      const payload = {
        lineItems: items.map((item) => ({
          articleId: item.article.id,
          articleNumber: item.article.article_number,
          name: item.article.name,
          quantity: item.quantity,
        })),
        dealer,
        deliveryAddress: deliveryAddress ?? undefined,
        notes: notes || undefined,
      };

      const res = await fetch("/api/sf/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json: ApiResponse<SalesforceOrderResponse> = await res.json();

      if (!json.success) {
        setError(json.error ?? t("submitError"));
        return;
      }

      clearBasket();
      resetCheckout();
      setSubmittedOrder(json.data!);
    } catch {
      setError(t("networkError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleNewOrder() {
    setSubmittedOrder(null);
    router.push(`${basePath}/order`);
  }

  if (!submittedOrder && (!isDealerIdentified || items.length === 0)) {
    return null;
  }

  if (submittedOrder) {
    return (
      <div className="flex flex-col items-center text-center py-8">
        <div className="rounded-full bg-primary/10 p-4 mb-4">
          <PartyPopper className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-xl font-bold mb-2">{t("successTitle")}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {t("successDescription")}
        </p>

        <Card className="w-full mb-6">
          <CardContent className="pt-4 pb-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("orderIdLabel")}</span>
              <span className="font-mono text-xs">
                {submittedOrder.orderId.slice(0, 8)}...
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("itemsLabel")}</span>
              <span>{t("itemsValue", { count: itemCount })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("confidenceLabel")}</span>
              <span>{t("confidenceValue", { score: submittedOrder.confidenceScore })}</span>
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleNewOrder} className="w-full font-semibold">
          <ShoppingCart className="h-4 w-4" />
          {t("newOrder")}
        </Button>
      </div>
    );
  }

  const methodLabel =
    identificationMethod === "manual"
      ? tDealer("methodManual")
      : identificationMethod === "customer_number"
      ? tDealer("methodCustomerNumber")
      : identificationMethod === "dropdown"
      ? tDealer("methodFromList")
      : "—";

  const dealerName =
    selectedCustomer?.company_name ?? manualDealer?.companyName ?? "—";

  return (
    <div className="flex flex-col pb-28">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <span className="text-muted-foreground">{tCheckout("stepCustomer")}</span>
          <Separator className="flex-1" />
          <span className="text-muted-foreground">{tCheckout("stepDelivery")}</span>
          <Separator className="flex-1" />
          <span className="font-semibold text-primary">{tCheckout("stepConfirm")}</span>
        </div>
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t("customerSection")}
            </span>
            <Badge variant="secondary" className="text-[10px]">
              {methodLabel}
            </Badge>
            <Link
              href={`${basePath}/checkout`}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              {t("change")}
            </Link>
          </div>
          <p className="text-sm font-semibold">{dealerName}</p>
          {selectedCustomer && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {t("customerNumberPrefix", { number: selectedCustomer.customer_number })}
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

      {deliveryAddress && (
        <Card className="mb-4">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("deliverySection")}
              </span>
              <Link
                href={`${basePath}/checkout/delivery`}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              >
                {t("change")}
              </Link>
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

      {notes && (
        <Card className="mb-4">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("notesSection")}
              </span>
              <Link
                href={`${basePath}/checkout/delivery`}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              >
                {t("change")}
              </Link>
            </div>
            <p className="text-sm whitespace-pre-line">{notes}</p>
          </CardContent>
        </Card>
      )}

      <div className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t("itemsSection", { count: items.length })}
          </span>
        </div>
        <div className="space-y-2">
          {items.map((item) => (
            <EditableLineItem key={item.article.id} item={item} />
          ))}
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background p-4">
        <div className="mx-auto flex max-w-lg gap-3">
          <Button variant="outline" className="shrink-0" asChild>
            <Link href={`${basePath}/checkout/delivery`}>
              <ArrowLeft className="h-4 w-4" />
              {tCheckout("back")}
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
                {t("submitting")}
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                {t("submit")}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditableLineItem({ item }: { item: BasketItem }) {
  const t = useTranslations("salesforce.checkout.confirm");
  const tCommon = useTranslations("common");
  const { setQuantity, removeFromBasket } = useBasket();
  const [inputValue, setInputValue] = useState(String(item.quantity));

  const handleDecrement = () => {
    const newQty = item.quantity - 1;
    if (newQty <= 0) return;
    setQuantity(item.article.id, newQty);
    setInputValue(String(newQty));
  };

  const handleIncrement = () => {
    const newQty = item.quantity + 1;
    setQuantity(item.article.id, newQty);
    setInputValue(String(newQty));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setQuantity(item.article.id, parsed);
    }
  };

  const handleInputBlur = () => {
    const parsed = parseInt(inputValue, 10);
    if (isNaN(parsed) || parsed <= 0) {
      setInputValue(String(item.quantity));
    }
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-primary tabular-nums">
          {item.article.article_number}
        </p>
        <p className="text-sm leading-snug truncate">{item.article.name}</p>

        <div className="mt-2 flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleDecrement}
            disabled={item.quantity <= 1}
            aria-label={t("decreaseQuantityAriaLabel")}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Input
            type="number"
            min={1}
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            className="h-7 w-12 text-center tabular-nums text-sm px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            aria-label={t("quantityAriaLabel", { name: item.article.name })}
          />
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleIncrement}
            aria-label={t("increaseQuantityAriaLabel")}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={t("removeAriaLabel", { name: item.article.name })}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("removeDescription", { name: item.article.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => removeFromBasket(item.article.id)}>
              {t("removeConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
