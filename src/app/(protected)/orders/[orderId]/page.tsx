import type { Metadata } from "next";
import { OrderDetailContent } from "@/components/orders/order-detail-content";

export const metadata: Metadata = {
  title: "Bestelldetails",
};

interface OrderDetailPageProps {
  params: Promise<{ orderId: string }>;
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { orderId } = await params;

  return <OrderDetailContent orderId={orderId} />;
}
