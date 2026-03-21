"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TagInput } from "@/components/admin/tag-input";
import type { Tenant, TenantStatus, ErpType } from "@/lib/types";
import type { CreateTenantInput } from "@/lib/validations";

const ERP_OPTIONS: { value: ErpType; label: string }[] = [
  { value: "SAP", label: "SAP" },
  { value: "Dynamics365", label: "Dynamics 365" },
  { value: "Sage", label: "Sage" },
  { value: "Custom", label: "Custom" },
];

const STATUS_OPTIONS: { value: TenantStatus; label: string }[] = [
  { value: "active", label: "Aktiv" },
  { value: "inactive", label: "Inaktiv" },
  { value: "trial", label: "Testphase" },
];

/** Auto-generates a URL-safe slug from a name. */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

interface TenantCreateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: CreateTenantInput) => Promise<Tenant | null>;
  isMutating: boolean;
}

export function TenantCreateSheet({
  open,
  onOpenChange,
  onSave,
  isMutating,
}: TenantCreateSheetProps) {
  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [erpType, setErpType] = useState<ErpType>("SAP");
  const [status, setStatus] = useState<TenantStatus>("active");
  const [allowedEmailDomains, setAllowedEmailDomains] = useState<string[]>([]);
  // OPH-28: ERP config selector
  const [erpConfigId, setErpConfigId] = useState<string | null>(null);
  const [erpConfigs, setErpConfigs] = useState<
    {
      id: string;
      name: string;
      description: string | null;
      format: string;
      fallback_mode: string;
      assigned_tenant_count: number;
      version_count: number;
      last_updated: string;
    }[]
  >([]);

  // Reset form when sheet opens
  useEffect(() => {
    if (open) {
      setName("");
      setSlug("");
      setSlugTouched(false);
      setContactEmail("");
      setErpType("SAP");
      setStatus("active");
      setAllowedEmailDomains([]);
      setErpConfigId(null);
    }
  }, [open]);

  // Fetch ERP configs
  useEffect(() => {
    if (!open) return;
    fetch("/api/admin/erp-configs")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setErpConfigs(json?.data ?? []))
      .catch(() => setErpConfigs([]));
  }, [open]);

  // Auto-generate slug from name
  const handleNameChange = (newName: string) => {
    setName(newName);
    if (!slugTouched) {
      setSlug(generateSlug(newName));
    }
  };

  const handleSlugChange = (newSlug: string) => {
    setSlugTouched(true);
    setSlug(newSlug.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data: CreateTenantInput = {
      name,
      slug,
      contact_email: contactEmail,
      erp_type: erpType,
      status,
      allowed_email_domains: allowedEmailDomains,
      erp_config_id: erpConfigId,
    };
    const result = await onSave(data);
    if (result) {
      onOpenChange(false);
    }
  };

  // OPH-17: Client-side domain validation
  const validateDomain = useCallback((domain: string): string | null => {
    const d = domain.toLowerCase();
    if (d.length < 3) return "Domain muss mindestens 3 Zeichen lang sein.";
    if (d.includes("@")) return "Bitte nur die Domain eingeben, ohne @.";
    if (!d.includes("."))
      return "Domain muss einen Punkt enthalten (z.B. example.de).";
    if (d.includes(".."))
      return "Domain darf keine aufeinanderfolgenden Punkte enthalten.";
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(d))
      return "Ungultige Domain (z.B. example.de).";
    return null;
  }, []);

  // OPH-17: Warn when contact_email domain is not usable as fallback
  const contactDomainWarning = useMemo(() => {
    if (allowedEmailDomains.length > 0) return null;
    const domain = contactEmail.split("@")[1]?.toLowerCase();
    if (!domain || domain.length < 3 || !domain.includes(".")) {
      return "Ohne konfigurierte Domains und ohne gultige Kontakt-E-Mail-Domain konnen keine eingehenden E-Mails autorisiert werden.";
    }
    return null;
  }, [contactEmail, allowedEmailDomains]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-lg p-0 flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetHeader className="px-6 pt-6 pb-0">
          <SheetTitle>Neuen Mandanten anlegen</SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 min-h-0"
        >
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-tenant-name">Name *</Label>
              <Input
                id="create-tenant-name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="z.B. Dental GmbH"
                required
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-tenant-slug">Slug *</Label>
              <Input
                id="create-tenant-slug"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="z.B. dental-gmbh"
                required
                maxLength={50}
              />
              <p className="text-xs text-muted-foreground">
                URL-sicherer Bezeichner (Kleinbuchstaben, Zahlen,
                Bindestriche). Kann nach Erstellung nicht geandert werden.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-tenant-email">Kontakt-E-Mail *</Label>
              <Input
                id="create-tenant-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="kontakt@beispiel.de"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-tenant-erp">ERP-Typ *</Label>
              <Select
                value={erpType}
                onValueChange={(v) => setErpType(v as ErpType)}
              >
                <SelectTrigger id="create-tenant-erp">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ERP_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* OPH-28: ERP config selector */}
            <div className="space-y-2">
              <Label htmlFor="create-tenant-erp-config">
                ERP-Konfiguration
              </Label>
              <Select
                value={erpConfigId ?? "none"}
                onValueChange={(v) =>
                  setErpConfigId(v === "none" ? null : v)
                }
              >
                <SelectTrigger id="create-tenant-erp-config">
                  <SelectValue placeholder="Keine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Keine</SelectItem>
                  {erpConfigs.map((config) => (
                    <SelectItem key={config.id} value={config.id}>
                      {config.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-tenant-status">Status *</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as TenantStatus)}
              >
                <SelectTrigger id="create-tenant-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {status === "trial" && (
                <p className="text-xs text-muted-foreground">
                  Testphase: 28 Tage ab Erstellung. Startdatum und
                  Ablaufdatum werden automatisch gesetzt.
                </p>
              )}
            </div>

            {/* OPH-17: Allowed email domains */}
            <div className="space-y-2">
              <Label>Erlaubte E-Mail-Domains</Label>
              <TagInput
                value={allowedEmailDomains}
                onChange={setAllowedEmailDomains}
                placeholder="z.B. example.de + Enter"
                maxItems={10}
                validate={validateDomain}
              />
              {allowedEmailDomains.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Kein Eintrag: Domain aus Kontakt-E-Mail wird automatisch
                  verwendet.
                </p>
              )}
              {contactDomainWarning && (
                <p className="flex items-start gap-1.5 text-xs text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {contactDomainWarning}
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t p-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isMutating}
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              disabled={
                isMutating ||
                !name.trim() ||
                !slug.trim() ||
                !contactEmail.trim()
              }
            >
              {isMutating && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Erstellen
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
