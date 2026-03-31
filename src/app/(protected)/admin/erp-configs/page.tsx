"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import { useErpConfigs } from "@/hooks/use-erp-configs";
import { ErpConfigListTable } from "@/components/admin/erp-config-list-table";

export default function AdminErpConfigsPage() {
  const router = useRouter();
  const { isPlatformAdmin, isLoading: isLoadingRole } = useCurrentUserRole();
  const {
    configs,
    isLoading,
    error,
    refetch,
    createConfig,
    duplicateConfig,
    deleteConfig,
    isMutating,
    mutationError,
    clearMutationError,
  } = useErpConfigs();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  // Loading state
  if (isLoadingRole) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Access denied
  if (!isPlatformAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Zugriff verweigert. Nur für Platform-Administratoren.
        </p>
      </div>
    );
  }

  async function handleCreate() {
    const configId = await createConfig({
      name: newName.trim(),
      description: newDescription.trim() || null,
      format: "csv",
      column_mappings: [],
      separator: ";",
      quote_char: '"',
      encoding: "utf-8",
      line_ending: "LF",
      decimal_separator: ".",
      fallback_mode: "block",
      xml_template: null,
    });

    if (configId) {
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
      router.push(`/admin/erp-configs/${configId}`);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ERP-Mapping-Konfiguration</h1>
          <p className="text-sm text-muted-foreground">
            ERP-Konfigurationen verwalten. Jede Konfiguration kann mehreren Mandanten zugewiesen werden.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setNewName("");
            setNewDescription("");
            clearMutationError();
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Neue Konfiguration
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neue ERP-Konfiguration</DialogTitle>
              <DialogDescription>
                Erstellen Sie eine neue ERP-Konfiguration mit Standardwerten. Sie können die Details anschließend bearbeiten.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {mutationError && (
                <Alert variant="destructive">
                  <AlertDescription>{mutationError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="config-name">Name</Label>
                <Input
                  id="config-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="z.B. SAP Import CSV"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="config-description">Beschreibung (optional)</Label>
                <Textarea
                  id="config-description"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Kurze Beschreibung der Konfiguration..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={isMutating}
              >
                Abbrechen
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!newName.trim() || isMutating}
              >
                {isMutating ? "Erstelle..." : "Erstellen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Error states */}
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
      {mutationError && (
        <Alert variant="destructive">
          <AlertDescription>
            {mutationError}{" "}
            <Button variant="link" className="h-auto p-0" onClick={clearMutationError}>
              Schliessen
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Config list table */}
      <ErpConfigListTable
        configs={configs}
        isLoading={isLoading}
        onDuplicate={duplicateConfig}
        onDelete={deleteConfig}
      />
    </div>
  );
}
