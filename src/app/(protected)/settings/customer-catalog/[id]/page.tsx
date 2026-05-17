"use client";

import { use, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import { CustomerProfileTab } from "@/components/customer-catalog/customer-profile-tab";
import { CustomerDiscountsTab } from "@/components/customer-catalog/customer-discounts-tab";
import { CustomerDeleteDialog } from "@/components/customer-catalog/customer-delete-dialog";
import type { CustomerCatalogItem, ApiResponse } from "@/lib/types";

const VALID_TABS = ["profile", "rabatte"] as const;
type TabValue = (typeof VALID_TABS)[number];

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * OPH-106: Customer Detail Page — replaces the dialog-based edit flow.
 *
 * Path: /settings/customer-catalog/[id]
 *
 * Tabs:
 *  - Profil  (always visible)
 *  - Rabatte (only when tenant.price_lookup_enabled === true)
 */
export default function CustomerDetailPage({ params }: PageProps) {
  const { id: customerId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const { isLoading: isLoadingRole, role } = useCurrentUserRole();

  const [customer, setCustomer] = useState<CustomerCatalogItem | null>(null);
  const [isLoadingCustomer, setIsLoadingCustomer] = useState(true);
  const [customerError, setCustomerError] = useState<string | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Resolve active tab from URL (?tab=rabatte). Defaults to profile.
  const tabParam = searchParams.get("tab");
  const activeTab: TabValue =
    tabParam && VALID_TABS.includes(tabParam as TabValue)
      ? (tabParam as TabValue)
      : "profile";

  // Load the customer.
  const loadCustomer = useCallback(async () => {
    setIsLoadingCustomer(true);
    setCustomerError(null);
    try {
      const res = await fetch(`/api/customers/${customerId}`);
      const json = (await res.json()) as ApiResponse<CustomerCatalogItem>;
      if (res.status === 404) {
        setCustomerError("not_found");
        return;
      }
      if (!res.ok || !json.success || !json.data) {
        setCustomerError(json.error ?? "Fehler beim Laden des Kunden.");
        return;
      }
      setCustomer(json.data);
    } catch {
      setCustomerError("Netzwerkfehler beim Laden des Kunden.");
    } finally {
      setIsLoadingCustomer(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadCustomer();
  }, [loadCustomer]);

  // OPH-106: Resolved from the customer's tenant (populated by GET /api/customers/[id])
  // so platform admins viewing another tenant's customer also get the right flag.
  const priceLookupEnabled = customer?.tenant_price_lookup_enabled ?? false;

  // Update browser tab title.
  useEffect(() => {
    if (customer) {
      document.title = `${customer.company_name} – Kundenstamm`;
    }
    return () => {
      document.title = "Order-Process Hub (OPH)";
    };
  }, [customer]);

  // Tab change handler -- update URL.
  const handleTabChange = (value: string) => {
    const url = new URL(window.location.href);
    if (value === "profile") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", value);
    }
    router.replace(url.pathname + url.search);
  };

  // If user lands on ?tab=rabatte but the flag is disabled, silently redirect to profile.
  useEffect(() => {
    if (customer && !priceLookupEnabled && activeTab === "rabatte") {
      const url = new URL(window.location.href);
      url.searchParams.delete("tab");
      router.replace(url.pathname + url.search);
    }
  }, [activeTab, customer, priceLookupEnabled, router]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!customer) return { ok: false, error: "Kein Kunde geladen." };
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok || !json.success) {
        return { ok: false, error: json.error ?? "Fehler beim Loeschen." };
      }
      toast.success("Kunde wurde geloescht.");
      router.push("/settings/customer-catalog");
      return { ok: true };
    } catch {
      return { ok: false, error: "Netzwerkfehler beim Loeschen." };
    }
  }, [customer, router]);

  // Loading
  if (isLoadingRole || isLoadingCustomer) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Role gate. Same rules as the list page: tenant_user is read-only; platform_admin
  // is supported (for direct deep-link), all others blocked.
  if (
    role !== "tenant_admin" &&
    role !== "platform_admin" &&
    role !== "tenant_user"
  ) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Zugriff verweigert. Nur fuer Administratoren.
        </p>
      </div>
    );
  }

  const readOnly = role === "tenant_user";

  // Not found.
  if (customerError === "not_found") {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/settings/customer-catalog")}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Kundenstamm
        </Button>
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-muted-foreground">Kunde nicht gefunden.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => router.push("/settings/customer-catalog")}
          >
            Zurueck zur Uebersicht
          </Button>
        </div>
      </div>
    );
  }

  // Other error.
  if (customerError) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/settings/customer-catalog")}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Kundenstamm
        </Button>
        <Alert variant="destructive">
          <AlertDescription>
            {customerError}{" "}
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={loadCustomer}
            >
              Erneut versuchen
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!customer) return null;

  const showRabatteTab = priceLookupEnabled === true;

  return (
    <div className="space-y-6">
      {/* Header: back + title + actions */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/settings/customer-catalog")}
            aria-label="Zurueck zum Kundenstamm"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {customer.company_name}
              </h1>
              <Badge variant="outline" className="font-mono text-xs">
                {customer.customer_number}
              </Badge>
              {customer.dealer_id && (
                <Badge variant="secondary" className="text-xs">
                  Haendler
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {[customer.city, customer.country].filter(Boolean).join(", ") ||
                "Keine Anschrift hinterlegt"}
            </p>
          </div>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
              className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Loeschen
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="profile">Profil</TabsTrigger>
          {showRabatteTab && (
            <TabsTrigger value="rabatte">Rabatte</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <CustomerProfileTab
            customer={customer}
            onSaved={setCustomer}
            readOnly={readOnly}
          />
        </TabsContent>

        {showRabatteTab && (
          <TabsContent value="rabatte" className="mt-6">
            <CustomerDiscountsTab customerId={customer.id} readOnly={readOnly} />
          </TabsContent>
        )}
      </Tabs>

      {/* Delete confirmation */}
      <CustomerDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        customerNumber={customer.customer_number}
        companyName={customer.company_name}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
