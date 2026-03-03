import type { Metadata } from "next";
import { PreviewPageContent } from "@/components/orders/preview/preview-page-content";

interface PreviewPageProps {
  params: Promise<{ token: string }>;
}

export const metadata: Metadata = {
  title: "Bestellvorschau | IDS.online",
  description: "Vorschau der extrahierten Bestelldaten.",
};

export default async function OrderPreviewPage({ params }: PreviewPageProps) {
  const { token } = await params;

  return <PreviewPageContent token={token} />;
}
