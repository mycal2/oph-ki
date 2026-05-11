"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OrderStatus, OrdersFilterState } from "@/lib/types";

const DEBOUNCE_MS = 400;

type FilterTabKey =
  | "tabAll"
  | "tabUploaded"
  | "tabProcessing"
  | "tabExtracted"
  | "tabReview"
  | "tabClarification"
  | "tabChecked"
  | "tabApproved"
  | "tabExported"
  | "tabError";

const STATUS_TABS: Array<{ value: OrderStatus | "all"; labelKey: FilterTabKey }> = [
  { value: "all", labelKey: "tabAll" },
  { value: "uploaded", labelKey: "tabUploaded" },
  { value: "processing", labelKey: "tabProcessing" },
  { value: "extracted", labelKey: "tabExtracted" },
  { value: "review", labelKey: "tabReview" },
  { value: "clarification", labelKey: "tabClarification" },
  { value: "checked", labelKey: "tabChecked" },
  { value: "approved", labelKey: "tabApproved" },
  { value: "exported", labelKey: "tabExported" },
  { value: "error", labelKey: "tabError" },
];

interface OrdersFilterBarProps {
  filters: OrdersFilterState;
  onFiltersChange: (filters: OrdersFilterState) => void;
}

export function OrdersFilterBar({
  filters,
  onFiltersChange,
}: OrdersFilterBarProps) {
  const t = useTranslations("orders.list.filters");
  const [searchInput, setSearchInput] = useState(filters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external filter changes
  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onFiltersChange({ ...filters, search: value, page: 1 });
      }, DEBOUNCE_MS);
    },
    [filters, onFiltersChange]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleStatusChange = useCallback(
    (value: string) => {
      onFiltersChange({
        ...filters,
        status: value as OrderStatus | "all",
        page: 1,
      });
    },
    [filters, onFiltersChange]
  );

  const handleDateFromChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFiltersChange({ ...filters, dateFrom: e.target.value, page: 1 });
    },
    [filters, onFiltersChange]
  );

  const handleDateToChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFiltersChange({ ...filters, dateTo: e.target.value, page: 1 });
    },
    [filters, onFiltersChange]
  );

  const hasActiveFilters =
    filters.status !== "all" ||
    filters.search !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  const handleClearFilters = useCallback(() => {
    setSearchInput("");
    onFiltersChange({
      status: "all",
      search: "",
      dateFrom: "",
      dateTo: "",
      page: 1,
    });
  }, [onFiltersChange]);

  return (
    <div className="space-y-3">
      {/* Status tabs */}
      <Tabs value={filters.status} onValueChange={handleStatusChange}>
        <TabsList className="flex-wrap h-auto gap-1">
          {STATUS_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="text-xs"
            >
              {t(tab.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Search + date range row */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-9 pr-8"
            aria-label={t("searchAriaLabel")}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => handleSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={t("clearSearchAriaLabel")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={handleDateFromChange}
            className="w-[140px]"
            aria-label={t("dateFromAriaLabel")}
          />
          <span className="text-sm text-muted-foreground">{t("dateSeparator")}</span>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={handleDateToChange}
            className="w-[140px]"
            aria-label={t("dateToAriaLabel")}
          />
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="shrink-0"
          >
            <X className="h-4 w-4" />
            {t("clearFilters")}
          </Button>
        )}
      </div>
    </div>
  );
}
