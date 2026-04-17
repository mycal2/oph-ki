"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Search,
  Loader2,
  Check,
  AlertCircle,
  Building2,
  UserPlus,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCheckout } from "@/hooks/use-checkout";
import type { CustomerCatalogItem, ApiResponse, CustomerCatalogPageResponse } from "@/lib/types";

const DEBOUNCE_MS = 400;

interface CheckoutDealerStepProps {
  slug: string;
  /** Whether the tenant has any customer catalog entries at all. */
  hasCustomers: boolean;
}

/**
 * OPH-78: Checkout step 1 — Dealer Identification.
 *
 * Progressive disclosure flow:
 *   Step A: Customer number input (primary)
 *   Step B: Dealer dropdown (fallback when A fails)
 *   Step C: Manual entry (fallback when B also fails)
 *
 * Each fallback is only shown when needed.
 */
export function CheckoutDealerStep({ slug, hasCustomers }: CheckoutDealerStepProps) {
  const {
    selectedCustomer,
    manualDealer,
    identificationMethod,
    isDealerIdentified,
    setCustomerMatch,
    setDropdownSelection,
    setManualDealer,
    clearDealerIdentification,
  } = useCheckout();

  // Which fallback steps are visible
  const [showDropdown, setShowDropdown] = useState(!hasCustomers);
  const [showManualEntry, setShowManualEntry] = useState(!hasCustomers);

  // If there are no customers at all, skip directly to manual entry
  useEffect(() => {
    if (!hasCustomers) {
      setShowDropdown(false);
      setShowManualEntry(true);
    }
  }, [hasCustomers]);

  // Reset flow if dealer identification is cleared
  const handleReset = () => {
    clearDealerIdentification();
    setShowDropdown(false);
    setShowManualEntry(false);
  };

  return (
    <div className="flex flex-col pb-28">
      {/* Progress indicator */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <span className="font-semibold text-primary">1. Händler</span>
          <Separator className="flex-1" />
          <span>2. Lieferung</span>
          <Separator className="flex-1" />
          <span>3. Bestätigung</span>
        </div>
        <h1 className="text-lg font-semibold">Händler identifizieren</h1>
        <p className="text-sm text-muted-foreground">
          Geben Sie die Kundennummer ein oder wählen Sie einen Händler aus.
        </p>
      </div>

      {/* Step A: Customer number search (only if tenant has customers) */}
      {hasCustomers && (
        <CustomerNumberSearch
          onMatch={(customer) => {
            setCustomerMatch(customer);
            setShowDropdown(false);
            setShowManualEntry(false);
          }}
          onNotFound={() => {
            setShowDropdown(true);
          }}
          onClear={() => {
            clearDealerIdentification();
          }}
          isActive={identificationMethod !== "dropdown" && identificationMethod !== "manual"}
        />
      )}

      {/* Step B: Dealer dropdown (shown when Step A fails or no customers) */}
      {showDropdown && hasCustomers && (
        <div className="mt-6">
          <Separator className="mb-6" />
          <DealerDropdown
            onSelect={(customer) => {
              setDropdownSelection(customer);
              setShowManualEntry(false);
            }}
            onNotFound={() => {
              setShowManualEntry(true);
            }}
            isActive={identificationMethod !== "manual"}
          />
        </div>
      )}

      {/* Step C: Manual entry (shown when Step B also fails, or no customers at all) */}
      {showManualEntry && (
        <div className="mt-6">
          <Separator className="mb-6" />
          <ManualDealerEntry
            onSubmit={(info) => {
              setManualDealer(info);
            }}
            initialValues={manualDealer}
          />
        </div>
      )}

      {/* Dealer summary card */}
      {isDealerIdentified && (
        <div className="mt-6">
          <Separator className="mb-6" />
          <DealerSummaryCard
            customer={selectedCustomer}
            manualDealer={manualDealer}
            method={identificationMethod!}
            onReset={handleReset}
          />
        </div>
      )}

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background p-4">
        <div className="mx-auto flex max-w-lg gap-3">
          <Button variant="outline" className="shrink-0" asChild>
            <Link href={`/sf/${slug}/basket`}>
              <ArrowLeft className="h-4 w-4" />
              Zurück
            </Link>
          </Button>
          <Button
            className="flex-1 font-semibold"
            disabled={!isDealerIdentified}
            asChild={isDealerIdentified}
          >
            {isDealerIdentified ? (
              <Link href={`/sf/${slug}/checkout/delivery`}>
                Weiter
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <span>
                Weiter
                <ArrowRight className="h-4 w-4" />
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step A: Customer Number Search
// ---------------------------------------------------------------------------

interface CustomerNumberSearchProps {
  onMatch: (customer: CustomerCatalogItem) => void;
  onNotFound: () => void;
  onClear: () => void;
  isActive: boolean;
}

function CustomerNumberSearch({ onMatch, onNotFound, onClear, isActive }: CustomerNumberSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const searchCustomers = useCallback(async (searchTerm: string) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        search: searchTerm,
        pageSize: "10",
        page: "1",
      });

      const res = await fetch(`/api/customers?${params}`, {
        signal: controller.signal,
      });
      const json: ApiResponse<CustomerCatalogPageResponse> = await res.json();

      if (!json.success) {
        setError(json.error ?? "Fehler bei der Suche.");
        setResults([]);
        return;
      }

      const customers = json.data!.customers;
      setResults(customers);
      setHasSearched(true);

      // If no results, reveal the dropdown fallback
      if (customers.length === 0) {
        onNotFound();
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Netzwerkfehler bei der Suche.");
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [onNotFound]);

  const handleInputChange = (value: string) => {
    setQuery(value);
    setSelectedId(null);
    // BUG-1 fix: clear dealer identification when input changes
    onClear();

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.trim().length === 0) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      searchCustomers(value.trim());
    }, DEBOUNCE_MS);
  };

  const handleSelect = (customer: CustomerCatalogItem) => {
    setSelectedId(customer.id);
    onMatch(customer);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return (
    <div className={isActive ? "" : "opacity-50 pointer-events-none"}>
      <div className="flex items-center gap-2 mb-3">
        <Badge variant="outline" className="text-xs font-semibold">A</Badge>
        <h2 className="text-sm font-semibold">Kundennummer eingeben</h2>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Kundennummer eingeben..."
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          className="pl-9 h-12 text-base"
          aria-label="Kundennummer suchen"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3.5 w-40" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!isLoading && hasSearched && results.length > 0 && (
        <div className="mt-3 space-y-2" role="list" aria-label="Suchergebnisse Kundennummer">
          {results.map((customer) => (
            <button
              key={customer.id}
              role="listitem"
              onClick={() => handleSelect(customer)}
              className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
                selectedId === customer.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : ""
              }`}
              aria-selected={selectedId === customer.id}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-primary tabular-nums">
                  {customer.customer_number}
                </p>
                <p className="text-sm font-medium leading-snug truncate">
                  {customer.company_name}
                </p>
                {customer.city && (
                  <p className="text-xs text-muted-foreground truncate">
                    {[customer.postal_code, customer.city].filter(Boolean).join(" ")}
                  </p>
                )}
              </div>
              {selectedId === customer.id ? (
                <Check className="h-5 w-5 text-primary shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 -rotate-90" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Not found */}
      {!isLoading && hasSearched && results.length === 0 && query.trim().length > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Kundennummer nicht gefunden. Wählen Sie einen Händler aus der Liste.</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step B: Dealer Dropdown
// ---------------------------------------------------------------------------

interface DealerDropdownProps {
  onSelect: (customer: CustomerCatalogItem) => void;
  onNotFound: () => void;
  isActive: boolean;
}

function DealerDropdown({ onSelect, onNotFound, isActive }: DealerDropdownProps) {
  const [allCustomers, setAllCustomers] = useState<CustomerCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const DISPLAY_LIMIT = 10;

  // Load all customers on mount
  useEffect(() => {
    let cancelled = false;

    async function loadCustomers() {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ pageSize: "200", page: "1" });
        const res = await fetch(`/api/customers?${params}`);
        const json: ApiResponse<CustomerCatalogPageResponse> = await res.json();

        if (cancelled) return;

        if (!json.success) {
          setError(json.error ?? "Fehler beim Laden der Händler.");
          return;
        }

        setAllCustomers(json.data!.customers);
      } catch {
        if (!cancelled) {
          setError("Netzwerkfehler beim Laden der Händler.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadCustomers();
    return () => { cancelled = true; };
  }, []);

  // Filter customers by name or number
  const filtered = filterQuery.trim().length > 0
    ? allCustomers.filter((c) => {
        const q = filterQuery.toLowerCase();
        return (
          c.company_name.toLowerCase().includes(q) ||
          c.customer_number.toLowerCase().includes(q)
        );
      })
    : allCustomers;

  const displayed = showAll ? filtered : filtered.slice(0, DISPLAY_LIMIT);
  const hasMore = filtered.length > DISPLAY_LIMIT && !showAll;

  const handleSelect = (customer: CustomerCatalogItem) => {
    setSelectedId(customer.id);
    onSelect(customer);
  };

  return (
    <div className={isActive ? "" : "opacity-50 pointer-events-none"}>
      <div className="flex items-center gap-2 mb-3">
        <Badge variant="outline" className="text-xs font-semibold">B</Badge>
        <h2 className="text-sm font-semibold">Händler aus Liste wählen</h2>
      </div>

      {/* Search/filter */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Händler suchen..."
          value={filterQuery}
          onChange={(e) => {
            setFilterQuery(e.target.value);
            setShowAll(false);
          }}
          className="pl-9"
          aria-label="Händlerliste durchsuchen"
          autoComplete="off"
        />
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3.5 w-40" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Customer list */}
      {!isLoading && displayed.length > 0 && (
        <>
          <div className="space-y-2" role="list" aria-label="Händlerliste">
            {displayed.map((customer) => (
              <button
                key={customer.id}
                role="listitem"
                onClick={() => handleSelect(customer)}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
                  selectedId === customer.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : ""
                }`}
                aria-selected={selectedId === customer.id}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-primary tabular-nums">
                    {customer.customer_number}
                  </p>
                  <p className="text-sm font-medium leading-snug truncate">
                    {customer.company_name}
                  </p>
                  {customer.city && (
                    <p className="text-xs text-muted-foreground truncate">
                      {[customer.postal_code, customer.city].filter(Boolean).join(" ")}
                    </p>
                  )}
                </div>
                {selectedId === customer.id && (
                  <Check className="h-5 w-5 text-primary shrink-0" />
                )}
              </button>
            ))}
          </div>

          {/* Show more */}
          {hasMore && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-muted-foreground"
              onClick={() => setShowAll(true)}
            >
              <ChevronDown className="h-4 w-4" />
              Alle {filtered.length} anzeigen
            </Button>
          )}
        </>
      )}

      {/* Empty filtered results */}
      {!isLoading && filtered.length === 0 && filterQuery.trim().length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Kein Händler gefunden.</span>
        </div>
      )}

      {/* "Not in list" button */}
      {!isLoading && (
        <Button
          variant="outline"
          className="w-full mt-3"
          onClick={onNotFound}
        >
          <UserPlus className="h-4 w-4" />
          Neuer Händler (nicht in der Liste)
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step C: Manual Dealer Entry
// ---------------------------------------------------------------------------

interface ManualDealerEntryProps {
  onSubmit: (info: { companyName: string; contactPerson: string; email: string; phone: string; address: string }) => void;
  initialValues: { companyName: string; contactPerson: string; email: string; phone: string; address: string } | null;
}

function ManualDealerEntry({ onSubmit, initialValues }: ManualDealerEntryProps) {
  const [companyName, setCompanyName] = useState(initialValues?.companyName ?? "");
  const [contactPerson, setContactPerson] = useState(initialValues?.contactPerson ?? "");
  const [email, setEmail] = useState(initialValues?.email ?? "");
  const [phone, setPhone] = useState(initialValues?.phone ?? "");
  const [address, setAddress] = useState(initialValues?.address ?? "");

  const isValid = companyName.trim().length > 0;

  const handleConfirm = () => {
    if (!isValid) return;
    onSubmit({
      companyName: companyName.trim(),
      contactPerson: contactPerson.trim(),
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
    });
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Badge variant="outline" className="text-xs font-semibold">C</Badge>
        <h2 className="text-sm font-semibold">Händler manuell eingeben</h2>
      </div>

      <div className="space-y-4">
        {/* Company name (required) */}
        <div className="space-y-1.5">
          <Label htmlFor="manual-company" className="text-sm">
            Firmenname <span className="text-destructive">*</span>
          </Label>
          <Input
            id="manual-company"
            type="text"
            placeholder="z.B. Henry Schein Dental"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            aria-required="true"
          />
        </div>

        {/* Contact person (optional) */}
        <div className="space-y-1.5">
          <Label htmlFor="manual-contact" className="text-sm">
            Ansprechpartner
          </Label>
          <Input
            id="manual-contact"
            type="text"
            placeholder="Vor- und Nachname"
            value={contactPerson}
            onChange={(e) => setContactPerson(e.target.value)}
          />
        </div>

        {/* Email (optional) */}
        <div className="space-y-1.5">
          <Label htmlFor="manual-email" className="text-sm">
            E-Mail
          </Label>
          <Input
            id="manual-email"
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {/* Phone (optional) */}
        <div className="space-y-1.5">
          <Label htmlFor="manual-phone" className="text-sm">
            Telefon
          </Label>
          <Input
            id="manual-phone"
            type="tel"
            placeholder="+49 ..."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        {/* Address (optional) */}
        <div className="space-y-1.5">
          <Label htmlFor="manual-address" className="text-sm">
            Adresse
          </Label>
          <Input
            id="manual-address"
            type="text"
            placeholder="Straße, PLZ, Ort"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        <Button
          onClick={handleConfirm}
          disabled={!isValid}
          className="w-full font-semibold"
        >
          <Building2 className="h-4 w-4" />
          Händler übernehmen
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dealer Summary Card
// ---------------------------------------------------------------------------

interface DealerSummaryCardProps {
  customer: CustomerCatalogItem | null;
  manualDealer: { companyName: string; contactPerson: string; email: string; phone: string; address: string } | null;
  method: "customer_number" | "dropdown" | "manual";
  onReset: () => void;
}

function DealerSummaryCard({ customer, manualDealer, method, onReset }: DealerSummaryCardProps) {
  const methodLabels: Record<string, string> = {
    customer_number: "Kundennummer",
    dropdown: "Aus Liste",
    manual: "Manuell",
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Check className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs font-semibold text-primary">
                Händler identifiziert
              </span>
              <Badge variant="secondary" className="text-[10px]">
                {methodLabels[method]}
              </Badge>
            </div>

            {customer && (
              <>
                <p className="text-sm font-semibold">{customer.company_name}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  Nr. {customer.customer_number}
                </p>
                {customer.city && (
                  <p className="text-xs text-muted-foreground">
                    {[customer.street, customer.postal_code, customer.city]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
                {customer.email && (
                  <p className="text-xs text-muted-foreground">{customer.email}</p>
                )}
              </>
            )}

            {manualDealer && (
              <>
                <p className="text-sm font-semibold">{manualDealer.companyName}</p>
                {manualDealer.contactPerson && (
                  <p className="text-xs text-muted-foreground">
                    {manualDealer.contactPerson}
                  </p>
                )}
                {manualDealer.email && (
                  <p className="text-xs text-muted-foreground">{manualDealer.email}</p>
                )}
                {manualDealer.phone && (
                  <p className="text-xs text-muted-foreground">{manualDealer.phone}</p>
                )}
                {manualDealer.address && (
                  <p className="text-xs text-muted-foreground">{manualDealer.address}</p>
                )}
              </>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="shrink-0 text-xs text-muted-foreground"
          >
            Ändern
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
