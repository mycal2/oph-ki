import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { EnvironmentBanner } from "@/components/environment-banner";
import "./globals.css";

export const metadata: Metadata = {
  title: "IDS.online",
  description:
    "Das digitale Portal für die dentale Community - Bestellungsverarbeitung und Automatisierung.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // OPH-98: Resolve the active locale (cookie → Accept-Language → "de") and
  // load the matching messages bundle. Wrap the entire app in the provider
  // so both server and client components can call `useTranslations()` /
  // `getTranslations()` without further plumbing.
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <EnvironmentBanner />
          {children}
          <Toaster richColors />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
