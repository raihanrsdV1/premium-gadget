import { Suspense } from "react";
import LoginView from "@/components/auth/LoginView";

export const metadata = {
  title: "Sign In",
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginView />
    </Suspense>
  );
}
