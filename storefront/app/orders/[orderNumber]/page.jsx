import OrderDetailView from "@/components/orders/OrderDetailView";

export const metadata = {
  title: "Order Details",
  robots: { index: false },
};

export default async function OrderDetailPage({ params }) {
  const { orderNumber } = await params;
  return <OrderDetailView orderNumber={orderNumber} />;
}
