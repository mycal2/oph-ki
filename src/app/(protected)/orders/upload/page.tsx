"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle2, AlertCircle, Upload, XCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileDropzone } from "@/components/orders/file-dropzone";
import { UploadFileList } from "@/components/orders/upload-file-list";
import { DealerBadge } from "@/components/orders/dealer";
import { useFileUpload } from "@/hooks/use-file-upload";

export default function UploadPage() {
  const router = useRouter();
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const {
    files,
    isUploading,
    uploadComplete,
    canUpload,
    pendingCount,
    successCount,
    errorCount,
    addFiles,
    removeFile,
    uploadFiles,
    clearFiles,
  } = useFileUpload();

  const handleFilesAdded = useCallback(
    async (newFiles: File[]) => {
      setValidationErrors([]);
      const errors = await addFiles(newFiles);
      if (errors.length > 0) setValidationErrors(errors);
    },
    [addFiles]
  );

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
                  ? "Ihre Dateien wurden hochgeladen und werden nun verarbeitet."
                  : `${errorCount} ${errorCount === 1 ? "Datei konnte" : "Dateien konnten"} nicht hochgeladen werden.`}
              </p>
            </div>
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
              <Button onClick={clearFiles} variant="outline">
                Weitere Dateien hochladen
              </Button>
              <Button onClick={() => router.push("/orders")}>
                Zur Bestellübersicht
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
        <h1 className="text-2xl font-bold md:text-3xl">Bestellungen hochladen</h1>
        <p className="text-muted-foreground mt-1">
          Laden Sie Bestelldateien hoch. Das System erkennt den Händler und
          extrahiert die Bestelldaten automatisch.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dateien auswählen</CardTitle>
          <CardDescription>
            Unterstützte Formate: .eml, .pdf, .xlsx, .xls, .csv · Max. 25 MB
            pro Datei · Max. 10 Dateien
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropzone onFilesAdded={handleFilesAdded} disabled={isUploading} />

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
              {files.length} {files.length === 1 ? "Datei" : "Dateien"} ausgewählt
              {pendingCount > 0 && ` · ${pendingCount} bereit zum Upload`}
            </p>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={clearFiles}
                disabled={isUploading}
                className="flex-1 sm:flex-none"
              >
                Zurücksetzen
              </Button>
              <Button
                onClick={uploadFiles}
                disabled={!canUpload}
                className="flex-1 sm:flex-none"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Lädt hoch...
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
