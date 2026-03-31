"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Plus,
  Upload,
  Download,
  FileDown,
  Search,
  Package,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useArticleCatalog } from "@/hooks/use-article-catalog";
import { ArticleFormDialog } from "@/components/article-catalog/article-form-dialog";
import { ArticleDeleteDialog } from "@/components/article-catalog/article-delete-dialog";
import { ArticleBulkDeleteDialog } from "@/components/article-catalog/article-bulk-delete-dialog";
import { ArticleImportDialog } from "@/components/article-catalog/article-import-dialog";
import type { ArticleCatalogItem } from "@/lib/types";
import type { CreateArticleInput, UpdateArticleInput } from "@/lib/validations";

interface ArticleCatalogPageProps {
  /** When provided, use admin API mode for this tenant. */
  adminTenantId?: string | null;
  /** When true, hide the page-level heading (used when embedded in a sheet/tab). */
  compact?: boolean;
  /** When true, hide add/edit/delete/import buttons (read-only view for tenant_user). */
  readOnly?: boolean;
}

export function ArticleCatalogPage({
  adminTenantId,
  compact = false,
  readOnly = false,
}: ArticleCatalogPageProps) {
  const {
    articles,
    total,
    page,
    pageSize,
    search,
    isLoading,
    error,
    setPage,
    setSearch,
    createArticle,
    updateArticle,
    deleteArticle,
    bulkDeleteArticles,
    importFile,
    exportCsv,
    refetch,
  } = useArticleCatalog({ adminTenantId });

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<ArticleCatalogItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingArticle, setDeletingArticle] = useState<ArticleCatalogItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // Selection state for bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Clear selection when search changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search]);

  // Clear selection when page changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page]);

  const allVisibleSelected =
    articles.length > 0 && articles.every((a) => selectedIds.has(a.id));

  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = useCallback(() => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(articles.map((a) => a.id)));
    }
  }, [allVisibleSelected, articles]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const totalPages = Math.ceil(total / pageSize);

  const handleAddNew = useCallback(() => {
    setEditingArticle(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((article: ArticleCatalogItem) => {
    setEditingArticle(article);
    setFormOpen(true);
  }, []);

  const handleDeleteClick = useCallback((article: ArticleCatalogItem) => {
    setDeletingArticle(article);
    setDeleteDialogOpen(true);
  }, []);

  const handleSave = useCallback(
    async (
      data: CreateArticleInput | UpdateArticleInput,
      isNew: boolean,
      articleId?: string
    ) => {
      if (isNew) {
        const result = await createArticle(data as CreateArticleInput);
        if (result.ok) {
          toast.success("Artikel wurde erstellt.");
        }
        return result;
      } else if (articleId) {
        const result = await updateArticle(articleId, data as UpdateArticleInput);
        if (result.ok) {
          toast.success("Artikel wurde aktualisiert.");
        }
        return result;
      }
      return { ok: false, error: "Keine Artikel-ID." };
    },
    [createArticle, updateArticle]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingArticle) return { ok: false, error: "Kein Artikel ausgewaehlt." };
    const result = await deleteArticle(deletingArticle.id);
    if (result.ok) {
      toast.success("Artikel wurde geloescht.");
    }
    return result;
  }, [deletingArticle, deleteArticle]);

  const handleBulkDeleteConfirm = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const result = await bulkDeleteArticles(ids);
    if (result.ok) {
      const deleted = result.deleted ?? ids.length;
      const skipped = ids.length - deleted;
      if (skipped > 0) {
        toast.warning(
          `${deleted} von ${ids.length} Artikeln gelöscht. ${skipped} konnten nicht gefunden werden.`
        );
      } else {
        toast.success(`${deleted} Artikel gelöscht.`);
      }
      setSelectedIds(new Set());
    }
    return result;
  }, [selectedIds, bulkDeleteArticles]);

  const handleImport = useCallback(
    async (file: File) => {
      const result = await importFile(file);
      if (result.ok && result.data) {
        const { created, updated, skipped } = result.data;
        toast.success(
          `Import abgeschlossen: ${created} neu, ${updated} aktualisiert${
            skipped > 0 ? `, ${skipped} uebersprungen` : ""
          }.`
        );
      }
      return result;
    },
    [importFile]
  );

  const handleExport = useCallback(async () => {
    await exportCsv();
    toast.success("Artikelstamm wurde als CSV exportiert.");
  }, [exportCsv]);

  const handleDownloadSample = useCallback(() => {
    const BOM = "\uFEFF";
    const header =
      "Herst.-Art.-Nr.;Artikelbezeichnung;Kategorie;Farbe / Shade;Verpackungseinheit;Groesse 1;Groesse 2;Ref.-Nr.;GTIN / EAN;Suchbegriffe / Aliase";
    const row1 =
      "12345;Komposit Venus Pearl A2;Komposit;A2;10 Stk.;4g;;VP-A2;4012239123456;Venus, Venus Pearl, Heraeus";
    const row2 =
      "67890;Adhaesiv iBOND Universal;Adhaesiv;;;5ml;;IB-UNI;;iBOND, i-Bond, Adhaesiv Universal";
    const content = BOM + [header, row1, row2].join("\n");

    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "artikelstamm-muster.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // Truncate text with ellipsis for table cells
  const truncate = (text: string | null, maxLen: number) => {
    if (!text) return null;
    return text.length > maxLen ? text.substring(0, maxLen) + "..." : text;
  };

  return (
    <div className="space-y-4">
      {/* Page heading (only in full-page mode) */}
      {!compact && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Artikelstamm</h1>
          <p className="text-muted-foreground">
            Verwalten Sie den Artikelkatalog Ihres Unternehmens.
          </p>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}{" "}
            <Button variant="link" className="h-auto p-0" onClick={refetch}>
              Erneut versuchen
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Artikel suchen"
          />
        </div>

        {/* Action buttons */}
        {!readOnly && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" variant="outline" size="sm" onClick={handleDownloadSample}>
              <FileDown className="mr-2 h-4 w-4" />
              Muster herunterladen
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Importieren
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={total === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportieren
            </Button>
            <Button type="button" size="sm" onClick={handleAddNew}>
              <Plus className="mr-2 h-4 w-4" />
              Artikel hinzufuegen
            </Button>
          </div>
        )}
      </div>

      {/* Article count & selection toolbar */}
      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {someSelected ? (
              <span className="font-medium text-foreground">
                {selectedIds.size} Artikel ausgewaehlt
              </span>
            ) : (
              <>
                {total} Artikel{total !== 1 ? "" : ""}
                {search && ` fuer "${search}"`}
              </>
            )}
          </p>
          {someSelected && !readOnly && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Auswahl loeschen
            </Button>
          )}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && articles.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package className="h-12 w-12 text-muted-foreground/30 mb-4" />
          {search ? (
            <>
              <p className="text-sm font-medium">Keine Artikel gefunden</p>
              <p className="text-sm text-muted-foreground mt-1">
                Fuer &quot;{search}&quot; wurden keine Artikel gefunden.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Noch keine Artikel vorhanden</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                {readOnly
                  ? "Der Artikelstamm ist leer. Kontaktieren Sie Ihren Administrator."
                  : "Fuegen Sie Artikel einzeln hinzu oder importieren Sie eine CSV-/Excel-Datei, um den Artikelstamm zu befuellen."}
              </p>
              {!readOnly && (
                <div className="flex gap-2 mt-4">
                  <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                    <Upload className="mr-2 h-4 w-4" />
                    CSV/Excel importieren
                  </Button>
                  <Button type="button" size="sm" onClick={handleAddNew}>
                    <Plus className="mr-2 h-4 w-4" />
                    Artikel hinzufuegen
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Article table */}
      {!isLoading && articles.length > 0 && (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {!readOnly && (
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Alle sichtbaren Artikel auswaehlen"
                      />
                    </TableHead>
                  )}
                  <TableHead className="min-w-[140px]">Herst.-Art.-Nr.</TableHead>
                  <TableHead className="min-w-[200px]">Artikelbezeichnung</TableHead>
                  <TableHead className="hidden md:table-cell">Kategorie</TableHead>
                  <TableHead className="hidden lg:table-cell">Farbe</TableHead>
                  <TableHead className="hidden lg:table-cell">Verpackung</TableHead>
                  <TableHead className="hidden xl:table-cell">Ref.-Nr.</TableHead>
                  <TableHead className="hidden xl:table-cell">GTIN</TableHead>
                  <TableHead className="hidden xl:table-cell">Suchbegriffe</TableHead>
                  {!readOnly && <TableHead className="w-[80px] text-right">Aktionen</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {articles.map((article) => (
                  <TableRow
                    key={article.id}
                    data-state={selectedIds.has(article.id) ? "selected" : undefined}
                  >
                    {!readOnly && (
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(article.id)}
                          onCheckedChange={() => toggleSelect(article.id)}
                          aria-label={`Artikel ${article.article_number} auswaehlen`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      {article.article_number}
                    </TableCell>
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="line-clamp-1">
                              {article.name}
                            </span>
                          </TooltipTrigger>
                          {article.name.length > 40 && (
                            <TooltipContent>
                              <p className="max-w-xs">{article.name}</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {article.category ? (
                        <Badge variant="secondary">{truncate(article.category, 20)}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {article.color ?? <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {article.packaging ?? <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {article.ref_no ?? <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-xs font-mono">
                      {article.gtin ?? <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {article.keywords ? (
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {truncate(article.keywords, 30)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    {!readOnly && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(article)}
                            aria-label={`Artikel ${article.article_number} bearbeiten`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteClick(article)}
                            aria-label={`Artikel ${article.article_number} loeschen`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Seite {page} von {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Zurueck
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                >
                  Weiter
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      <ArticleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        article={editingArticle}
        onSave={handleSave}
      />

      <ArticleDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        articleNumber={deletingArticle?.article_number ?? ""}
        articleName={deletingArticle?.name ?? ""}
        onConfirm={handleDeleteConfirm}
      />

      <ArticleImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={handleImport}
      />

      <ArticleBulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        count={selectedIds.size}
        onConfirm={handleBulkDeleteConfirm}
      />
    </div>
  );
}
