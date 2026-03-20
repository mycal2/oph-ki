import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { EnvironmentBanner } from "@/components/environment-banner";
import "./globals.css";

export const metadata: Metadata = {
  title: "IDS.online",
  description:
    "Das digitale Portal für die dentale Community - Bestellungsverarbeitung und Automatisierung.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className="antialiased">
        <EnvironmentBanner />
        {children}
        <Toaster richColors />
      </body>
    </html>
  );
}
