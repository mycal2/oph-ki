"use client";

import { useState, useCallback } from "react";
import type {
  ColumnMappingProfile,
  ColumnMappingFormatType,
  ColumnMappingEntry,
  ApiResponse,
} from "@/lib/types";

interface UseDealerColumnMappingsReturn {
  profiles: ColumnMappingProfile[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  saveError: string | null;
  clearSaveError: () => void;
  fetchProfiles: (dealerId: string) => Promise<void>;
  saveProfile: (
    dealerId: string,
    formatType: ColumnMappingFormatType,
    mappings: ColumnMappingEntry[]
  ) => Promise<boolean>;
  deleteProfile: (
    dealerId: string,
    formatType: ColumnMappingFormatType
  ) => Promise<boolean>;
}

export function useDealerColumnMappings(): UseDealerColumnMappingsReturn {
  const [profiles, setProfiles] = useState<ColumnMappingProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const clearSaveError = useCallback(() => setSaveError(null), []);

  const fetchProfiles = useCallback(async (dealerId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/dealers/${dealerId}/column-mappings`);
      const json = (await res.json()) as ApiResponse<ColumnMappingProfile[]>;

      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? "Spalten-Mappings konnten nicht geladen werden.");
        setProfiles([]);
        return;
      }

      setProfiles(json.data);
    } catch {
      setError("Verbindungsfehler beim Laden der Spalten-Mappings.");
      setProfiles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveProfile = useCallback(
    async (
      dealerId: string,
      formatType: ColumnMappingFormatType,
      mappings: ColumnMappingEntry[]
    ): Promise<boolean> => {
      setIsSaving(true);
      setSaveError(null);

      try {
        const res = await fetch(
          `/api/admin/dealers/${dealerId}/column-mappings/${formatType}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mappings }),
          }
        );
        const json = (await res.json()) as ApiResponse<ColumnMappingProfile>;

        if (!res.ok || !json.success || !json.data) {
          setSaveError(json.error ?? "Spalten-Mapping konnte nicht gespeichert werden.");
          return false;
        }

        // Update local state
        setProfiles((prev) => {
          const idx = prev.findIndex((p) => p.format_type === formatType);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = json.data!;
            return updated;
          }
          return [...prev, json.data!];
        });

        return true;
      } catch {
        setSaveError("Verbindungsfehler beim Speichern des Spalten-Mappings.");
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  const deleteProfile = useCallback(
    async (
      dealerId: string,
      formatType: ColumnMappingFormatType
    ): Promise<boolean> => {
      setIsSaving(true);
      setSaveError(null);

      try {
        const res = await fetch(
          `/api/admin/dealers/${dealerId}/column-mappings/${formatType}`,
          { method: "DELETE" }
        );
        const json = (await res.json()) as ApiResponse;

        if (!res.ok || !json.success) {
          setSaveError(json.error ?? "Profil konnte nicht geloescht werden.");
          return false;
        }

        setProfiles((prev) => prev.filter((p) => p.format_type !== formatType));
        return true;
      } catch {
        setSaveError("Verbindungsfehler beim Loeschen des Profils.");
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  return {
    profiles,
    isLoading,
    isSaving,
    error,
    saveError,
    clearSaveError,
    fetchProfiles,
    saveProfile,
    deleteProfile,
  };
}
