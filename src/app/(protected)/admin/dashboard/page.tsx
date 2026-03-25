"use client";

import { useState } from "react";
import Link from "next/link";
import { ShoppingCart, Building2, Store, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import { useAdminDashboardStats } from "@/hooks/use-admin-dashboard-stats";
import { PeriodSelector } from "@/components/admin/period-selector";
import { AdminKpiCard } from "@/components/admin/admin-kpi-card";
import { AdminRevenueCard } from "@/components/admin/admin-revenue-card";
import { OrderLineHistogram } from "@/components/admin/order-line-histogram";
import type { Period } from "@/components/admin/period-selector";
import type { LineDistribution } from "@/lib/types";

const emptyLineDistribution: LineDistribution = {
  "1": 0,
  "2": 0,
  "3-5": 0,
  "6-10": 0,
  "11+": 0,
};

const periodLabels: Record<Period, string> = {
  current_month: "Aktueller Monat",
  last_month: "Letzter Monat",
  current_quarter: "Aktuelles Quartal",
  last_quarter: "Letztes Quartal",
};

export default function AdminDashboardPage() {
  const { isPlatformAdminOrViewer, isLoading: isLoadingRole } = useCurrentUserRole();
  const [period, setPeriod] = useState<Period>("current_month");
  const { stats, isLoading, error, refetch } = useAdminDashboardStats(period);

  // Loading role check
  if (isLoadingRole) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-96" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  // Access denied
  if (!isPlatformAdminOrViewer) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Zugriff verweigert. Nur für Platform-Administratoren und -Betrachter.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plattform-Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Plattformweite KPIs und Umsatz auf einen Blick.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/reports">
            Detaillierter Bericht
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Period Selector */}
      <PeriodSelector value={period} onChange={setPeriod} disabled={isLoading} />

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}{" "}
            <Button variant="link" className="h-auto p-0" onClick={refetch}>
              Erneut versuchen
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Activity KPI Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminKpiCard
          label="Anzahl Bestellungen"
          value={stats?.orderCount ?? 0}
          icon={<ShoppingCart className="h-5 w-5" />}
          isLoading={isLoading}
        />
        <AdminKpiCard
          label="Aktive Mandanten"
          value={stats?.activeTenantCount ?? 0}
          icon={<Building2 className="h-5 w-5" />}
          isLoading={isLoading}
          note="Immer aktueller Stand"
        />
        <AdminKpiCard
          label="Erkannte Händler"
          value={stats?.dealerCount ?? 0}
          icon={<Store className="h-5 w-5" />}
          isLoading={isLoading}
        />
        <OrderLineHistogram
          data={stats?.lineDistribution ?? emptyLineDistribution}
          isLoading={isLoading}
        />
      </div>

      {/* Revenue KPI */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <AdminRevenueCard
          label={`Umsatz — ${periodLabels[period]}`}
          total={stats?.revenue.total ?? 0}
          transactionTurnover={stats?.revenue.transactionTurnover ?? 0}
          monthlyFeeTurnover={stats?.revenue.monthlyFeeTurnover ?? 0}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
