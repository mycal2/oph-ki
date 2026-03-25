"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminRevenueCardProps {
  label: string;
  total: number;
  transactionTurnover: number;
  monthlyFeeTurnover: number;
  isLoading?: boolean;
}

/**
 * Formats a number as EUR currency with German locale.
 */
function formatEuro(value: number): string {
  return value.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function AdminRevenueCard({
  label,
  total,
  transactionTurnover,
  monthlyFeeTurnover,
  isLoading,
}: AdminRevenueCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : (
            <>
              <p className="text-3xl font-bold tracking-tight">{formatEuro(total)}</p>
              <p className="text-sm text-muted-foreground">
                davon Transaktionen: {formatEuro(transactionTurnover)} | Grundgebühren:{" "}
                {formatEuro(monthlyFeeTurnover)}
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
