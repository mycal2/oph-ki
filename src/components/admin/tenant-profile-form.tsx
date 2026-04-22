"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Loader2, Clock, Info, AlertTriangle, Mail, Receipt, Forward, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TagInput } from "@/components/admin/tag-input";
import { TenantLogoUpload } from "@/components/tenant-logo-upload";
import type { Tenant, TenantStatus, ErpType } from "@/lib/types";
import type { UpdateTenantInput } from "@/lib/validations";

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

// OPH-52: Billing model defaults (business constants, not user data)
type BillingModel = "pay-per-use" | "license-based" | "flat-rate";

const BILLING_MODEL_OPTIONS: { value: BillingModel; label: string }[] = [
  { value: "pay-per-use", label: "Pay-per-use" },
  { value: "license-based", label: "License-based" },
  { value: "flat-rate", label: "Flat-rate" },
];

const BILLING_DEFAULTS: Record<
  BillingModel,
  { setup_fee: number; monthly_fee: number; cost_per_order: number }
> = {
  "pay-per-use": { setup_fee: 799.0, monthly_fee: 0.0, cost_per_order: 1.0 },
  "license-based": {
    setup_fee: 6999.0,
    monthly_fee: 290.0,
    cost_per_order: 0.35,
  },
  "flat-rate": { setup_fee: 9999.0, monthly_fee: 390.0, cost_per_order: 0.0 },
};

interface TenantProfileFormProps {
  tenant: Tenant;
  onSave: (data: UpdateTenantInput) => Promise<Tenant | null>;
  isMutating: boolean;
}

export function TenantProfileForm({
  tenant,
  onSave,
  isMutating,
}: TenantProfileFormProps) {
  // Form state
  const [name, setName] = useState(tenant.name);
  const [contactEmail, setContactEmail] = useState(tenant.contact_email);
  const [erpType, setErpType] = useState<ErpType>(tenant.erp_type);
  const [status, setStatus] = useState<TenantStatus>(tenant.status);
  const [allowedEmailDomains, setAllowedEmailDomains] = useState<string[]>(
    tenant.allowed_email_domains ?? []
  );
  // OPH-35: Granular email notification toggles
  const [emailConfirmation, setEmailConfirmation] = useState(
    tenant.email_confirmation_enabled
  );
  const [emailResults, setEmailResults] = useState(
    tenant.email_results_enabled
  );
  const [emailResultsFormat, setEmailResultsFormat] = useState<
    "standard_csv" | "tenant_format"
  >(tenant.email_results_format);
  const [emailResultsConfidence, setEmailResultsConfidence] = useState(
    tenant.email_results_confidence_enabled
  );
  const [emailPostprocess, setEmailPostprocess] = useState(
    tenant.email_postprocess_enabled
  );
  // OPH-63: Email forwarding
  const [emailForwardingEnabled, setEmailForwardingEnabled] = useState(
    tenant.email_forwarding_enabled
  );
  const [emailForwardingAddress, setEmailForwardingAddress] = useState(
    tenant.email_forwarding_address ?? ""
  );
  // OPH-94: Excel sheet name filter
  const [excelSheetName, setExcelSheetName] = useState(
    tenant.excel_sheet_name ?? ""
  );
  // OPH-28: ERP config selector
  const [erpConfigId, setErpConfigId] = useState<string | null>(
    tenant.erp_config_id ?? null
  );
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

  // OPH-52: Billing state
  const [billingModel, setBillingModel] = useState<BillingModel | null>(
    tenant.billing_model ?? null
  );
  const [setupFee, setSetupFee] = useState<string>(
    tenant.setup_fee != null ? String(tenant.setup_fee) : ""
  );
  const [monthlyFee, setMonthlyFee] = useState<string>(
    tenant.monthly_fee != null ? String(tenant.monthly_fee) : ""
  );
  const [costPerOrder, setCostPerOrder] = useState<string>(
    tenant.cost_per_order != null ? String(tenant.cost_per_order) : ""
  );
  // Track whether the user manually edited price fields (to trigger confirmation on model switch)
  const billingPricesManuallyEdited = useRef(false);
  // Pending billing model change (for confirmation dialog)
  const [pendingBillingModel, setPendingBillingModel] = useState<
    BillingModel | null
  >(null);
  const [showBillingConfirm, setShowBillingConfirm] = useState(false);

  // Re-populate when tenant changes
  useEffect(() => {
    setName(tenant.name);
    setContactEmail(tenant.contact_email);
    setErpType(tenant.erp_type);
    setStatus(tenant.status);
    setAllowedEmailDomains(tenant.allowed_email_domains ?? []);
    setEmailConfirmation(tenant.email_confirmation_enabled);
    setEmailResults(tenant.email_results_enabled);
    setEmailResultsFormat(tenant.email_results_format);
    setEmailResultsConfidence(tenant.email_results_confidence_enabled);
    setEmailPostprocess(tenant.email_postprocess_enabled);
    setErpConfigId(tenant.erp_config_id ?? null);
    // OPH-94: Reset excel sheet name
    setExcelSheetName(tenant.excel_sheet_name ?? "");
    // OPH-63: Reset forwarding state
    setEmailForwardingEnabled(tenant.email_forwarding_enabled);
    setEmailForwardingAddress(tenant.email_forwarding_address ?? "");
    // OPH-52: Reset billing state
    setBillingModel(tenant.billing_model ?? null);
    setSetupFee(tenant.setup_fee != null ? String(tenant.setup_fee) : "");
    setMonthlyFee(tenant.monthly_fee != null ? String(tenant.monthly_fee) : "");
    setCostPerOrder(
      tenant.cost_per_order != null ? String(tenant.cost_per_order) : ""
    );
    billingPricesManuallyEdited.current = false;
  }, [tenant]);

  // Fetch ERP configs
  useEffect(() => {
    fetch("/api/admin/erp-configs")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setErpConfigs(json?.data ?? []))
      .catch(() => setErpConfigs([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // OPH-52: Parse billing fee strings to numbers (empty = null)
    const parseFee = (v: string): number | null => {
      if (v.trim() === "") return null;
      const n = parseFloat(v);
      return isNaN(n) ? null : n;
    };

    const data: UpdateTenantInput = {
      name,
      contact_email: contactEmail,
      erp_type: erpType,
      status,
      allowed_email_domains: allowedEmailDomains,
      email_confirmation_enabled: emailConfirmation,
      email_results_enabled: emailResults,
      email_results_format: emailResultsFormat,
      email_results_confidence_enabled: emailResultsConfidence,
      email_postprocess_enabled: emailPostprocess,
      erp_config_id: erpConfigId,
      email_forwarding_enabled: emailForwardingEnabled,
      email_forwarding_address: emailForwardingAddress || null,
      excel_sheet_name: excelSheetName || null,
      billing_model: billingModel,
      setup_fee: parseFee(setupFee),
      monthly_fee: parseFee(monthlyFee),
      cost_per_order: parseFee(costPerOrder),
    };
    await onSave(data);
  };

  // OPH-17 BUG-1: Client-side domain validation
  const validateDomain = useCallback((domain: string): string | null => {
    const d = domain.toLowerCase();
    if (d.length < 3) return "Domain muss mindestens 3 Zeichen lang sein.";
    if (d.includes("@")) return "Bitte nur die Domain eingeben, ohne @.";
    if (!d.includes("."))
      return "Domain muss einen Punkt enthalten (z.B. example.de).";
    if (d.includes(".."))
      return "Domain darf keine aufeinanderfolgenden Punkte enthalten.";
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(d))
      return "Ungültige Domain (z.B. example.de).";
    return null;
  }, []);

  // OPH-17 BUG-3: Warn when contact_email domain is not usable as fallback
  const contactDomainWarning = useMemo(() => {
    if (allowedEmailDomains.length > 0) return null;
    const domain = contactEmail.split("@")[1]?.toLowerCase();
    if (!domain || domain.length < 3 || !domain.includes(".")) {
      return "Ohne konfigurierte Domains und ohne gultige Kontakt-E-Mail-Domain konnen keine eingehenden E-Mails autorisiert werden.";
    }
    return null;
  }, [contactEmail, allowedEmailDomains]);

  // OPH-51: Save logo URL independently (without submitting the whole form)
  const handleLogoSave = useCallback(
    async (logoUrl: string | null): Promise<boolean> => {
      const result = await onSave({ logo_url: logoUrl });
      return !!result;
    },
    [onSave]
  );

  // OPH-52: Apply billing model defaults to the price fields
  const applyBillingDefaults = useCallback((model: BillingModel | null) => {
    setBillingModel(model);
    if (model) {
      const defaults = BILLING_DEFAULTS[model];
      setSetupFee(String(defaults.setup_fee));
      setMonthlyFee(String(defaults.monthly_fee));
      setCostPerOrder(String(defaults.cost_per_order));
    } else {
      setSetupFee("");
      setMonthlyFee("");
      setCostPerOrder("");
    }
    billingPricesManuallyEdited.current = false;
  }, []);

  // OPH-52: Handle billing model dropdown change
  const handleBillingModelChange = useCallback(
    (value: string) => {
      const newModel =
        value === "none" ? null : (value as BillingModel);
      // If prices were manually edited, show confirmation before overwriting
      if (billingPricesManuallyEdited.current && newModel !== billingModel) {
        setPendingBillingModel(newModel);
        setShowBillingConfirm(true);
      } else {
        applyBillingDefaults(newModel);
      }
    },
    [billingModel, applyBillingDefaults]
  );

  // OPH-52: Mark prices as manually edited when user changes a fee input
  const handleFeeChange = useCallback(
    (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value);
      billingPricesManuallyEdited.current = true;
    },
    []
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* OPH-51: Logo upload section */}
      <div className="rounded-lg border p-4">
        <TenantLogoUpload
          logoUrl={tenant.logo_url}
          tenantId={tenant.id}
          onSave={handleLogoSave}
          disabled={isMutating}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left column: Core fields */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tenant-name">Name *</Label>
            <Input
              id="tenant-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Dental GmbH"
              required
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenant-slug">Slug</Label>
            <Input
              id="tenant-slug"
              value={tenant.slug}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              Slug ist nach Erstellung unveränderlich.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenant-email">Kontakt-E-Mail *</Label>
            <Input
              id="tenant-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="kontakt@beispiel.de"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenant-erp">ERP-Typ *</Label>
            <Select
              value={erpType}
              onValueChange={(v) => setErpType(v as ErpType)}
            >
              <SelectTrigger id="tenant-erp">
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
            <Label htmlFor="tenant-erp-config">ERP-Konfiguration</Label>
            <Select
              value={erpConfigId ?? "none"}
              onValueChange={(v) => setErpConfigId(v === "none" ? null : v)}
            >
              <SelectTrigger id="tenant-erp-config">
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
            <Label htmlFor="tenant-status">Status *</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as TenantStatus)}
            >
              <SelectTrigger id="tenant-status">
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
          </div>

          {/* OPH-16: Trial period info */}
          {status === "trial" &&
            tenant.trial_started_at &&
            tenant.trial_expires_at && (
              <Alert className="border-primary/30 bg-primary/5">
                <Info className="h-4 w-4 text-primary" />
                <AlertDescription>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Testphase gestartet:
                      </span>
                      <span className="font-medium">
                        {new Date(
                          tenant.trial_started_at
                        ).toLocaleDateString("de-DE", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Ablaufdatum:
                      </span>
                      <span
                        className={`font-medium ${
                          new Date(tenant.trial_expires_at).getTime() -
                            Date.now() <=
                          7 * 24 * 60 * 60 * 1000
                            ? "text-destructive"
                            : ""
                        }`}
                      >
                        {new Date(
                          tenant.trial_expires_at
                        ).toLocaleDateString("de-DE", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </span>
                      {(() => {
                        const days = Math.ceil(
                          (new Date(tenant.trial_expires_at!).getTime() -
                            Date.now()) /
                            (1000 * 60 * 60 * 24)
                        );
                        if (days <= 0) {
                          return (
                            <span className="text-xs font-semibold text-destructive">
                              (Abgelaufen)
                            </span>
                          );
                        }
                        return (
                          <span
                            className={`text-xs ${
                              days <= 7
                                ? "font-semibold text-destructive"
                                : "text-muted-foreground"
                            }`}
                          >
                            (Noch {days} {days === 1 ? "Tag" : "Tage"})
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

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

        {/* Right column: Email notifications */}
        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                E-Mail-Benachrichtigungen
              </span>
            </div>

            {/* Toggle a: Confirmation email */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="email-confirmation" className="text-sm">
                  Bestätigungs-E-Mail
                </Label>
                <p className="text-xs text-muted-foreground">
                  E-Mail bei Bestellungseingang.
                </p>
              </div>
              <Switch
                id="email-confirmation"
                checked={emailConfirmation}
                onCheckedChange={setEmailConfirmation}
              />
            </div>

            {/* Toggle b: Results email */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="email-results" className="text-sm">
                  Ergebnis-E-Mail
                </Label>
                <p className="text-xs text-muted-foreground">
                  E-Mail nach erfolgreicher Extraktion.
                </p>
              </div>
              <Switch
                id="email-results"
                checked={emailResults}
                onCheckedChange={setEmailResults}
              />
            </div>

            {/* Toggle c: Attachment format */}
            <div
              className={`flex items-center justify-between ${
                !emailResults ? "opacity-50" : ""
              }`}
            >
              <div className="space-y-0.5">
                <Label htmlFor="email-results-format" className="text-sm">
                  Anhang-Format
                </Label>
                <p className="text-xs text-muted-foreground">
                  Format des CSV-/ERP-Anhangs in der Ergebnis-E-Mail.
                </p>
              </div>
              <Select
                value={emailResultsFormat}
                onValueChange={(v) =>
                  setEmailResultsFormat(v as "standard_csv" | "tenant_format")
                }
                disabled={!emailResults}
              >
                <SelectTrigger
                  id="email-results-format"
                  className="w-[180px]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard_csv">Standard CSV</SelectItem>
                  <SelectItem value="tenant_format">
                    Mandanten-Format
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Toggle d: Confidence score */}
            <div
              className={`flex items-center justify-between ${
                !emailResults ? "opacity-50" : ""
              }`}
            >
              <div className="space-y-0.5">
                <Label htmlFor="email-confidence" className="text-sm">
                  Konfidenz-Score
                </Label>
                <p className="text-xs text-muted-foreground">
                  Extraktions-Konfidenz in Ergebnis-E-Mail anzeigen.
                </p>
              </div>
              <Switch
                id="email-confidence"
                checked={emailResultsConfidence}
                onCheckedChange={setEmailResultsConfidence}
                disabled={!emailResults}
              />
            </div>

            {/* Toggle e: Post-process (placeholder) */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="email-postprocess" className="text-sm">
                  Nachbearbeitung (in Vorbereitung)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Zukünftiger Nachbearbeitungsschritt. Keine Auswirkung.
                </p>
              </div>
              <Switch
                id="email-postprocess"
                checked={emailPostprocess}
                onCheckedChange={setEmailPostprocess}
              />
            </div>
          </div>

          {/* OPH-63: Email forwarding section */}
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Forward className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">E-Mail-Weiterleitung</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="email-forwarding" className="text-sm">
                  E-Mail-Weiterleitung
                </Label>
                <p className="text-xs text-muted-foreground">
                  Eingehende Bestell-E-Mails an eine weitere Adresse weiterleiten.
                </p>
              </div>
              <Switch
                id="email-forwarding"
                checked={emailForwardingEnabled}
                onCheckedChange={setEmailForwardingEnabled}
                aria-label="E-Mail-Weiterleitung aktivieren"
              />
            </div>

            <div className={`space-y-2 ${!emailForwardingEnabled ? "opacity-50" : ""}`}>
              <Label htmlFor="email-forwarding-address" className="text-sm">
                Weiterleitungs-Adresse
              </Label>
              <Input
                id="email-forwarding-address"
                type="email"
                value={emailForwardingAddress}
                onChange={(e) => setEmailForwardingAddress(e.target.value)}
                placeholder="weiterleitung@beispiel.de"
                disabled={!emailForwardingEnabled}
                aria-label="Weiterleitungs-E-Mail-Adresse"
              />
              {!emailForwardingEnabled && (
                <p className="text-xs text-muted-foreground">
                  Aktivieren Sie die Weiterleitung, um eine Adresse zu konfigurieren.
                </p>
              )}
            </div>
          </div>

          {/* OPH-94: Excel sheet filter */}
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Excel-Extraktion</span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="excel-sheet-name">Excel-Blattname</Label>
              <Input
                id="excel-sheet-name"
                value={excelSheetName}
                onChange={(e) => setExcelSheetName(e.target.value)}
                placeholder="z.B. Order Form"
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">
                Wenn gesetzt, wird bei Excel-Bestellungen nur das Blatt mit
                diesem Namen extrahiert. Leer lassen = alle Blätter.
              </p>
            </div>
          </div>

          {/* OPH-52: Billing section */}
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Abrechnung</span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="billing-model">Abrechnungsmodell</Label>
              <Select
                value={billingModel ?? "none"}
                onValueChange={handleBillingModelChange}
              >
                <SelectTrigger id="billing-model">
                  <SelectValue placeholder="Nicht gesetzt" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nicht gesetzt</SelectItem>
                  {BILLING_MODEL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="setup-fee">Setup-Gebuhr (EUR)</Label>
              <Input
                id="setup-fee"
                type="number"
                min="0"
                step="0.01"
                value={setupFee}
                onChange={handleFeeChange(setSetupFee)}
                placeholder="0.00"
                disabled={!billingModel}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="monthly-fee">Monatliche Gebuhr (EUR)</Label>
              <Input
                id="monthly-fee"
                type="number"
                min="0"
                step="0.01"
                value={monthlyFee}
                onChange={handleFeeChange(setMonthlyFee)}
                placeholder="0.00"
                disabled={!billingModel}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cost-per-order">
                Kosten pro Bestellung (EUR)
              </Label>
              <Input
                id="cost-per-order"
                type="number"
                min="0"
                step="0.01"
                value={costPerOrder}
                onChange={handleFeeChange(setCostPerOrder)}
                placeholder="0.00"
                disabled={!billingModel}
              />
            </div>

            {!billingModel && (
              <p className="text-xs text-muted-foreground">
                Wahlen Sie ein Abrechnungsmodell, um die Preise zu konfigurieren.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* OPH-52: Confirmation dialog for billing model switch */}
      <AlertDialog open={showBillingConfirm} onOpenChange={setShowBillingConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Abrechnungsmodell wechseln?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Preise werden auf Standardwerte zuruckgesetzt. Fortfahren?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPendingBillingModel(null);
                setShowBillingConfirm(false);
              }}
            >
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                applyBillingDefaults(pendingBillingModel);
                setPendingBillingModel(null);
                setShowBillingConfirm(false);
              }}
            >
              Fortfahren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save button */}
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={
            isMutating || !name.trim() || !contactEmail.trim()
          }
        >
          {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Speichern
        </Button>
      </div>
    </form>
  );
}

/**
 * Loading skeleton for the profile form.
 */
export function TenantProfileFormSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  );
}
