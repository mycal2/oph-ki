"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminRevenueCardProps {
  label: string;
  total: number;
  transactionTurnover: number;
  monthlyFeeTurnover: number;
  isLoading?: boolean;
  /** Optional "Stand: TT.MM.YYYY" label for current-month card. */
  asOfLabel?: string;
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
  asOfLabel,
}: AdminRevenueCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
              nicht periodengefiltert
            </Badge>
          </div>

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
              {asOfLabel && (
                <p className="text-xs text-muted-foreground">{asOfLabel}</p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
