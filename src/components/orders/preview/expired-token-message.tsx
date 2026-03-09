import { Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

const CONTACT_URL = "https://www.ids.online";

interface ExpiredTokenMessageProps {
  title?: string;
  description?: string;
}

/**
 * OPH-16: Friendly message shown when a magic-link preview token
 * has expired or is invalid.
 */
export function ExpiredTokenMessage({
  title = "Diese Vorschau ist nicht mehr verfügbar",
  description = "Der Vorschau-Link ist abgelaufen. Vorschau-Links sind 30 Tage lang gültig.",
}: ExpiredTokenMessageProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center py-12 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Clock className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
        <div className="mt-6">
          <Button asChild variant="outline" className="gap-2">
            <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
              Mehr über IDS.online erfahren
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
