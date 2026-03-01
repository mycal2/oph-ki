"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertTriangle, Clock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TagInput } from "@/components/admin/tag-input";
import type {
  Dealer,
  DealerFormatType,
  DealerRuleConflict,
  DealerAuditLogEntry,
  DealerAuditAction,
} from "@/lib/types";
import type { CreateDealerInput, UpdateDealerInput } from "@/lib/validations";

interface DealerFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealerId: string | null;
  onSave: (
    data: CreateDealerInput | UpdateDealerInput,
    isNew: boolean
  ) => Promise<{ dealer: Dealer; warnings: DealerRuleConflict[] } | null>;
  onFetchDealer: (id: string) => Promise<Dealer | null>;
  onFetchAuditLog: (id: string) => Promise<DealerAuditLogEntry[]>;
  isMutating: boolean;
}

const FORMAT_OPTIONS: { value: DealerFormatType; label: string }[] = [
  { value: "email_text", label: "E-Mail-Text" },
  { value: "pdf_table", label: "PDF-Tabelle" },
  { value: "excel", label: "Excel" },
  { value: "mixed", label: "Gemischt" },
];

const AUDIT_ACTION_LABELS: Record<DealerAuditAction, string> = {
  created: "Erstellt",
  updated: "Aktualisiert",
  deactivated: "Deaktiviert",
  reactivated: "Reaktiviert",
};

const AUDIT_ACTION_COLORS: Record<DealerAuditAction, string> = {
  created: "bg-green-100 text-green-800",
  updated: "bg-blue-100 text-blue-800",
  deactivated: "bg-red-100 text-red-800",
  reactivated: "bg-green-100 text-green-800",
};

export function DealerFormSheet({
  open,
  onOpenChange,
  dealerId,
  onSave,
  onFetchDealer,
  onFetchAuditLog,
  isMutating,
}: DealerFormSheetProps) {
  const isNew = !dealerId;

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [formatType, setFormatType] = useState<DealerFormatType>("email_text");
  const [street, setStreet] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [knownDomains, setKnownDomains] = useState<string[]>([]);
  const [knownSenderAddresses, setKnownSenderAddresses] = useState<string[]>([]);
  const [subjectPatterns, setSubjectPatterns] = useState<string[]>([]);
  const [filenamePatterns, setFilenamePatterns] = useState<string[]>([]);
  const [extractionHints, setExtractionHints] = useState("");
  const [active, setActive] = useState(true);

  // UI state
  const [isLoadingDealer, setIsLoadingDealer] = useState(false);
  const [warnings, setWarnings] = useState<DealerRuleConflict[]>([]);
  const [auditLog, setAuditLog] = useState<DealerAuditLogEntry[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");

  // Reset form
  const resetForm = useCallback(() => {
    setName("");
    setDescription("");
    setFormatType("email_text");
    setStreet("");
    setPostalCode("");
    setCity("");
    setCountry("");
    setKnownDomains([]);
    setKnownSenderAddresses([]);
    setSubjectPatterns([]);
    setFilenamePatterns([]);
    setExtractionHints("");
    setActive(true);
    setWarnings([]);
    setAuditLog([]);
    setActiveTab("profile");
  }, []);

  // Populate form from dealer data
  const populateForm = useCallback((dealer: Dealer) => {
    setName(dealer.name);
    setDescription(dealer.description ?? "");
    setFormatType(dealer.format_type);
    setStreet(dealer.street ?? "");
    setPostalCode(dealer.postal_code ?? "");
    setCity(dealer.city ?? "");
    setCountry(dealer.country ?? "");
    setKnownDomains(dealer.known_domains);
    setKnownSenderAddresses(dealer.known_sender_addresses);
    setSubjectPatterns(dealer.subject_patterns);
    setFilenamePatterns(dealer.filename_patterns);
    setExtractionHints(dealer.extraction_hints ?? "");
    setActive(dealer.active);
  }, []);

  // Load dealer on open
  useEffect(() => {
    if (!open) return;

    if (isNew) {
      resetForm();
      return;
    }

    setIsLoadingDealer(true);
    onFetchDealer(dealerId).then((dealer) => {
      if (dealer) {
        populateForm(dealer);
      }
      setIsLoadingDealer(false);
    });
  }, [open, dealerId, isNew, onFetchDealer, populateForm, resetForm]);

  // Load audit log when switching to audit tab
  useEffect(() => {
    if (activeTab !== "audit" || isNew || !dealerId) return;

    setIsLoadingAudit(true);
    onFetchAuditLog(dealerId).then((entries) => {
      setAuditLog(entries);
      setIsLoadingAudit(false);
    });
  }, [activeTab, isNew, dealerId, onFetchAuditLog]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      name,
      description: description || null,
      format_type: formatType,
      street: street || null,
      postal_code: postalCode || null,
      city: city || null,
      country: country || null,
      known_domains: knownDomains,
      known_sender_addresses: knownSenderAddresses,
      subject_patterns: subjectPatterns,
      filename_patterns: filenamePatterns,
      extraction_hints: extractionHints || null,
      active,
    };

    const result = await onSave(data, isNew);
    if (result) {
      setWarnings(result.warnings);
      if (result.warnings.length === 0) {
        onOpenChange(false);
      }
    }
  };

  const dismissWarnings = () => {
    setWarnings([]);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-0">
          <SheetTitle>
            {isNew ? "Neuen Haendler anlegen" : "Haendler bearbeiten"}
          </SheetTitle>
        </SheetHeader>

        {isLoadingDealer ? (
          <div className="flex-1 p-6 space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="px-6 pt-4">
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-medium mb-1">Regelkonflikte erkannt:</p>
                    <ul className="list-disc pl-4 space-y-0.5 text-xs">
                      {warnings.map((w, i) => (
                        <li key={i}>
                          <span className="font-mono">{w.value}</span> in{" "}
                          <span className="font-medium">{w.field}</span> kollidiert mit{" "}
                          <span className="font-medium">{w.conflicting_dealer_name}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs">
                      Der Haendler wurde gespeichert. Sie koennen die Konflikte spaeter beheben.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={dismissWarnings}
                    >
                      Verstanden
                    </Button>
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex flex-col flex-1 min-h-0"
            >
              <div className="px-6 pt-4">
                <TabsList className="w-full">
                  <TabsTrigger value="profile" className="flex-1">
                    Profil
                  </TabsTrigger>
                  <TabsTrigger value="rules" className="flex-1">
                    Regeln
                  </TabsTrigger>
                  <TabsTrigger value="hints" className="flex-1">
                    Hints
                  </TabsTrigger>
                  {!isNew && (
                    <TabsTrigger value="audit" className="flex-1">
                      Verlauf
                    </TabsTrigger>
                  )}
                </TabsList>
              </div>

              <ScrollArea className="flex-1">
                {/* Tab: Profile */}
                <TabsContent value="profile" className="px-6 pb-6 space-y-4 mt-0">
                  <div className="space-y-2">
                    <Label htmlFor="dealer-name">Name *</Label>
                    <Input
                      id="dealer-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="z.B. Henry Schein GmbH"
                      required
                      maxLength={200}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dealer-description">Beschreibung</Label>
                    <Textarea
                      id="dealer-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Optionale Beschreibung..."
                      rows={2}
                      maxLength={2000}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dealer-format">Format-Typ *</Label>
                    <Select
                      value={formatType}
                      onValueChange={(v) => setFormatType(v as DealerFormatType)}
                    >
                      <SelectTrigger id="dealer-format">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FORMAT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <p className="text-sm font-medium">Adresse</p>

                  <div className="space-y-2">
                    <Label htmlFor="dealer-street">Strasse</Label>
                    <Input
                      id="dealer-street"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      maxLength={200}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="dealer-postal">PLZ</Label>
                      <Input
                        id="dealer-postal"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        maxLength={20}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dealer-city">Ort</Label>
                      <Input
                        id="dealer-city"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        maxLength={100}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dealer-country">Land</Label>
                      <Input
                        id="dealer-country"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        placeholder="DE"
                        maxLength={10}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="dealer-active">Aktiv</Label>
                      <p className="text-xs text-muted-foreground">
                        Inaktive Haendler werden nicht fuer die Erkennung verwendet.
                      </p>
                    </div>
                    <Switch
                      id="dealer-active"
                      checked={active}
                      onCheckedChange={setActive}
                    />
                  </div>
                </TabsContent>

                {/* Tab: Recognition Rules */}
                <TabsContent value="rules" className="px-6 pb-6 space-y-5 mt-0">
                  <div className="space-y-2">
                    <Label>Bekannte Domains</Label>
                    <p className="text-xs text-muted-foreground">
                      E-Mail-Domains, die diesem Haendler zugeordnet werden (z.B. henryschein.de)
                    </p>
                    <TagInput
                      value={knownDomains}
                      onChange={setKnownDomains}
                      placeholder="Domain eingeben + Enter"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Bekannte Absender-Adressen</Label>
                    <p className="text-xs text-muted-foreground">
                      Exakte E-Mail-Adressen (z.B. bestellung@henryschein.de)
                    </p>
                    <TagInput
                      value={knownSenderAddresses}
                      onChange={setKnownSenderAddresses}
                      placeholder="E-Mail-Adresse eingeben + Enter"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Betreff-Muster</Label>
                    <p className="text-xs text-muted-foreground">
                      Regex-Pattern fuer E-Mail-Betreffs (z.B. Bestellung.*Henry Schein)
                    </p>
                    <TagInput
                      value={subjectPatterns}
                      onChange={setSubjectPatterns}
                      placeholder="Regex-Pattern eingeben + Enter"
                      validateRegex
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Dateinamen-Muster</Label>
                    <p className="text-xs text-muted-foreground">
                      Regex-Pattern fuer Dateinamen (z.B. HS_Bestellung_.*)
                    </p>
                    <TagInput
                      value={filenamePatterns}
                      onChange={setFilenamePatterns}
                      placeholder="Regex-Pattern eingeben + Enter"
                      validateRegex
                    />
                  </div>
                </TabsContent>

                {/* Tab: Extraction Hints */}
                <TabsContent value="hints" className="px-6 pb-6 space-y-4 mt-0">
                  <div className="space-y-2">
                    <Label htmlFor="dealer-hints">Extraktions-Hints</Label>
                    <p className="text-xs text-muted-foreground">
                      Zusaetzliche Anweisungen fuer die KI-Extraktion bei diesem Haendler. Wird dem
                      Claude-Prompt als Kontext beigefuegt.
                    </p>
                    <Textarea
                      id="dealer-hints"
                      value={extractionHints}
                      onChange={(e) => setExtractionHints(e.target.value)}
                      placeholder={
                        "z.B.:\n- Artikelnummern stehen in Spalte B\n- Mengen sind immer in Stueck angegeben\n- Kundennummer steht im Betreff"
                      }
                      rows={12}
                      maxLength={5000}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {extractionHints.length} / 5000
                    </p>
                  </div>
                </TabsContent>

                {/* Tab: Audit Log */}
                {!isNew && (
                  <TabsContent value="audit" className="px-6 pb-6 mt-0">
                    {isLoadingAudit ? (
                      <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-16 w-full" />
                        ))}
                      </div>
                    ) : auditLog.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">
                        Noch keine Aenderungen protokolliert.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {auditLog.map((entry) => (
                          <div
                            key={entry.id}
                            className="rounded-lg border p-3 space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <Badge
                                variant="secondary"
                                className={AUDIT_ACTION_COLORS[entry.action]}
                              >
                                {AUDIT_ACTION_LABELS[entry.action]}
                              </Badge>
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {new Date(entry.created_at).toLocaleString("de-DE")}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="h-3 w-3" />
                              {entry.admin_email}
                            </div>
                            {entry.changed_fields &&
                              Object.keys(entry.changed_fields).length > 0 && (
                                <div className="mt-1.5 text-xs space-y-0.5">
                                  {Object.entries(entry.changed_fields).map(
                                    ([field, change]) => (
                                      <div key={field} className="flex gap-1">
                                        <span className="font-mono text-muted-foreground">
                                          {field}:
                                        </span>
                                        <span className="text-red-600 line-through">
                                          {formatAuditValue(change.old)}
                                        </span>
                                        <span className="text-green-600">
                                          {formatAuditValue(change.new)}
                                        </span>
                                      </div>
                                    )
                                  )}
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                )}
              </ScrollArea>

              {/* Footer with save button */}
              <div className="border-t p-4 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isMutating}
                >
                  Abbrechen
                </Button>
                <Button type="submit" disabled={isMutating || !name.trim()}>
                  {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isNew ? "Erstellen" : "Speichern"}
                </Button>
              </div>
            </Tabs>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (Array.isArray(value)) {
    if (value.length === 0) return "(leer)";
    return value.join(", ");
  }
  return String(value);
}
