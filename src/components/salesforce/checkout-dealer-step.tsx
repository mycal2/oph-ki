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
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCheckout } from "@/hooks/use-checkout";
import { useSfBasePath } from "@/hooks/use-sf-base-path";
import type { CustomerCatalogItem, ApiResponse, CustomerCatalogPageResponse } from "@/lib/types";

const DEBOUNCE_MS = 300;
const MIN_SEARCH_LENGTH = 2;
const PAGE_SIZE = 20;

interface CheckoutDealerStepProps {
  slug: string;
  hasCustomers: boolean;
}

export function CheckoutDealerStep({ slug, hasCustomers }: CheckoutDealerStepProps) {
  const t = useTranslations("salesforce.checkout.dealer");
  const tCheckout = useTranslations("salesforce.checkout");
  const {
    selectedCustomer,
    manualDealer,
    identificationMethod,
    isDealerIdentified,
    setCustomerMatch,
    setManualDealer,
    clearDealerIdentification,
  } = useCheckout();
  const basePath = useSfBasePath(slug);

  const [showManualEntry, setShowManualEntry] = useState(!hasCustomers);

  const handleReset = () => {
    clearDealerIdentification();
    setShowManualEntry(!hasCustomers);
  };

  return (
    <div className="flex flex-col pb-28">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <span className="font-semibold text-primary">{tCheckout("stepCustomer")}</span>
          <Separator className="flex-1" />
          <span>{tCheckout("stepDelivery")}</span>
          <Separator className="flex-1" />
          <span>{tCheckout("stepConfirm")}</span>
        </div>
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {hasCustomers ? t("subtitleWithCustomers") : t("subtitleNoCustomers")}
        </p>
      </div>

      {hasCustomers && !isDealerIdentified && (
        <DealerSearch
          onSelect={(customer) => {
            setCustomerMatch(customer);
            setShowManualEntry(false);
          }}
          onNotFound={() => setShowManualEntry(true)}
        />
      )}

      {isDealerIdentified && (
        <DealerSummaryCard
          customer={selectedCustomer}
          manualDealer={manualDealer}
          method={identificationMethod!}
          onReset={handleReset}
        />
      )}

      {showManualEntry && !isDealerIdentified && (
        <div className={hasCustomers ? "mt-6" : ""}>
          {hasCustomers && <Separator className="mb-6" />}
          <ManualDealerEntry
            onSubmit={(info) => setManualDealer(info)}
            initialValues={manualDealer}
          />
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background p-4">
        <div className="mx-auto flex max-w-lg gap-3">
          <Button variant="outline" className="shrink-0" asChild>
            <Link href={`${basePath}/basket`}>
              <ArrowLeft className="h-4 w-4" />
              {tCheckout("back")}
            </Link>
          </Button>
          <Button
            className="flex-1 font-semibold"
            disabled={!isDealerIdentified}
            asChild={isDealerIdentified}
          >
            {isDealerIdentified ? (
              <Link href={`${basePath}/checkout/delivery`}>
                {tCheckout("next")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <span>
                {tCheckout("next")}
                <ArrowRight className="h-4 w-4" />
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface DealerSearchProps {
  onSelect: (customer: CustomerCatalogItem) => void;
  onNotFound: () => void;
}

function DealerSearch({ onSelect, onNotFound }: DealerSearchProps) {
  const t = useTranslations("salesforce.checkout.dealer");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<CustomerCatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < MIN_SEARCH_LENGTH) {
      setDebouncedQuery("");
      setResults([]);
      setTotal(0);
      setHasSearched(false);
      setPage(1);
      setSelectedId(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, DEBOUNCE_MS);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const fetchResults = useCallback(async (searchTerm: string, pageNum: number, append: boolean) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams({
        search: searchTerm,
        pageSize: String(PAGE_SIZE),
        page: String(pageNum),
      });

      const res = await fetch(`/api/customers?${params}`, { signal: controller.signal });
      const json: ApiResponse<CustomerCatalogPageResponse> = await res.json();

      if (!json.success) {
        setError(json.error ?? t("searchError"));
        return;
      }

      const customers = json.data!.customers;
      setResults((prev) => append ? [...prev, ...customers] : customers);
      setTotal(json.data!.total);
      setHasSearched(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(t("networkError"));
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [t]);

  useEffect(() => {
    if (debouncedQuery.length >= MIN_SEARCH_LENGTH) {
      fetchResults(debouncedQuery, 1, false);
    }
  }, [debouncedQuery, fetchResults]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchResults(debouncedQuery, nextPage, true);
  };

  const handleSelect = (customer: CustomerCatalogItem) => {
    setSelectedId(customer.id);
    onSelect(customer);
  };

  const hasMore = results.length < total;

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder={t("searchPlaceholder")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedId(null);
          }}
          className="pl-9 h-12 text-base"
          aria-label={t("searchAriaLabel")}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {query.length > 0 && query.length < MIN_SEARCH_LENGTH && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("minLengthHint", { min: MIN_SEARCH_LENGTH })}
        </p>
      )}

      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3.5 w-40" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && hasSearched && results.length > 0 && (
        <div className="mt-3 space-y-2" role="list" aria-label={t("resultsAriaLabel")}>
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
              {selectedId === customer.id && (
                <Check className="h-5 w-5 text-primary shrink-0" />
              )}
            </button>
          ))}

          {hasMore && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-1 text-muted-foreground"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("loadMoreCount", { loaded: results.length, total })
              )}
            </Button>
          )}
        </div>
      )}

      {!isLoading && hasSearched && results.length === 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{t("noResults")}</span>
        </div>
      )}

      {hasSearched && (
        <Button
          variant="outline"
          className="w-full mt-3"
          onClick={onNotFound}
        >
          <UserPlus className="h-4 w-4" />
          {t("manualEntry")}
        </Button>
      )}
    </div>
  );
}

interface ManualDealerEntryProps {
  onSubmit: (info: { companyName: string; contactPerson: string; email: string; phone: string; address: string }) => void;
  initialValues: { companyName: string; contactPerson: string; email: string; phone: string; address: string } | null;
}

function ManualDealerEntry({ onSubmit, initialValues }: ManualDealerEntryProps) {
  const t = useTranslations("salesforce.checkout.dealer");
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
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{t("manualHeading")}</h2>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="manual-company" className="text-sm">
            {t("companyNameLabel")} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="manual-company"
            type="text"
            placeholder={t("companyNamePlaceholder")}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            aria-required="true"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="manual-contact" className="text-sm">{t("contactPersonLabel")}</Label>
          <Input
            id="manual-contact"
            type="text"
            placeholder={t("contactPersonPlaceholder")}
            value={contactPerson}
            onChange={(e) => setContactPerson(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="manual-email" className="text-sm">{t("emailLabel")}</Label>
          <Input
            id="manual-email"
            type="email"
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="manual-phone" className="text-sm">{t("phoneLabel")}</Label>
          <Input
            id="manual-phone"
            type="tel"
            placeholder={t("phonePlaceholder")}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="manual-address" className="text-sm">{t("addressLabel")}</Label>
          <Input
            id="manual-address"
            type="text"
            placeholder={t("addressPlaceholder")}
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
          {t("submit")}
        </Button>
      </div>
    </div>
  );
}

interface DealerSummaryCardProps {
  customer: CustomerCatalogItem | null;
  manualDealer: { companyName: string; contactPerson: string; email: string; phone: string; address: string } | null;
  method: "customer_number" | "dropdown" | "manual";
  onReset: () => void;
}

function DealerSummaryCard({ customer, manualDealer, method, onReset }: DealerSummaryCardProps) {
  const t = useTranslations("salesforce.checkout.dealer");
  const methodLabel = method === "manual" ? t("methodManual") : t("methodFromCatalog");

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Check className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs font-semibold text-primary">
                {t("summarySelected")}
              </span>
              <Badge variant="secondary" className="text-[10px]">
                {methodLabel}
              </Badge>
            </div>

            {customer && (
              <>
                <p className="text-sm font-semibold">{customer.company_name}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {t("customerNumberPrefix", { number: customer.customer_number })}
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
                  <p className="text-xs text-muted-foreground">{manualDealer.contactPerson}</p>
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
            {t("change")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
