"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDispatch } from "react-redux";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import AuthShell from "./AuthShell";
import { setCredentials } from "@/store/slices/authSlice";
import { login } from "@/lib/api/auth";

// Ported from frontend/src/pages/Login.jsx (RTK mutation -> lib/api login()).
export default function LoginView() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const dispatch = useDispatch();
  const sessionExpired = useSearchParams().get("session") === "expired";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const result = await login({ phone, password });
      dispatch(setCredentials({ user: result.data.user, token: result.data.token }));
      const role = result.data.user?.role;
      router.push(role === "super_admin" || role === "branch_admin" ? "/admin" : "/");
    } catch (err) {
      setError(err.data?.message || "Invalid phone number or password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Enter your phone and password to sign in"
      benefits={["Faster checkout with your details saved", "Track your orders and repairs", "Keep a wishlist of what you want"]}
    >
      {sessionExpired && !error && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-amber-400/50 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Your session expired. Please sign in again.
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-bold" htmlFor="phone">Phone number</label>
          <Input id="phone" placeholder="017XXXXXXXX" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isLoading} required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold" htmlFor="password">Password</label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} required />
        </div>
        <Button className="w-full" size="lg" type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign in
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-bold text-primary underline-offset-4 hover:underline">Sign up</Link>
      </p>
    </AuthShell>
  );
}
