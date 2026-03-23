"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { CustomerCatalogItem } from "@/lib/types";
import type { CreateCustomerInput, UpdateCustomerInput } from "@/lib/validations";

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, we are editing this customer. Otherwise, creating a new one. */
  customer: CustomerCatalogItem | null;
  onSave: (
    data: CreateCustomerInput | UpdateCustomerInput,
    isNew: boolean,
    customerId?: string
  ) => Promise<{ ok: boolean; error?: string }>;
}

const FIELDS: {
  key: keyof CreateCustomerInput;
  label: string;
  required: boolean;
  placeholder: string;
}[] = [
  { key: "customer_number", label: "Kundennummer", required: true, placeholder: "z.B. 10001" },
  { key: "company_name", label: "Firma", required: true, placeholder: "z.B. Dental Muster GmbH" },
  { key: "street", label: "Strasse", required: false, placeholder: "z.B. Hauptstrasse 12" },
  { key: "postal_code", label: "PLZ", required: false, placeholder: "z.B. 80331" },
  { key: "city", label: "Stadt", required: false, placeholder: "z.B. Muenchen" },
  { key: "country", label: "Land", required: false, placeholder: "z.B. Deutschland" },
  { key: "email", label: "E-Mail", required: false, placeholder: "z.B. bestellung@firma.de" },
  { key: "phone", label: "Telefon", required: false, placeholder: "z.B. +49 89 12345678" },
  { key: "keywords", label: "Suchbegriffe / Aliase", required: false, placeholder: "z.B. Dental Muster, DM GmbH" },
];

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  onSave,
}: CustomerFormDialogProps) {
  const isNew = !customer;

  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return;
    setError(null);
    setIsSaving(false);

    if (customer) {
      setFormData({
        customer_number: customer.customer_number,
        company_name: customer.company_name,
        street: customer.street ?? "",
        postal_code: customer.postal_code ?? "",
        city: customer.city ?? "",
        country: customer.country ?? "",
        email: customer.email ?? "",
        phone: customer.phone ?? "",
        keywords: customer.keywords ?? "",
      });
    } else {
      setFormData({});
    }
  }, [open, customer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      const data: CreateCustomerInput = {
        customer_number: formData.customer_number?.replace(/\s+/g, "") ?? "",
        company_name: formData.company_name?.trim() ?? "",
        street: formData.street?.trim() || null,
        postal_code: formData.postal_code?.trim() || null,
        city: formData.city?.trim() || null,
        country: formData.country?.trim() || null,
        email: formData.email?.trim() || null,
        phone: formData.phone?.trim() || null,
        keywords: formData.keywords?.trim() || null,
      };

      const result = await onSave(data, isNew, customer?.id);

      if (result.ok) {
        onOpenChange(false);
      } else {
        setError(result.error ?? "Fehler beim Speichern.");
      }
    } catch {
      setError("Unerwarteter Fehler beim Speichern.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {isNew ? "Kunde hinzufuegen" : "Kunde bearbeiten"}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "Neuen Kunden zum Kundenstamm hinzufuegen."
              : "Kundendaten aktualisieren."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {FIELDS.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`customer-${field.key}`}>
                {field.label}
                {field.required && " *"}
              </Label>
              <Input
                id={`customer-${field.key}`}
                value={formData[field.key] ?? ""}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                placeholder={field.placeholder}
                required={field.required}
                disabled={isSaving}
              />
            </div>
          ))}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isNew ? "Hinzufuegen" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
