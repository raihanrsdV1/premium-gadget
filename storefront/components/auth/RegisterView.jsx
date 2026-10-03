"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import AuthShell from "./AuthShell";
import { setCredentials } from "@/store/slices/authSlice";
import { register as registerApi } from "@/lib/api/auth";

const BENEFITS = [
  "Faster checkout with your details saved",
  "Track your orders and repairs",
  "Keep a wishlist of what you want",
];

// Ported from frontend/src/pages/Register.jsx.
export default function RegisterView() {
  const [formData, setFormData] = useState({ fullName: "", phone: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const dispatch = useDispatch();

  const handleChange = (e) => setFormData({ ...formData, [e.target.id]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setIsLoading(true);
    try {
      const result = await registerApi({
        full_name: formData.fullName,
        phone: formData.phone,
        email: formData.email || undefined,
        password: formData.password,
      });
      dispatch(setCredentials({ user: result.data.user, token: result.data.token }));
      router.push("/");
    } catch (err) {
      setError(err.data?.message || "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const label = "text-sm font-bold";
  return (
    <AuthShell
      title="Create an account"
      subtitle="Enter your details below to create your account"
      benefits={BENEFITS}
    >
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className={label} htmlFor="fullName">Full name <span className="text-destructive">*</span></label>
          <Input id="fullName" placeholder="Your full name" autoComplete="name" disabled={isLoading} value={formData.fullName} onChange={handleChange} required />
        </div>
        <div className="space-y-2">
          <label className={label} htmlFor="phone">Phone number <span className="text-destructive">*</span></label>
          <Input id="phone" placeholder="017XXXXXXXX" type="tel" autoComplete="tel" disabled={isLoading} value={formData.phone} onChange={handleChange} required />
        </div>
        <div className="space-y-2">
          <label className={label} htmlFor="email">Email <span className="font-normal text-muted-foreground">(optional)</span></label>
          <Input id="email" placeholder="you@example.com" type="email" autoComplete="email" disabled={isLoading} value={formData.email} onChange={handleChange} />
        </div>
        <div className="space-y-2">
          <label className={label} htmlFor="password">Password <span className="text-destructive">*</span></label>
          <Input id="password" type="password" autoComplete="new-password" placeholder="Min. 6 characters" disabled={isLoading} value={formData.password} onChange={handleChange} required />
        </div>
        <Button className="mt-2 w-full" size="lg" type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Create account
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-primary underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
