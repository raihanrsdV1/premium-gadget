import { Suspense } from "react";
import OrderSuccessView from "@/components/orders/OrderSuccessView";

export const metadata = {
  title: "Order Confirmed",
  robots: { index: false },
};

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={null}>
      <OrderSuccessView />
    </Suspense>
  );
}
