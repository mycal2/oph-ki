"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ArticleCatalogItem } from "@/lib/types";
import type { CreateArticleInput, UpdateArticleInput } from "@/lib/validations";

interface ArticleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, we are editing this article. Otherwise, creating a new one. */
  article: ArticleCatalogItem | null;
  onSave: (
    data: CreateArticleInput | UpdateArticleInput,
    isNew: boolean,
    articleId?: string
  ) => Promise<{ ok: boolean; error?: string }>;
}

const FIELDS: {
  key: keyof CreateArticleInput;
  label: string;
  required: boolean;
  placeholder: string;
}[] = [
  { key: "article_number", label: "Herst.-Art.-Nr.", required: true, placeholder: "z.B. 12345" },
  { key: "name", label: "Artikelbezeichnung", required: true, placeholder: "z.B. Komposit A2" },
  { key: "category", label: "Kategorie", required: false, placeholder: "z.B. Komposit" },
  { key: "color", label: "Farbe / Shade", required: false, placeholder: "z.B. A1" },
  { key: "packaging", label: "Verpackungseinheit", required: false, placeholder: "z.B. 10 Stk." },
  { key: "size1", label: "Groesse 1", required: false, placeholder: "z.B. 200ml" },
  { key: "size2", label: "Groesse 2", required: false, placeholder: "z.B. 4g" },
  { key: "ref_no", label: "Ref.-Nr.", required: false, placeholder: "" },
  { key: "gtin", label: "GTIN / EAN", required: false, placeholder: "" },
  { key: "keywords", label: "Suchbegriffe / Aliase", required: false, placeholder: "z.B. Venus, Heraeus, Komposit" },
];

export function ArticleFormDialog({
  open,
  onOpenChange,
  article,
  onSave,
}: ArticleFormDialogProps) {
  const isNew = !article;

  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return;
    setError(null);
    setIsSaving(false);

    if (article) {
      setFormData({
        article_number: article.article_number,
        name: article.name,
        category: article.category ?? "",
        color: article.color ?? "",
        packaging: article.packaging ?? "",
        size1: article.size1 ?? "",
        size2: article.size2 ?? "",
        ref_no: article.ref_no ?? "",
        gtin: article.gtin ?? "",
        keywords: article.keywords ?? "",
      });
    } else {
      setFormData({});
    }
  }, [open, article]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      const data: CreateArticleInput = {
        article_number: formData.article_number?.trim() ?? "",
        name: formData.name?.trim() ?? "",
        category: formData.category?.trim() || null,
        color: formData.color?.trim() || null,
        packaging: formData.packaging?.trim() || null,
        size1: formData.size1?.trim() || null,
        size2: formData.size2?.trim() || null,
        ref_no: formData.ref_no?.trim() || null,
        gtin: formData.gtin?.trim() || null,
        keywords: formData.keywords?.trim() || null,
      };

      const result = await onSave(data, isNew, article?.id);

      if (result.ok) {
        onOpenChange(false);
      } else {
        setError(result.error ?? "Fehler beim Speichern.");
      }
    } catch {
      setError("Unerwarteter Fehler beim Speichern.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {isNew ? "Artikel hinzufuegen" : "Artikel bearbeiten"}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "Neuen Artikel zum Artikelstamm hinzufuegen."
              : "Artikeldaten aktualisieren."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {FIELDS.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`article-${field.key}`}>
                {field.label}
                {field.required && " *"}
              </Label>
              <Input
                id={`article-${field.key}`}
                value={formData[field.key] ?? ""}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                placeholder={field.placeholder}
                required={field.required}
                disabled={isSaving}
              />
            </div>
          ))}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isNew ? "Hinzufuegen" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
