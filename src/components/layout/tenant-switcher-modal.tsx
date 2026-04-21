"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { Search, Check, Building2, ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { usePlatformTenantContext } from "@/hooks/use-platform-tenant-context";
import type { TenantAdminListItem, ApiResponse } from "@/lib/types";
import type { PlatformTenantContextValue } from "@/context/platform-tenant-context";

interface TenantSwitcherModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ModalStep = "selection" | "confirmation";

/**
 * OPH-92: Modal for platform admins to select a tenant context.
 *
 * Step 1: Search + select a tenant from the list.
 * Step 2: Confirm the switch before applying.
 */
export function TenantSwitcherModal({ open, onOpenChange }: TenantSwitcherModalProps) {
  const { activeTenant, setActiveTenant } = usePlatformTenantContext();

  const [tenants, setTenants] = useState<TenantAdminListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<PlatformTenantContextValue | null>(null);
  const [step, setStep] = useState<ModalStep>("selection");

  // Fetch tenants fresh each time the modal opens
  useEffect(() => {
    if (!open) return;

    async function fetchTenants() {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/admin/tenants");
        const json = (await res.json()) as ApiResponse<TenantAdminListItem[]>;

        if (!res.ok || !json.success || !json.data) {
          setError(json.error ?? "Mandanten konnten nicht geladen werden.");
          setTenants([]);
          return;
        }

        setTenants(json.data);
      } catch {
        setError("Verbindungsfehler beim Laden der Mandanten.");
        setTenants([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchTenants();
    // Reset state when modal opens
    setSearchQuery("");
    setSelectedTenant(null);
    setStep("selection");
  }, [open]);

  // Filter tenants by search query (case-insensitive)
  const filteredTenants = useMemo(() => {
    if (!searchQuery.trim()) return tenants;
    const query = searchQuery.toLowerCase();
    return tenants.filter((t) => t.name.toLowerCase().includes(query));
  }, [tenants, searchQuery]);

  const isSelectedDifferentFromActive =
    selectedTenant && selectedTenant.tenantId !== activeTenant?.tenantId;

  function handleTenantClick(tenant: TenantAdminListItem) {
    setSelectedTenant({
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantLogoUrl: tenant.logo_url ?? null,
    });
  }

  function handleSwitchClick() {
    if (!isSelectedDifferentFromActive) return;
    setStep("confirmation");
  }

  function handleConfirm() {
    if (!selectedTenant) return;
    setActiveTenant(selectedTenant);
    onOpenChange(false);
  }

  function handleBack() {
    setStep("selection");
  }

  function handleCancel() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "confirmation" ? "Mandant wechseln" : "Mandant auswaehlen"}
          </DialogTitle>
          <DialogDescription>
            {step === "confirmation"
              ? "Bitte bestaetigen Sie den Wechsel."
              : "Waehlen Sie den Mandanten, dessen Stammdaten Sie einsehen moechten."}
          </DialogDescription>
        </DialogHeader>

        {step === "selection" && (
          <div className="space-y-4">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Mandant suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                aria-label="Mandant suchen"
              />
            </div>

            {/* Tenant list */}
            <ScrollArea className="h-[320px] rounded-md border">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded" />
                      <Skeleton className="h-4 flex-1" />
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="flex items-center justify-center p-8">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              ) : filteredTenants.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
                  <Building2 className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">
                    {tenants.length === 0
                      ? "Keine Mandanten gefunden."
                      : "Kein Mandant gefunden."}
                  </p>
                </div>
              ) : (
                <div className="p-1">
                  {filteredTenants.map((tenant) => {
                    const isActive = activeTenant?.tenantId === tenant.id;
                    const isSelected = selectedTenant?.tenantId === tenant.id;

                    return (
                      <button
                        key={tenant.id}
                        type="button"
                        onClick={() => handleTenantClick(tenant)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors
                          ${isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/60"}
                          ${isActive && !isSelected ? "bg-muted/40" : ""}
                        `}
                        aria-label={`${tenant.name}${isActive ? " (aktuell)" : ""}`}
                        aria-pressed={isSelected}
                      >
                        {/* Tenant logo or placeholder */}
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0">
                          {tenant.logo_url ? (
                            <Image
                              src={tenant.logo_url}
                              alt=""
                              width={32}
                              height={32}
                              className="h-8 w-8 object-contain"
                              unoptimized
                              onError={(e) => {
                                // Replace broken image with initials
                                const target = e.currentTarget;
                                target.style.display = "none";
                                const parent = target.parentElement;
                                if (parent) {
                                  const span = document.createElement("span");
                                  span.className = "text-xs font-medium text-muted-foreground";
                                  span.textContent = tenant.name
                                    .split(" ")
                                    .map((w) => w[0])
                                    .join("")
                                    .slice(0, 2)
                                    .toUpperCase();
                                  parent.appendChild(span);
                                }
                              }}
                            />
                          ) : (
                            <span className="text-xs font-medium text-muted-foreground">
                              {tenant.name
                                .split(" ")
                                .map((w) => w[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                          )}
                        </div>

                        {/* Tenant name */}
                        <span className="flex-1 text-sm font-medium truncate">
                          {tenant.name}
                        </span>

                        {/* Active checkmark */}
                        {isActive && (
                          <Check className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            <Separator />

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCancel}>
                Abbrechen
              </Button>
              <Button
                onClick={handleSwitchClick}
                disabled={!isSelectedDifferentFromActive}
              >
                Mandant wechseln
              </Button>
            </div>
          </div>
        )}

        {step === "confirmation" && selectedTenant && (
          <div className="space-y-6">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm text-center">
                Moechten Sie wirklich zu{" "}
                <span className="font-semibold">{selectedTenant.tenantName}</span>{" "}
                wechseln?
              </p>
              <p className="text-xs text-muted-foreground text-center mt-1">
                Stammdaten-Seiten zeigen dann Daten dieses Mandanten an.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Zurueck
              </Button>
              <Button onClick={handleConfirm}>
                Bestaetigen
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
