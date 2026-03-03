"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Package,
  CalendarDays,
  CalendarRange,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiResponse, OrderDashboardStats } from "@/lib/types";

const STATS_POLL_INTERVAL_MS = 30_000;

interface StatTileProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  variant?: "default" | "warning";
}

function StatTile({ label, value, icon, variant = "default" }: StatTileProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={`shrink-0 rounded-md p-2 ${
            variant === "warning"
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {label}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatTileSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Skeleton className="h-10 w-10 rounded-md shrink-0" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-3 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardStats() {
  const [stats, setStats] = useState<OrderDashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch("/api/orders/stats");
      const json = (await res.json()) as ApiResponse<OrderDashboardStats>;
      if (res.ok && json.success && json.data) {
        setStats(json.data);
      }
    } catch {
      // Silently ignore stats fetch errors — not critical
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // 30s polling
  useEffect(() => {
    pollRef.current = setInterval(() => fetchStats(true), STATS_POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [fetchStats]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const iconClass = "h-5 w-5";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <StatTile
        label="Heute"
        value={String(stats.today)}
        icon={<Package className={iconClass} />}
      />
      <StatTile
        label="Diese Woche"
        value={String(stats.thisWeek)}
        icon={<CalendarDays className={iconClass} />}
      />
      <StatTile
        label="Dieser Monat"
        value={String(stats.thisMonth)}
        icon={<CalendarRange className={iconClass} />}
      />
      <StatTile
        label="Offene Bestellungen"
        value={String(stats.openOrders)}
        icon={<Clock className={iconClass} />}
        variant={stats.openOrders > 0 ? "warning" : "default"}
      />
      <StatTile
        label="Fehlerrate (7 Tage)"
        value={`${stats.errorRate7Days.toFixed(1)}%`}
        icon={<AlertTriangle className={iconClass} />}
        variant={stats.errorRate7Days > 10 ? "warning" : "default"}
      />
    </div>
  );
}
