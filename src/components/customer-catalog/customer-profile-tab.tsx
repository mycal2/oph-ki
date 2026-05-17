"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CustomerCatalogItem, ApiResponse } from "@/lib/types";
import type { UpdateCustomerInput } from "@/lib/validations";

interface CustomerProfileTabProps {
  customer: CustomerCatalogItem;
  onSaved: (updated: CustomerCatalogItem) => void;
  /** When true, hide buttons and disable inputs (read-only role). */
  readOnly?: boolean;
}

const FIELDS: {
  key: keyof Omit<UpdateCustomerInput, "notes">;
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

/**
 * OPH-106: Customer profile editor — reusable inside the customer detail page.
 *
 * Mirrors the legacy CustomerFormDialog body but is embedded in a tab instead
 * of a modal. Persists via PUT /api/customers/[id].
 */
export function CustomerProfileTab({
  customer,
  onSaved,
  readOnly = false,
}: CustomerProfileTabProps) {
  const [formData, setFormData] = useState<Record<string, string>>(
    toFormData(customer)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setFormData(toFormData(customer));
    setIsDirty(false);
    setError(null);
  }, [customer]);

  const updateField = useCallback((key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }, []);

  const handleReset = useCallback(() => {
    setFormData(toFormData(customer));
    setIsDirty(false);
    setError(null);
  }, [customer]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (readOnly) return;
      setError(null);
      setIsSaving(true);

      try {
        const data: UpdateCustomerInput = {
          customer_number: formData.customer_number?.replace(/\s+/g, "") ?? "",
          company_name: formData.company_name?.trim() ?? "",
          street: formData.street?.trim() || null,
          postal_code: formData.postal_code?.trim() || null,
          city: formData.city?.trim() || null,
          country: formData.country?.trim() || null,
          email: formData.email?.trim() || null,
          phone: formData.phone?.trim() || null,
          keywords: formData.keywords?.trim() || null,
          notes: formData.notes?.trim() || null,
        };

        const res = await fetch(`/api/customers/${customer.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const json = (await res.json()) as ApiResponse;

        if (!res.ok || !json.success) {
          setError(json.error ?? "Fehler beim Speichern.");
          return;
        }

        toast.success("Kunde wurde aktualisiert.");
        // Merge updated fields into the in-memory customer object so the
        // detail page header reflects the new name/number immediately.
        onSaved({
          ...customer,
          customer_number: data.customer_number ?? customer.customer_number,
          company_name: data.company_name ?? customer.company_name,
          street: data.street ?? null,
          postal_code: data.postal_code ?? null,
          city: data.city ?? null,
          country: data.country ?? null,
          email: data.email ?? null,
          phone: data.phone ?? null,
          keywords: data.keywords ?? null,
          notes: data.notes ?? null,
        });
        setIsDirty(false);
      } catch {
        setError("Netzwerkfehler beim Speichern.");
      } finally {
        setIsSaving(false);
      }
    },
    [customer, formData, onSaved, readOnly]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Kundendaten</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`customer-${field.key}`}>
                  {field.label}
                  {field.required && " *"}
                </Label>
                <Input
                  id={`customer-${field.key}`}
                  value={formData[field.key] ?? ""}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                  disabled={isSaving || readOnly}
                />
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer-notes">Notizen</Label>
            <Textarea
              id="customer-notes"
              value={formData.notes ?? ""}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Interne Anmerkungen, Ansprechpartner, Sonderhinweise..."
              disabled={isSaving || readOnly}
              rows={3}
            />
          </div>

          {!readOnly && (
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={isSaving || !isDirty}
              >
                Zuruecksetzen
              </Button>
              <Button type="submit" disabled={isSaving || !isDirty}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Speichern
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function toFormData(customer: CustomerCatalogItem): Record<string, string> {
  return {
    customer_number: customer.customer_number,
    company_name: customer.company_name,
    street: customer.street ?? "",
    postal_code: customer.postal_code ?? "",
    city: customer.city ?? "",
    country: customer.country ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    keywords: customer.keywords ?? "",
    notes: customer.notes ?? "",
  };
}
