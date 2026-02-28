import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrdersList } from "@/components/orders/orders-list";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bestellungen | IDS.online",
  description: "Übersicht aller hochgeladenen und verarbeiteten Bestellungen.",
};

export default function OrdersPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Bestellungen</h1>
          <p className="text-muted-foreground mt-1">
            Übersicht aller hochgeladenen und verarbeiteten Bestellungen.
          </p>
        </div>
        <Button asChild className="sm:shrink-0">
          <Link href="/orders/upload">
            <Upload className="h-4 w-4" />
            Neue Bestellung
          </Link>
        </Button>
      </div>

      <OrdersList />
    </div>
  );
}
