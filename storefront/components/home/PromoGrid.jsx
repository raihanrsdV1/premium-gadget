import Link from "next/link";
import Img from "@/components/ui/Img";

/** Promo banners (GET /banners?placement=promo): 1, 2 or 3-up grid; renders nothing when empty. */
export default function PromoGrid({ banners = [] }) {
  const items = banners.slice(0, 6);
  if (!items.length) return null;
  const cols = items.length === 1 ? "" : items.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <section aria-label="Promotions" className="container">
      <ul className={`grid gap-3 sm:gap-5 ${cols}`}>
        {items.map((b) => {
          const inner = (
            <>
              {b.image && <Img src={b.image} alt="" fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 92vw" className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.04]" />}
              <span className="absolute inset-0 bg-gradient-to-t from-[#12205A]/90 via-[#12205A]/35 to-transparent" aria-hidden="true" />
              <span className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-1 p-5 text-white">
                {b.badge && <span className="rounded-full bg-coral px-2.5 py-1 text-[11px] font-extrabold text-coral-foreground">{b.badge}</span>}
                <span className="font-display text-xl font-extrabold leading-tight">{b.title}</span>
                {b.subtitle && <span className="line-clamp-2 text-sm text-white/85">{b.subtitle}</span>}
                <span className="mt-1 text-sm font-bold underline underline-offset-4">{b.ctaLabel}</span>
              </span>
            </>
          );
          const cls = "pg-card group relative block aspect-[16/9] overflow-hidden rounded-3xl bg-navy sm:aspect-[4/3] lg:aspect-[16/10]";
          return (
            <li key={b.id}>
              {b.external ? <a href={b.href} rel="noopener noreferrer" className={cls}>{inner}</a> : <Link href={b.href} className={cls}>{inner}</Link>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
