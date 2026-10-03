import Image from "next/image";
import { CheckCircle } from "lucide-react";
import BrandLogo from "@/components/ui/BrandLogo";
import CatMascot from "@/components/ui/CatMascot";

/** Two-column auth layout: form on the left, a navy brand panel (cat + benefits) from lg up. */
export default function AuthShell({ title, subtitle, benefits, children }) {
  return (
    <div className="container py-6 sm:py-10">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-border bg-card shadow-card lg:grid-cols-2">
        <div className="flex flex-col justify-center px-5 py-8 sm:px-10 sm:py-12">
          <div className="mx-auto w-full max-w-sm space-y-6">
            <div className="space-y-2">
              <h1 className="text-display">{title}</h1>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            {children}
          </div>
        </div>
        <div className="relative hidden flex-col justify-center gap-6 bg-navy p-10 text-navy-foreground lg:flex">
          <BrandLogo onDark markClassName="h-14 w-14" textClassName="text-2xl" />
          <CatMascot size={150} className="self-start" />
          <ul className="space-y-3">
            {benefits.map((b) => (
              <li key={b} className="flex items-center gap-3 text-[#DCE3FA]">
                <CheckCircle className="h-5 w-5 shrink-0 text-[#F7A399]" aria-hidden="true" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
