"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import { ArticleCatalogPage } from "@/components/article-catalog/article-catalog-page";

export default function ArticleCatalogSettingsPage() {
  const { isLoading: isLoadingRole, role } = useCurrentUserRole();

  if (isLoadingRole) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-80 mt-2" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Only tenant_admin and platform_admin can manage the catalog
  if (role !== "tenant_admin" && role !== "platform_admin") {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Zugriff verweigert. Nur fuer Administratoren.
        </p>
      </div>
    );
  }

  return <ArticleCatalogPage />;
}
