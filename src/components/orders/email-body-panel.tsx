"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronRight, Mail, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ApiResponse } from "@/lib/types";

interface EmailBodyPanelProps {
  orderId: string;
}

/**
 * OPH-21: Collapsible panel that shows the original email body text.
 *
 * Collapsed by default. On first expand, lazily fetches the email body
 * from the API to avoid loading long text with every order detail request.
 */
export function EmailBodyPanel({ orderId }: EmailBodyPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [emailBody, setEmailBody] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEmailBody = useCallback(async () => {
    if (emailBody !== null) return; // Already loaded

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/orders/${orderId}/email-body`);
      const json = (await res.json()) as ApiResponse<{ emailBody: string }>;

      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? "E-Mail-Text konnte nicht geladen werden.");
        return;
      }

      setEmailBody(json.data.emailBody);
    } catch {
      setError("Verbindungsfehler beim Laden des E-Mail-Textes.");
    } finally {
      setIsLoading(false);
    }
  }, [orderId, emailBody]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (open) {
        fetchEmailBody();
      }
    },
    [fetchEmailBody]
  );

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 p-4 text-left text-sm font-medium hover:bg-muted/50 transition-colors rounded-t-lg"
          >
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>Original E-Mail</span>
            {isOpen ? (
              <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4">
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>E-Mail-Text wird geladen...</span>
              </div>
            )}
            {error && (
              <p className="text-sm text-destructive py-2">{error}</p>
            )}
            {emailBody !== null && !isLoading && (
              <pre className="whitespace-pre-wrap break-words text-sm font-mono bg-muted/50 rounded-md p-4 max-h-96 overflow-y-auto border">
                {emailBody}
              </pre>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
