"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OrderStatus, OrdersFilterState } from "@/lib/types";

const DEBOUNCE_MS = 400;

const STATUS_TABS: Array<{ value: OrderStatus | "all"; label: string }> = [
  { value: "all", label: "Alle" },
  { value: "uploaded", label: "Neu" },
  { value: "processing", label: "Verarbeitung" },
  { value: "extracted", label: "Extrahiert" },
  { value: "review", label: "In Prüfung" },
  { value: "checked", label: "Geprüft" },
  { value: "approved", label: "Freigegeben" },
  { value: "exported", label: "Exportiert" },
  { value: "error", label: "Fehler" },
];

interface OrdersFilterBarProps {
  filters: OrdersFilterState;
  onFiltersChange: (filters: OrdersFilterState) => void;
}

export function OrdersFilterBar({
  filters,
  onFiltersChange,
}: OrdersFilterBarProps) {
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
              {tab.label}
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
            placeholder="Händler oder Bestellnummer suchen..."
            className="pl-9 pr-8"
            aria-label="Bestellungen durchsuchen"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => handleSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Suche löschen"
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
            aria-label="Datum von"
          />
          <span className="text-sm text-muted-foreground">bis</span>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={handleDateToChange}
            className="w-[140px]"
            aria-label="Datum bis"
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
            Filter zurücksetzen
          </Button>
        )}
      </div>
    </div>
  );
}
