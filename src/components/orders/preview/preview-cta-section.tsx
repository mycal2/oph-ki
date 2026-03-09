import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

const CONTACT_URL = "https://www.ids.online";

/**
 * OPH-16: Call-to-action section for the public preview page.
 * Encourages prospects to sign up for the full platform.
 */
export function PreviewCtaSection() {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex flex-col items-center gap-4 py-8 text-center sm:flex-row sm:text-left">
        <div className="flex-1">
          <h2 className="text-lg font-bold">
            Beeindruckt? Testen Sie die Vollversion.
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Automatische Bestellverarbeitung, ERP-Export und mehr &mdash; für Ihr
            gesamtes Team.
          </p>
        </div>
        <Button asChild size="lg" className="shrink-0 gap-2 font-bold">
          <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
            Vollversion testen
            <ArrowRight className="h-4 w-4" />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
