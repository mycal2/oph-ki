import type { Metadata } from "next";
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
