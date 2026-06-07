import OrderSuccessView from "@/components/orders/OrderSuccessView";

export const metadata = {
  title: "Order Confirmed",
  robots: { index: false },
};

export default function OrderSuccessPage() {
  return <OrderSuccessView />;
}
