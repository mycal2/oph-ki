import { Mail } from "lucide-react";

/**
 * OPH-72: Salesforce App login page (placeholder).
 * Will become the magic link login in SF-4 (OPH-75).
 */
export default function SalesforceLoginPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Mail className="h-12 w-12 text-muted-foreground/40 mb-4" />
      <h1 className="text-xl font-semibold mb-2">Anmeldung</h1>
      <p className="text-sm text-muted-foreground">
        Magic-Link-Authentifizierung wird in Kürze freigeschaltet.
      </p>
    </div>
  );
}
