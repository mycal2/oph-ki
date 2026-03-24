"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { LineDistribution } from "@/lib/types";

interface OrderLineHistogramProps {
  data: LineDistribution;
  isLoading?: boolean;
}

const bucketLabels: { key: keyof LineDistribution; label: string }[] = [
  { key: "1", label: "1" },
  { key: "2", label: "2" },
  { key: "3-5", label: "3-5" },
  { key: "6-10", label: "6-10" },
  { key: "11+", label: "11+" },
];

export function OrderLineHistogram({ data, isLoading }: OrderLineHistogramProps) {
  const maxValue = Math.max(...Object.values(data), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Verteilung Bestellpositionen
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-end gap-3 h-32">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <Skeleton className="w-full" style={{ height: `${20 + Math.random() * 60}%` }} />
                <Skeleton className="h-3 w-8" />
              </div>
            ))}
          </div>
        ) : (
          <TooltipProvider>
            <div
              className="flex items-end gap-3 h-32"
              role="img"
              aria-label="Histogramm der Bestellpositionen"
            >
              {bucketLabels.map(({ key, label }) => {
                const count = data[key];
                const heightPercent = maxValue > 0 ? (count / maxValue) * 100 : 0;

                return (
                  <Tooltip key={key}>
                    <TooltipTrigger asChild>
                      <div className="flex-1 flex flex-col items-center gap-1 cursor-default">
                        <span className="text-xs font-medium text-muted-foreground">
                          {count > 0 ? count.toLocaleString("de-DE") : ""}
                        </span>
                        <div
                          className="w-full rounded-t-sm bg-primary/80 transition-all duration-300 min-h-[2px]"
                          style={{ height: `${Math.max(heightPercent, 2)}%` }}
                        />
                        <span className="text-xs text-muted-foreground">{label}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {label} {label === "1" ? "Position" : "Positionen"}:{" "}
                        {count.toLocaleString("de-DE")} Bestellungen
                      </p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
