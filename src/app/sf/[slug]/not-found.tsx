import { AlertCircle } from "lucide-react";

/**
 * OPH-72: Not-found page for invalid or disabled Salesforce subdomains.
 */
export default function SalesforceNotFound() {
  return (
    <div className="min-h-svh flex flex-col items-center justify-center px-4 text-center">
      <AlertCircle className="h-12 w-12 text-muted-foreground/40 mb-4" />
      <h1 className="text-xl font-semibold mb-2">App nicht verfügbar</h1>
      <p className="text-sm text-muted-foreground max-w-sm">
        Diese Salesforce-App ist nicht aktiv oder die Adresse ist ungültig.
        Bitte wenden Sie sich an Ihren Administrator.
      </p>
    </div>
  );
}
