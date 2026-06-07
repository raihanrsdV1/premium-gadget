"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Client-side auth guard for protected pages. Checks the persisted token in
 * localStorage on mount (the source of truth that StoreProvider hydrates from),
 * which avoids the Redux hydration race. Redirects to /login if absent.
 *
 * @returns {boolean} ready - true once an authenticated user is confirmed
 *   (use it to gate rendering of protected content).
 */
export function useRequireAuth() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      router.replace("/login");
    } else {
      setReady(true);
    }
  }, [router]);

  return ready;
}
