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
import type { DeliveryAddress } from "@/hooks/use-checkout";

const NOTES_MAX_LENGTH = 500;
const ADDRESS_MAX_LENGTH = 255;

interface CheckoutDeliveryStepProps {
  slug: string;
}

/**
 * OPH-79: Checkout step 2 — Delivery Address & Notes.
 *
 * - Collapsible alternate delivery address (all fields optional)
 * - Order notes textarea with character counter
 * - Sticky footer: back to step 1, forward to step 3 (always enabled)
 */
export function CheckoutDeliveryStep({ slug }: CheckoutDeliveryStepProps) {
  const router = useRouter();
  const basePath = useSfBasePath(slug);
  const {
    isDealerIdentified,
    deliveryAddress,
    notes,
    setDeliveryAddress,
    setNotes,
  } = useCheckout();

  // Flow guard: redirect to step 1 if no dealer identified
  useEffect(() => {
    if (!isDealerIdentified) {
      router.replace(`${basePath}/checkout`);
    }
  }, [isDealerIdentified, router, slug]);

  // Local form state — pre-filled from context (preserves data on back-navigation)
  const [addressOpen, setAddressOpen] = useState(deliveryAddress !== null);
  const [companyName, setCompanyName] = useState(deliveryAddress?.companyName ?? "");
  const [street, setStreet] = useState(deliveryAddress?.street ?? "");
  const [zipCode, setZipCode] = useState(deliveryAddress?.zipCode ?? "");
  const [city, setCity] = useState(deliveryAddress?.city ?? "");
  const [country, setCountry] = useState(deliveryAddress?.country ?? "Deutschland");
  const [localNotes, setLocalNotes] = useState(notes);

  // Sync notes to context on change
  const handleNotesChange = (value: string) => {
    const trimmed = value.slice(0, NOTES_MAX_LENGTH);
    setLocalNotes(trimmed);
    setNotes(trimmed);
  };

  // BUG-1 fix: Sync address to context on every field change
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

  // Don't render if guard will redirect
  if (!isDealerIdentified) {
    return null;
  }

  return (
    <div className="flex flex-col pb-28">
      {/* Progress indicator */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <span className="text-muted-foreground">1. Händler</span>
          <Separator className="flex-1" />
          <span className="font-semibold text-primary">2. Lieferung</span>
          <Separator className="flex-1" />
          <span>3. Bestätigung</span>
        </div>
        <h1 className="text-lg font-semibold">Lieferung & Bemerkungen</h1>
        <p className="text-sm text-muted-foreground">
          Optional: Abweichende Lieferadresse und Bemerkungen zur Bestellung.
        </p>
      </div>

      {/* Section A: Alternate delivery address (collapsible) */}
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
                  Abweichende Lieferadresse
                </p>
                <p className="text-xs text-muted-foreground">
                  Nur angeben, wenn die Lieferung nicht an die Händleradresse gehen soll.
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
            {/* Company name */}
            <div className="space-y-1.5">
              <Label htmlFor="delivery-company" className="text-sm">
                Firmenname
              </Label>
              <Input
                id="delivery-company"
                type="text"
                placeholder="Firmenname"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                maxLength={ADDRESS_MAX_LENGTH}
              />
            </div>

            {/* Street */}
            <div className="space-y-1.5">
              <Label htmlFor="delivery-street" className="text-sm">
                Straße & Hausnummer
              </Label>
              <Input
                id="delivery-street"
                type="text"
                placeholder="Musterstraße 123"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                maxLength={ADDRESS_MAX_LENGTH}
              />
            </div>

            {/* Zip + City (side by side) */}
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="delivery-zip" className="text-sm">
                  PLZ
                </Label>
                <Input
                  id="delivery-zip"
                  type="text"
                  placeholder="12345"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  inputMode="numeric"
                  maxLength={10}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="delivery-city" className="text-sm">
                  Ort
                </Label>
                <Input
                  id="delivery-city"
                  type="text"
                  placeholder="Musterstadt"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  maxLength={ADDRESS_MAX_LENGTH}
                />
              </div>
            </div>

            {/* Country */}
            <div className="space-y-1.5">
              <Label htmlFor="delivery-country" className="text-sm">
                Land
              </Label>
              <Input
                id="delivery-country"
                type="text"
                placeholder="Deutschland"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                maxLength={ADDRESS_MAX_LENGTH}
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Section B: Order notes */}
      <div className="mt-6">
        <div className="space-y-1.5">
          <Label htmlFor="order-notes" className="text-sm font-semibold">
            Bemerkungen
          </Label>
          <Textarea
            id="order-notes"
            placeholder="z.B. Dringend, Lieferung bis Freitag"
            value={localNotes}
            onChange={(e) => handleNotesChange(e.target.value)}
            rows={3}
            maxLength={NOTES_MAX_LENGTH}
            className="resize-none text-base"
          />
          <p className="text-xs text-muted-foreground text-right">
            {localNotes.length} / {NOTES_MAX_LENGTH}
          </p>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background p-4">
        <div className="mx-auto flex max-w-lg gap-3">
          <Button variant="outline" className="shrink-0" asChild>
            <Link href={`${basePath}/checkout`}>
              <ArrowLeft className="h-4 w-4" />
              Zurück
            </Link>
          </Button>
          <Button
            className="flex-1 font-semibold"
            onClick={handleContinue}
          >
            Weiter zur Zusammenfassung
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
