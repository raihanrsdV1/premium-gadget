import Link from "next/link";
import { ArrowRight, Battery, Camera, ClipboardCheck, PackageOpen, Sparkles } from "lucide-react";

const POINTS = [
  { icon: ClipboardCheck, text: "A clear condition grade" },
  { icon: Battery, text: "Battery health and charge cycles" },
  { icon: Sparkles, text: "Honest cosmetic notes" },
  { icon: Camera, text: "Photos of the exact unit you buy" },
  { icon: PackageOpen, text: "What's in the box" },
];

/** Teaser for the used-laptop condition report (our defining feature). The sample card is illustrative. */
export default function ConditionTeaser() {
  return (
    <section aria-labelledby="home-cond" className="container">
      <div className="grid items-center gap-8 rounded-[28px] bg-tint p-6 sm:p-10 lg:grid-cols-2 lg:gap-14">
        <div className="flex flex-col gap-4">
          <span className="self-start rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">Used laptops, no surprises</span>
          <h2 id="home-cond" className="text-title">See exactly what you&apos;re buying</h2>
          <p className="max-w-lg leading-relaxed text-muted-foreground">Every used laptop comes with a condition report, so you know its grade, battery and wear before you pay.</p>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5 text-sm font-semibold"><Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />{text}</li>
            ))}
          </ul>
          <Link href="/products?condition=used" className="mt-2 inline-flex h-12 items-center gap-2 self-start rounded-full bg-coral px-7 text-sm font-extrabold text-coral-foreground hover:bg-coral/85">
            Browse used laptops <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <figure className="mx-auto w-full max-w-md" aria-label="Sample condition report layout">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-pop sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display text-lg font-extrabold">Condition report</span>
              <span className="rounded-full bg-tint px-2.5 py-1 text-xs font-bold text-primary">Sample</span>
            </div>
            <dl className="divide-y divide-border text-sm">
              {[["Grade", "A"], ["Battery health", "89%"], ["Charge cycles", "212"], ["Cosmetics", "Light wear on the lid"], ["In the box", "Laptop + charger"]].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4 py-2.5"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-bold">{v}</dd></div>
              ))}
            </dl>
          </div>
          <figcaption className="mt-2 text-center text-xs text-muted-foreground">Example layout. Real values are shown on each product page.</figcaption>
        </figure>
      </div>
    </section>
  );
}
