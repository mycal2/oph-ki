import type { Metadata } from "next";
import { ReviewPageContent } from "@/components/orders/review";

export const metadata: Metadata = {
  title: "Bestellung prüfen | IDS.online",
  description: "Extrahierte Bestelldaten prüfen und korrigieren.",
};

interface ReviewPageProps {
  params: Promise<{ orderId: string }>;
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const { orderId } = await params;

  return <ReviewPageContent orderId={orderId} />;
}
