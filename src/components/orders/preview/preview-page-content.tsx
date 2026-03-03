"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PreviewHeader } from "./preview-header";
import { OrderSummaryCard } from "./order-summary-card";
import { LineItemsTable } from "./line-items-table";
import { PreviewCtaSection } from "./preview-cta-section";
import { ExpiredTokenMessage } from "./expired-token-message";
import type { OrderPreviewData, OrderPreviewResponse } from "@/lib/types";

interface PreviewPageContentProps {
  token: string;
}

type PageState =
  | { type: "loading" }
  | { type: "ok"; data: OrderPreviewData }
  | { type: "expired" }
  | { type: "not_found" }
  | { type: "error"; message: string };

export function PreviewPageContent({ token }: PreviewPageContentProps) {
  const [state, setState] = useState<PageState>({ type: "loading" });

  useEffect(() => {
    async function fetchPreview() {
      try {
        const res = await fetch(`/api/orders/preview/${encodeURIComponent(token)}`);
        const json = (await res.json()) as OrderPreviewResponse;

        if (json.status === "ok") {
          setState({ type: "ok", data: json.data });
        } else if (json.status === "expired") {
          setState({ type: "expired" });
        } else {
          setState({ type: "not_found" });
        }
      } catch {
        setState({ type: "error", message: "Verbindungsfehler. Bitte versuchen Sie es erneut." });
      }
    }

    fetchPreview();
  }, [token]);

  // Loading state
  if (state.type === "loading") {
    return (
      <div className="min-h-screen bg-secondary">
        <PreviewHeader />
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </main>
      </div>
    );
  }

  // Expired token
  if (state.type === "expired") {
    return (
      <div className="min-h-screen bg-secondary">
        <PreviewHeader />
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <ExpiredTokenMessage />
        </main>
      </div>
    );
  }

  // Not found
  if (state.type === "not_found") {
    return (
      <div className="min-h-screen bg-secondary">
        <PreviewHeader />
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <ExpiredTokenMessage
            title="Vorschau nicht gefunden"
            description="Der angegebene Vorschau-Link ist ungueltig. Bitte pruefen Sie den Link und versuchen Sie es erneut."
          />
        </main>
      </div>
    );
  }

  // Error state
  if (state.type === "error") {
    return (
      <div className="min-h-screen bg-secondary">
        <PreviewHeader />
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <ExpiredTokenMessage
            title="Fehler"
            description={state.message}
          />
        </main>
      </div>
    );
  }

  // Success: show the preview
  const { data } = state;

  return (
    <div className="min-h-screen bg-secondary">
      <PreviewHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-6">
          {/* Page title */}
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              Bestellvorschau
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Automatisch extrahierte Bestelldaten - nur Ansicht
            </p>
          </div>

          {/* Order summary */}
          <OrderSummaryCard data={data} />

          {/* Line items table */}
          {data.lineItems.length > 0 && (
            <LineItemsTable
              lineItems={data.lineItems}
              totalAmount={data.totalAmount}
              currency={data.currency}
            />
          )}

          {/* CTA section */}
          <PreviewCtaSection />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-background py-6 mt-12">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs text-muted-foreground">
            IDS.online GmbH &mdash; 100% Tochter des VDDI
          </p>
        </div>
      </footer>
    </div>
  );
}
