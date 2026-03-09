"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Upload,
  XCircle,
  ExternalLink,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileDropzone } from "@/components/orders/file-dropzone";
import { UploadFileList } from "@/components/orders/upload-file-list";
import { DealerBadge } from "@/components/orders/dealer";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export default function AdminUploadPage() {
  const router = useRouter();
  const { isPlatformAdmin, isLoading: isLoadingRole } = useCurrentUserRole();

  // Tenant list state
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [tenantsError, setTenantsError] = useState<string | null>(null);

  // Selected tenant
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");

  const selectedTenantName = useMemo(() => {
    const tenant = tenants.find((t) => t.id === selectedTenantId);
    return tenant?.name ?? null;
  }, [tenants, selectedTenantId]);

  // Upload hook with tenant override
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const {
    files,
    isUploading,
    uploadComplete,
    canUpload,
    pendingCount,
    successCount,
    errorCount,
    subject,
    setSubject,
    addFiles,
    removeFile,
    uploadFiles,
    clearFiles,
  } = useFileUpload({ tenantId: selectedTenantId || undefined });

  // Fetch active tenants on mount
  useEffect(() => {
    async function fetchTenants() {
      try {
        const res = await fetch("/api/admin/tenants");
        if (!res.ok) {
          setTenantsError("Mandanten konnten nicht geladen werden.");
          return;
        }
        const json = await res.json();
        const allTenants: Tenant[] = json.data ?? json;
        const active = allTenants
          .filter((t) => t.status === "active")
          .sort((a, b) => a.name.localeCompare(b.name, "de"));
        setTenants(active);
      } catch {
        setTenantsError("Verbindungsfehler beim Laden der Mandanten.");
      } finally {
        setTenantsLoading(false);
      }
    }

    fetchTenants();
  }, []);

  // Redirect non-admins once role is loaded
  useEffect(() => {
    if (!isLoadingRole && !isPlatformAdmin) {
      router.replace("/orders/upload");
    }
  }, [isLoadingRole, isPlatformAdmin, router]);

  const handleFilesAdded = useCallback(
    async (newFiles: File[]) => {
      setValidationErrors([]);
      const errors = await addFiles(newFiles);
      if (errors.length > 0) setValidationErrors(errors);
    },
    [addFiles]
  );

  const handleReset = useCallback(() => {
    clearFiles();
    setSelectedTenantId("");
    setValidationErrors([]);
  }, [clearFiles]);

  const tenantSelected = selectedTenantId.length > 0;

  // Loading state
  if (isLoadingRole) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Access denied (also redirecting, but show nothing while redirect happens)
  if (!isPlatformAdmin) {
    return null;
  }

  // Success screen
  if (uploadComplete) {
    const allSucceeded = errorCount === 0;
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center gap-4">
            {allSucceeded ? (
              <CheckCircle2 className="h-16 w-16 text-green-600" />
            ) : (
              <AlertCircle className="h-16 w-16 text-yellow-500" />
            )}
            <div>
              <h2 className="text-xl font-bold">
                {allSucceeded
                  ? "Upload erfolgreich!"
                  : `${successCount} von ${successCount + errorCount} Dateien hochgeladen`}
              </h2>
              <p className="text-muted-foreground mt-1">
                {allSucceeded
                  ? "Die Dateien wurden hochgeladen und werden nun verarbeitet."
                  : `${errorCount} ${errorCount === 1 ? "Datei konnte" : "Dateien konnten"} nicht hochgeladen werden.`}
              </p>
            </div>
            {/* OPH-34: Show target tenant name */}
            {selectedTenantName && (
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Info className="h-4 w-4 shrink-0" />
                <span>Hochgeladen fuer: {selectedTenantName}</span>
              </div>
            )}
            {allSucceeded && (
              <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>KI-Extraktion laeuft im Hintergrund...</span>
              </div>
            )}
            {/* Per-file results with dealer badges */}
            <div className="w-full text-left space-y-2 mt-1">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2 text-sm rounded-md border p-2.5"
                >
                  {f.status === "success" ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      <span className="truncate flex-1 min-w-0">{f.file.name}</span>
                      {f.dealer && (
                        <DealerBadge
                          dealerName={f.dealer.dealerName}
                          confidence={f.dealer.recognitionConfidence}
                          recognitionMethod={f.dealer.recognitionMethod}
                          compact
                        />
                      )}
                      {f.orderId && (
                        <Link
                          href={`/orders/${f.orderId}`}
                          className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                          aria-label={`Details zu ${f.file.name}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                      <span className="truncate flex-1 min-w-0 text-destructive">
                        {f.file.name}: {f.error}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mt-2">
              <Button onClick={handleReset} variant="outline">
                Weitere Dateien hochladen
              </Button>
              <Button onClick={() => router.push("/orders")}>
                Zur Bestelluebersicht
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Admin: Bestellung hochladen</h1>
        <p className="text-muted-foreground mt-1">
          Laden Sie Bestelldateien im Namen eines Mandanten hoch.
        </p>
      </div>

      {/* Tenant selector */}
      <Card>
        <CardHeader>
          <CardTitle>Mandant auswaehlen</CardTitle>
          <CardDescription>
            Waehlen Sie den Mandanten, fuer den die Bestellung hochgeladen werden soll.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tenantsLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : tenantsError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{tenantsError}</AlertDescription>
            </Alert>
          ) : tenants.length === 0 ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Keine aktiven Mandanten vorhanden.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="tenant-select" className="text-sm">
                Mandant
              </Label>
              <Select
                value={selectedTenantId}
                onValueChange={setSelectedTenantId}
                disabled={isUploading}
              >
                <SelectTrigger id="tenant-select" aria-label="Mandant auswaehlen">
                  <SelectValue placeholder="Mandant auswaehlen..." />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                      <span className="text-muted-foreground ml-2">({tenant.slug})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload form - disabled until tenant selected */}
      <Card>
        <CardHeader>
          <CardTitle>Dateien auswaehlen</CardTitle>
          <CardDescription>
            Unterstuetzte Formate: .eml, .pdf, .xlsx, .xls, .csv -- Max. 25 MB
            pro Datei -- Max. 10 Dateien
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* OPH-25: Optional email subject for extraction context */}
          <div className="space-y-1.5">
            <Label htmlFor="admin-upload-subject" className="text-sm">
              Betreff <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="admin-upload-subject"
              type="text"
              placeholder="z.B. Bestellung RE-2024-001 von Henry Schein"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={500}
              disabled={!tenantSelected || isUploading}
            />
            <p className="text-xs text-muted-foreground">
              Falls vorhanden, hilft der E-Mail-Betreff bei der Erkennung von Bestellnummern und Absendern.
            </p>
          </div>

          <FileDropzone
            onFilesAdded={handleFilesAdded}
            disabled={!tenantSelected || isUploading}
          />

          {!tenantSelected && tenants.length > 0 && (
            <p className="text-sm text-muted-foreground text-center">
              Bitte waehlen Sie zuerst einen Mandanten aus, um Dateien hochzuladen.
            </p>
          )}

          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1">
                  {validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {files.length > 0 && (
            <UploadFileList files={files} onRemove={removeFile} />
          )}
        </CardContent>

        {files.length > 0 && (
          <CardFooter className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {files.length} {files.length === 1 ? "Datei" : "Dateien"} ausgewaehlt
              {pendingCount > 0 && ` -- ${pendingCount} bereit zum Upload`}
            </p>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={isUploading}
                className="flex-1 sm:flex-none"
              >
                Zuruecksetzen
              </Button>
              <Button
                onClick={uploadFiles}
                disabled={!canUpload || !tenantSelected}
                className="flex-1 sm:flex-none"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Laedt hoch...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    {pendingCount} {pendingCount === 1 ? "Datei" : "Dateien"} hochladen
                  </>
                )}
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
