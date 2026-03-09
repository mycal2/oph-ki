"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeftRight, Globe } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MappingsTable } from "@/components/dealer-mappings/mappings-table";
import { useDealers } from "@/hooks/use-dealers";
import { useDealerMappings } from "@/hooks/use-dealer-mappings";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import type { MappingType } from "@/lib/types";

const MAPPING_TABS: { value: MappingType; label: string }[] = [
  { value: "article_number", label: "Artikelnummern" },
  { value: "unit_conversion", label: "Einheiten" },
  { value: "field_label", label: "Felder" },
];

function DealerMappingsContent() {
  const searchParams = useSearchParams();
  const { dealers, isLoading: isDealersLoading, error: dealersError } = useDealers();
  const { isPlatformAdmin } = useCurrentUserRole();
  const [selectedDealerId, setSelectedDealerId] = useState<string | null>(
    searchParams.get("dealer")
  );
  const [activeTab, setActiveTab] = useState<MappingType>("article_number");
  const [isGlobalMode, setIsGlobalMode] = useState(false);

  const selectedDealer = dealers.find((d) => d.id === selectedDealerId);

  const {
    mappings,
    isLoading: isMappingsLoading,
    error: mappingsError,
    createMapping,
    deleteMapping,
    importCsv,
  } = useDealerMappings({
    dealerId: selectedDealerId,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Händler-Zuordnungen</h1>
        <p className="text-muted-foreground">
          Verwalten Sie Artikelnummern-, Einheiten- und Feld-Zuordnungen für Ihre Händler.
        </p>
      </div>

      {/* Platform admin: global mode toggle */}
      {isPlatformAdmin && (
        <div className="flex items-center gap-3 p-3 border rounded-md bg-muted/30">
          <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
          <Label htmlFor="global-mode" className="flex-1 text-sm cursor-pointer">
            Globale Zuordnungen verwalten
            <span className="text-muted-foreground block text-xs">
              Neue Einträge gelten für alle Mandanten als Basis-Zuordnungen.
            </span>
          </Label>
          <Switch
            id="global-mode"
            checked={isGlobalMode}
            onCheckedChange={setIsGlobalMode}
          />
          {isGlobalMode && (
            <Badge variant="secondary" className="shrink-0">Global</Badge>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-lg">Zuordnungen</CardTitle>
                <CardDescription>
                  Händler-Werte werden automatisch in ERP-Werte übersetzt.
                </CardDescription>
              </div>
            </div>
            <div className="w-full sm:w-[250px]">
              {isDealersLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : dealersError ? (
                <Alert variant="destructive">
                  <AlertDescription>{dealersError}</AlertDescription>
                </Alert>
              ) : (
                <Select
                  value={selectedDealerId ?? ""}
                  onValueChange={(val) => setSelectedDealerId(val || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Händler auswählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {dealers.map((dealer) => (
                      <SelectItem key={dealer.id} value={dealer.id}>
                        {dealer.name}
                        {dealer.city && (
                          <span className="text-muted-foreground"> ({dealer.city})</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedDealerId ? (
            <div className="text-center py-12 text-muted-foreground">
              <ArrowLeftRight className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Wählen Sie einen Händler aus, um dessen Zuordnungen zu verwalten.</p>
            </div>
          ) : (
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as MappingType)}
            >
              <TabsList>
                {MAPPING_TABS.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {MAPPING_TABS.map((tab) => (
                <TabsContent key={tab.value} value={tab.value}>
                  <MappingsTable
                    dealerId={selectedDealerId}
                    dealerName={selectedDealer?.name ?? ""}
                    mappingType={tab.value}
                    mappings={mappings}
                    isLoading={isMappingsLoading}
                    error={mappingsError}
                    onCreateMapping={createMapping}
                    onDeleteMapping={deleteMapping}
                    onImportCsv={importCsv}
                    isGlobalMode={isGlobalMode}
                    isPlatformAdmin={isPlatformAdmin}
                  />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DealerMappingsPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 mt-2" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    }>
      <DealerMappingsContent />
    </Suspense>
  );
}
