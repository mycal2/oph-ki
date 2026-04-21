"use client";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopNavigation } from "@/components/layout/top-navigation";
import { PlatformTenantContextProvider } from "@/context/platform-tenant-context";

interface AppLayoutProps {
  children: React.ReactNode;
  defaultSidebarOpen?: boolean;
}

export function AppLayout({ children, defaultSidebarOpen = true }: AppLayoutProps) {
  return (
    <PlatformTenantContextProvider>
      <SidebarProvider defaultOpen={defaultSidebarOpen}>
        <AppSidebar />
        <div className="flex min-h-svh flex-1 flex-col">
          <TopNavigation />
          <main className="flex-1 bg-secondary/50">
            <div className="container mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
              {children}
            </div>
          </main>
        </div>
      </SidebarProvider>
    </PlatformTenantContextProvider>
  );
}
