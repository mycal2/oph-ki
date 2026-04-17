import { Search } from "lucide-react";

/**
 * OPH-72: Salesforce App home page (placeholder).
 * Will become the article search in SF-5 (OPH-76).
 */
export default function SalesforceHomePage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Search className="h-12 w-12 text-muted-foreground/40 mb-4" />
      <h1 className="text-xl font-semibold mb-2">Salesforce App</h1>
      <p className="text-sm text-muted-foreground">
        Artikelsuche und Bestellerfassung werden in Kürze freigeschaltet.
      </p>
    </div>
  );
}
