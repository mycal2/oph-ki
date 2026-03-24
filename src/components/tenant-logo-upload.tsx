"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { Upload, Trash2, Loader2, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const ACCEPTED_EXTENSIONS = ".png,.jpg,.jpeg,.svg,.webp";
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

interface TenantLogoUploadProps {
  /** Current logo URL (null if no logo). */
  logoUrl: string | null;
  /** Tenant ID -- used as the filename in storage. */
  tenantId: string;
  /**
   * Called after a successful upload or removal to persist the logo_url.
   * Returns true if the save succeeded.
   */
  onSave: (logoUrl: string | null) => Promise<boolean>;
  /** Whether parent form is currently saving. */
  disabled?: boolean;
}

/**
 * OPH-51: Logo upload/remove control used on both admin tenant detail
 * and tenant settings pages.
 *
 * Upload flow:
 * 1. User selects a file (validated client-side for type + size)
 * 2. File uploaded directly to Supabase Storage (tenant-logos bucket)
 * 3. Public URL saved via onSave callback
 *
 * Remove flow:
 * 1. User clicks "Logo entfernen"
 * 2. File removed from Supabase Storage
 * 3. null saved via onSave callback
 */
export function TenantLogoUpload({
  logoUrl,
  tenantId,
  onSave,
  disabled = false,
}: TenantLogoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(logoUrl);
  const [imageError, setImageError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync preview when prop changes externally
  // (e.g. after parent re-fetches tenant data)
  const effectivePreview = previewUrl ?? logoUrl;

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // AC-4: Validate file type
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast.error("Nicht unterstütztes Format. Erlaubt: PNG, JPG, SVG, WebP.");
        return;
      }

      // AC-4: Validate file size
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast.error(
          `Datei ist zu gross (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 2 MB.`
        );
        return;
      }

      setIsUploading(true);
      setImageError(false);

      try {
        const supabase = createClient();

        // Determine file extension from MIME type
        const extMap: Record<string, string> = {
          "image/png": "png",
          "image/jpeg": "jpg",
          "image/svg+xml": "svg",
          "image/webp": "webp",
        };
        const ext = extMap[file.type] ?? "png";
        const storagePath = `${tenantId}.${ext}`;

        // Remove any existing logo file(s) for this tenant first
        // (handles extension changes, e.g. from .png to .jpg)
        const { data: existingFiles } = await supabase.storage
          .from("tenant-logos")
          .list("", { search: tenantId });

        if (existingFiles && existingFiles.length > 0) {
          const pathsToRemove = existingFiles
            .filter((f) => f.name.startsWith(tenantId))
            .map((f) => f.name);
          if (pathsToRemove.length > 0) {
            await supabase.storage.from("tenant-logos").remove(pathsToRemove);
          }
        }

        // Upload file directly to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from("tenant-logos")
          .upload(storagePath, file, {
            cacheControl: "3600",
            upsert: true,
          });

        if (uploadError) {
          console.error("Logo upload error:", uploadError.message);
          toast.error("Logo-Upload fehlgeschlagen. Bitte erneut versuchen.");
          return;
        }

        // Get the public URL
        const { data: publicUrlData } = supabase.storage
          .from("tenant-logos")
          .getPublicUrl(storagePath);

        // Append a cache-buster to force browser to refetch
        const publicUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

        // Persist the URL via parent callback
        const saved = await onSave(publicUrl);
        if (saved) {
          setPreviewUrl(publicUrl);
          window.dispatchEvent(new Event("tenant-logo-updated"));
          toast.success("Logo hochgeladen.");
        } else {
          toast.error("Logo konnte nicht gespeichert werden.");
        }
      } catch (err) {
        console.error("Logo upload error:", err);
        toast.error("Logo-Upload fehlgeschlagen. Bitte erneut versuchen.");
      } finally {
        setIsUploading(false);
      }
    },
    [tenantId, onSave]
  );

  const handleRemove = useCallback(async () => {
    setIsRemoving(true);

    try {
      const supabase = createClient();

      // Remove all files for this tenant from storage
      const { data: existingFiles } = await supabase.storage
        .from("tenant-logos")
        .list("", { search: tenantId });

      if (existingFiles && existingFiles.length > 0) {
        const pathsToRemove = existingFiles
          .filter((f) => f.name.startsWith(tenantId))
          .map((f) => f.name);
        if (pathsToRemove.length > 0) {
          await supabase.storage.from("tenant-logos").remove(pathsToRemove);
        }
      }

      // Persist null via parent callback
      const saved = await onSave(null);
      if (saved) {
        setPreviewUrl(null);
        setImageError(false);
        window.dispatchEvent(new Event("tenant-logo-updated"));
        toast.success("Logo entfernt.");
      } else {
        toast.error("Logo konnte nicht entfernt werden.");
      }
    } catch (err) {
      console.error("Logo remove error:", err);
      toast.error("Logo konnte nicht entfernt werden.");
    } finally {
      setIsRemoving(false);
    }
  }, [tenantId, onSave]);

  const isBusy = isUploading || isRemoving || disabled;

  return (
    <div className="space-y-3">
      <Label>Firmenlogo</Label>

      {/* Preview area */}
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-32 items-center justify-center rounded-md border border-dashed bg-muted/50">
          {effectivePreview && !imageError ? (
            <Image
              src={effectivePreview}
              alt="Firmenlogo"
              width={120}
              height={56}
              className="h-14 w-auto max-w-[120px] object-contain"
              onError={() => setImageError(true)}
              unoptimized
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <ImageIcon className="h-5 w-5" />
              <span className="text-xs">Kein Logo</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-4 w-4" />
            )}
            {effectivePreview ? "Logo ersetzen" : "Logo hochladen"}
          </Button>

          {/* AC-10: Remove button (only shown when logo exists) */}
          {effectivePreview && !imageError && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isBusy}
              onClick={handleRemove}
              className="text-destructive hover:text-destructive"
            >
              {isRemoving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-4 w-4" />
              )}
              Logo entfernen
            </Button>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Logo-Datei auswählen"
      />

      <p className="text-xs text-muted-foreground">
        PNG, JPG, SVG oder WebP. Maximal 2 MB. Empfohlen: transparenter Hintergrund, mindestens 120px breit.
      </p>
    </div>
  );
}
