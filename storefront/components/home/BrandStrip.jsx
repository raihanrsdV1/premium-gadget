import Link from "next/link";
import Img from "@/components/ui/Img";

/** Brand tiles (logo, or the name when there's no logo) linking to that brand's products. */
export default function BrandStrip({ brands = [] }) {
  const list = brands.filter((b) => b.slug).slice(0, 12);
  if (!list.length) return null;
  return (
    <section aria-labelledby="home-brands" className="container">
      <h2 id="home-brands" className="text-title mb-4 sm:mb-6">Shop by brand</h2>
      <ul className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {list.map((b) => (
          <li key={b.slug} className="shrink-0">
            <Link href={`/brands/${encodeURIComponent(b.slug)}`} title={b.name} className="relative flex h-16 w-32 items-center justify-center rounded-2xl border border-border bg-white px-3 text-center text-sm font-extrabold text-slate-800 transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-pop sm:w-36">
              {b.logo_url ? <Img src={b.logo_url} alt={b.name} fill sizes="144px" className="object-contain p-3" /> : b.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
