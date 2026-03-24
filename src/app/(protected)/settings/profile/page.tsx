"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TenantLogoUpload } from "@/components/tenant-logo-upload";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import { createClient } from "@/lib/supabase/client";
import type { ApiResponse } from "@/lib/types";

export default function TenantProfileSettingsPage() {
  const { role, isLoading: isLoadingRole } = useCurrentUserRole();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isTenantAdmin = role === "tenant_admin" || role === "platform_admin";

  // Fetch tenant ID and current logo
  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setError("Nicht authentifiziert.");
          return;
        }

        const tid = (user.app_metadata as { tenant_id?: string })?.tenant_id;
        if (!tid) {
          setError("Kein Mandant zugewiesen.");
          return;
        }

        setTenantId(tid);

        // Fetch current logo
        const res = await fetch("/api/settings/logo");
        const json = (await res.json()) as ApiResponse<{ logo_url: string | null }>;

        if (res.ok && json.success && json.data) {
          setLogoUrl(json.data.logo_url);
        }
      } catch {
        setError("Verbindungsfehler beim Laden der Einstellungen.");
      } finally {
        setIsLoading(false);
      }
    }

    if (!isLoadingRole) {
      load();
    }
  }, [isLoadingRole]);

  // Save logo URL via the settings API
  const handleLogoSave = useCallback(
    async (newLogoUrl: string | null): Promise<boolean> => {
      try {
        const res = await fetch("/api/settings/logo", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ logo_url: newLogoUrl }),
        });
        const json = (await res.json()) as ApiResponse<{ logo_url: string | null }>;

        if (res.ok && json.success) {
          setLogoUrl(json.data?.logo_url ?? null);
          return true;
        }

        toast.error(json.error ?? "Logo konnte nicht gespeichert werden.");
        return false;
      } catch {
        toast.error("Verbindungsfehler beim Speichern des Logos.");
        return false;
      }
    },
    []
  );

  // Loading state
  if (isLoadingRole || isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <Skeleton className="h-48 w-full max-w-lg rounded-lg" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Firmenprofil</h1>
          <p className="text-muted-foreground mt-1">
            Logo und Profil Ihres Unternehmens verwalten.
          </p>
        </div>
        <Alert variant="destructive">
          <AlertDescription>
            {error}{" "}
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => window.location.reload()}
            >
              Erneut versuchen
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Access denied -- only tenant_admin can change logo
  if (!isTenantAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Firmenprofil</h1>
          <p className="text-muted-foreground mt-1">
            Logo und Profil Ihres Unternehmens.
          </p>
        </div>
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Firmenlogo</CardTitle>
            <CardDescription>
              Nur Administratoren können das Firmenlogo ändern.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {logoUrl ? (
              <div className="flex h-16 w-32 items-center justify-center rounded-md border bg-muted/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt="Firmenlogo"
                  className="h-14 w-auto max-w-[120px] object-contain"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Kein Logo hochgeladen.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Firmenprofil</h1>
        <p className="text-muted-foreground mt-1">
          Logo und Profil Ihres Unternehmens verwalten.
        </p>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Firmenlogo</CardTitle>
          <CardDescription>
            Dieses Logo wird in der Navigationsleiste für alle Benutzer Ihres
            Mandanten angezeigt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tenantId && (
            <TenantLogoUpload
              logoUrl={logoUrl}
              tenantId={tenantId}
              onSave={handleLogoSave}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
