import CatMascot from "@/components/ui/CatMascot";
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";

// Styled 404 rendered inside the shared shell (layout wraps it).
export default function NotFound() {
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center py-12 text-center">
      <CatMascot size={220} priority />
      <p className="mt-4 font-display text-6xl font-extrabold text-primary sm:text-7xl">404</p>
      <h1 className="mt-2 font-display text-2xl font-extrabold">This page wandered off</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has moved. Let&apos;s get you back to the good stuff.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/" className={buttonClass({ size: "lg" })}>Back to home</Link>
        <Link href="/products" className={buttonClass({ variant: "outline", size: "lg" })}>Browse products</Link>
      </div>
    </div>
  );
}
