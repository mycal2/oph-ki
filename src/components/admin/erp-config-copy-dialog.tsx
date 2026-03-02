"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertTriangle, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiResponse, ErpConfigListItem } from "@/lib/types";

interface ErpConfigCopyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTenantId: string;
  onCopy: (sourceTenantId: string) => Promise<boolean>;
  isMutating: boolean;
}

export function ErpConfigCopyDialog({
  open,
  onOpenChange,
  currentTenantId,
  onCopy,
  isMutating,
}: ErpConfigCopyDialogProps) {
  const [tenants, setTenants] = useState<ErpConfigListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState("");

  // Fetch tenants with configs when dialog opens
  useEffect(() => {
    if (open && tenants.length === 0) {
      setIsLoading(true);
      fetch("/api/admin/erp-configs")
        .then((res) => res.json())
        .then((json: ApiResponse<ErpConfigListItem[]>) => {
          if (json.success && json.data) {
            // Only show tenants that have a config and are not the current tenant
            setTenants(
              json.data.filter(
                (t) => t.has_config && t.tenant_id !== currentTenantId
              )
            );
          }
        })
        .catch(() => {
          // Silently fail
        })
        .finally(() => setIsLoading(false));
    }
  }, [open, tenants.length, currentTenantId]);

  const handleCopy = useCallback(async () => {
    if (!selectedTenantId) return;

    const confirmed = window.confirm(
      "Moechten Sie die Konfiguration wirklich kopieren? Die aktuelle Konfiguration wird als neue Version ueberschrieben."
    );
    if (!confirmed) return;

    await onCopy(selectedTenantId);
  }, [selectedTenantId, onCopy]);

  const handleClose = useCallback(() => {
    setSelectedTenantId("");
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Konfiguration kopieren</DialogTitle>
          <DialogDescription>
            Kopieren Sie die ERP-Konfiguration eines anderen Mandanten als Ausgangsbasis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Die Kopie wird als neue Version gespeichert. Die bisherige Konfiguration bleibt in der
              Versionshistorie erhalten.
            </AlertDescription>
          </Alert>

          <div className="space-y-1.5">
            <Label className="text-sm">Quell-Mandant</Label>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Mandanten werden geladen...
              </div>
            ) : tenants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine anderen Mandanten mit konfiguriertem ERP-Mapping gefunden.
              </p>
            ) : (
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Mandant auswaehlen..." />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.tenant_id} value={tenant.tenant_id}>
                      {tenant.tenant_name}
                      {tenant.format && ` (${tenant.format.toUpperCase()})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Abbrechen
          </Button>
          <Button
            onClick={handleCopy}
            disabled={isMutating || !selectedTenantId}
          >
            {isMutating ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Copy className="mr-1.5 h-4 w-4" />
            )}
            Kopieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
