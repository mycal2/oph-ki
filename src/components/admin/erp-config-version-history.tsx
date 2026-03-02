"use client";

import { History, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ErpConfigVersion } from "@/lib/types";
import { sortVersionsDesc } from "@/hooks/use-erp-configs";

interface ErpConfigVersionHistoryProps {
  versions: ErpConfigVersion[];
  onRollback: (versionId: string) => Promise<boolean>;
  isMutating: boolean;
}

export function ErpConfigVersionHistory({
  versions,
  onRollback,
  isMutating,
}: ErpConfigVersionHistoryProps) {
  const sorted = sortVersionsDesc(versions);

  if (sorted.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Versionshistorie
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Noch keine Versionen vorhanden. Speichern Sie die Konfiguration, um die erste Version zu erstellen.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          Versionshistorie ({sorted.length} Versionen)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-2">
            {sorted.map((version, index) => (
              <div
                key={version.id}
                className="flex items-start justify-between rounded-lg border p-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={index === 0 ? "default" : "secondary"}
                      className="text-xs"
                    >
                      v{version.version_number}
                    </Badge>
                    {index === 0 && (
                      <Badge variant="outline" className="text-xs bg-green-100 text-green-800">
                        Aktuell
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(version.created_at).toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {version.created_by_email && (
                      <span className="ml-2">{version.created_by_email}</span>
                    )}
                  </p>
                  {version.comment && (
                    <p className="text-xs text-foreground">{version.comment}</p>
                  )}
                </div>

                {/* Only show rollback for non-current versions */}
                {index > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const confirmed = window.confirm(
                        `Moechten Sie Version v${version.version_number} wiederherstellen? Die aktuelle Konfiguration wird als neue Version gespeichert.`
                      );
                      if (confirmed) {
                        onRollback(version.id);
                      }
                    }}
                    disabled={isMutating}
                    className="shrink-0"
                  >
                    {isMutating ? (
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-1.5 h-3 w-3" />
                    )}
                    Wiederherstellen
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
