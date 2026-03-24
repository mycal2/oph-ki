"use client";

import { useState, useEffect, useCallback } from "react";
import type { AdminDashboardStats } from "@/lib/types";
import type { Period } from "@/components/admin/period-selector";

interface UseAdminDashboardStatsReturn {
  stats: AdminDashboardStats | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAdminDashboardStats(period: Period): UseAdminDashboardStatsReturn {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/stats?period=${period}`);

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }

      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error ?? "Unbekannter Fehler");
      }

      setStats(json.data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Dashboard-Daten konnten nicht geladen werden.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, isLoading, error, refetch: fetchStats };
}
