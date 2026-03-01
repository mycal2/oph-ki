"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
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
import { MappingsTable } from "@/components/dealer-mappings/mappings-table";
import { useDealers } from "@/hooks/use-dealers";
import { useDealerMappings } from "@/hooks/use-dealer-mappings";
import type { MappingType } from "@/lib/types";

const MAPPING_TABS: { value: MappingType; label: string }[] = [
  { value: "article_number", label: "Artikelnummern" },
  { value: "unit_conversion", label: "Einheiten" },
  { value: "field_label", label: "Felder" },
];

export default function DealerMappingsPage() {
  const { dealers, isLoading: isDealersLoading, error: dealersError } = useDealers();
  const [selectedDealerId, setSelectedDealerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MappingType>("article_number");

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
        <h1 className="text-2xl font-bold tracking-tight">Haendler-Zuordnungen</h1>
        <p className="text-muted-foreground">
          Verwalten Sie Artikelnummern-, Einheiten- und Feld-Zuordnungen fuer Ihre Haendler.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-lg">Zuordnungen</CardTitle>
                <CardDescription>
                  Haendler-Werte werden automatisch in ERP-Werte uebersetzt.
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
                    <SelectValue placeholder="Haendler auswaehlen..." />
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
              <p>Waehlen Sie einen Haendler aus, um dessen Zuordnungen zu verwalten.</p>
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
