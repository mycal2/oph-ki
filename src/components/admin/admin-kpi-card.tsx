"use client";

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminKpiCardProps {
  label: string;
  value: number | string;
  icon: ReactNode;
  isLoading?: boolean;
  /** Optional note displayed below the value. */
  note?: string;
}

/**
 * Formats a number with German-style thousands separator (dot).
 */
function formatNumber(value: number | string): string {
  if (typeof value === "string") return value;
  return value.toLocaleString("de-DE");
}

export function AdminKpiCard({ label, value, icon, isLoading, note }: AdminKpiCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-3xl font-bold tracking-tight">{formatNumber(value)}</p>
            )}
            {note && !isLoading && (
              <p className="text-xs text-muted-foreground">{note}</p>
            )}
          </div>
          <div className="rounded-md bg-primary/10 p-2.5 text-primary">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
