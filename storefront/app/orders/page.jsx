import OrderHistoryView from "@/components/orders/OrderHistoryView";

export const metadata = {
  title: "Order History",
  robots: { index: false },
};

export default function OrdersPage() {
  return <OrderHistoryView />;
}
