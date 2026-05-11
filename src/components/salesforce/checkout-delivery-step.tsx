"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  MapPin,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useCheckout } from "@/hooks/use-checkout";
import { useSfBasePath } from "@/hooks/use-sf-base-path";

const NOTES_MAX_LENGTH = 500;
const ADDRESS_MAX_LENGTH = 255;

interface CheckoutDeliveryStepProps {
  slug: string;
}

export function CheckoutDeliveryStep({ slug }: CheckoutDeliveryStepProps) {
  const t = useTranslations("salesforce.checkout.delivery");
  const tCheckout = useTranslations("salesforce.checkout");
  const router = useRouter();
  const basePath = useSfBasePath(slug);
  const {
    isDealerIdentified,
    deliveryAddress,
    notes,
    setDeliveryAddress,
    setNotes,
  } = useCheckout();

  useEffect(() => {
    if (!isDealerIdentified) {
      router.replace(`${basePath}/checkout`);
    }
  }, [isDealerIdentified, router, basePath]);

  const [addressOpen, setAddressOpen] = useState(deliveryAddress !== null);
  const [companyName, setCompanyName] = useState(deliveryAddress?.companyName ?? "");
  const [street, setStreet] = useState(deliveryAddress?.street ?? "");
  const [zipCode, setZipCode] = useState(deliveryAddress?.zipCode ?? "");
  const [city, setCity] = useState(deliveryAddress?.city ?? "");
  const [country, setCountry] = useState(deliveryAddress?.country ?? "Deutschland");
  const [localNotes, setLocalNotes] = useState(notes);

  const handleNotesChange = (value: string) => {
    const trimmed = value.slice(0, NOTES_MAX_LENGTH);
    setLocalNotes(trimmed);
    setNotes(trimmed);
  };

  const syncAddressToContext = useCallback(() => {
    if (!addressOpen) {
      setDeliveryAddress(null);
      return;
    }
    const hasAnyField =
      companyName.trim() ||
      street.trim() ||
      zipCode.trim() ||
      city.trim() ||
      country.trim();

    if (hasAnyField) {
      setDeliveryAddress({
        companyName: companyName.trim(),
        street: street.trim(),
        zipCode: zipCode.trim(),
        city: city.trim(),
        country: country.trim() || "Deutschland",
      });
    } else {
      setDeliveryAddress(null);
    }
  }, [addressOpen, companyName, street, zipCode, city, country, setDeliveryAddress]);

  useEffect(() => {
    syncAddressToContext();
  }, [syncAddressToContext]);

  const handleContinue = () => {
    router.push(`${basePath}/checkout/confirm`);
  };

  if (!isDealerIdentified) {
    return null;
  }

  return (
    <div className="flex flex-col pb-28">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <span className="text-muted-foreground">{tCheckout("stepCustomer")}</span>
          <Separator className="flex-1" />
          <span className="font-semibold text-primary">{tCheckout("stepDelivery")}</span>
          <Separator className="flex-1" />
          <span>{tCheckout("stepConfirm")}</span>
        </div>
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Collapsible open={addressOpen} onOpenChange={setAddressOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors hover:bg-accent"
          >
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-semibold">
                  {t("alternateAddressTitle")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("alternateAddressHint")}
                </p>
              </div>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${
                addressOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-3 space-y-4 rounded-lg border border-dashed p-4">
            <div className="space-y-1.5">
              <Label htmlFor="delivery-company" className="text-sm">
                {t("companyNameLabel")}
              </Label>
              <Input
                id="delivery-company"
                type="text"
                placeholder={t("companyNamePlaceholder")}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                maxLength={ADDRESS_MAX_LENGTH}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="delivery-street" className="text-sm">
                {t("streetLabel")}
              </Label>
              <Input
                id="delivery-street"
                type="text"
                placeholder={t("streetPlaceholder")}
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                maxLength={ADDRESS_MAX_LENGTH}
              />
            </div>

            <div className="grid grid-cols-[120px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="delivery-zip" className="text-sm">
                  {t("zipLabel")}
                </Label>
                <Input
                  id="delivery-zip"
                  type="text"
                  placeholder={t("zipPlaceholder")}
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  inputMode="numeric"
                  maxLength={10}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="delivery-city" className="text-sm">
                  {t("cityLabel")}
                </Label>
                <Input
                  id="delivery-city"
                  type="text"
                  placeholder={t("cityPlaceholder")}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  maxLength={ADDRESS_MAX_LENGTH}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="delivery-country" className="text-sm">
                {t("countryLabel")}
              </Label>
              <Input
                id="delivery-country"
                type="text"
                placeholder={t("countryPlaceholder")}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                maxLength={ADDRESS_MAX_LENGTH}
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="mt-6">
        <div className="space-y-1.5">
          <Label htmlFor="order-notes" className="text-sm font-semibold">
            {t("notesLabel")}
          </Label>
          <Textarea
            id="order-notes"
            placeholder={t("notesPlaceholder")}
            value={localNotes}
            onChange={(e) => handleNotesChange(e.target.value)}
            rows={3}
            maxLength={NOTES_MAX_LENGTH}
            className="resize-none text-base"
          />
          <p className="text-xs text-muted-foreground text-right">
            {t("notesCounter", { current: localNotes.length, max: NOTES_MAX_LENGTH })}
          </p>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background p-4">
        <div className="mx-auto flex max-w-lg gap-3">
          <Button variant="outline" className="shrink-0" asChild>
            <Link href={`${basePath}/checkout`}>
              <ArrowLeft className="h-4 w-4" />
              {tCheckout("back")}
            </Link>
          </Button>
          <Button
            className="flex-1 font-semibold"
            onClick={handleContinue}
          >
            {t("continue")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
