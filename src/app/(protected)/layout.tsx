import { cookies } from "next/headers";
import { AppLayout } from "@/components/layout/app-layout";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sidebarCookie = cookieStore.get("sidebar_state");
  // Default to expanded (true) if no cookie is set
  const defaultSidebarOpen = sidebarCookie ? sidebarCookie.value === "true" : true;

  return <AppLayout defaultSidebarOpen={defaultSidebarOpen}>{children}</AppLayout>;
}
