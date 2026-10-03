import Link from "next/link";
import CategoryIcon from "@/components/ui/CategoryIcon";

const FALLBACK = [
  { slug: "laptops", name: "Laptops", href: "/categories/laptops" },
  { slug: "accessories", name: "Accessories", href: "/categories/accessories" },
  { slug: "used", name: "Used laptops", href: "/products?condition=used" },
  { slug: "repairs", name: "Repairs", href: "/repairs" },
];

/** Category tiles from the menu's top-level categories, plus the used-laptop shortcut. */
export default function CategoryTiles({ categories = [] }) {
  const tiles = categories.length
    ? [{ slug: "used", name: "Used laptops", href: "/products?condition=used" }, ...categories.slice(0, 5).map((c) => ({ slug: c.slug, name: c.name, href: `/categories/${encodeURIComponent(c.slug)}` }))]
    : FALLBACK;
  return (
    <section aria-labelledby="home-cats" className="container">
      <h2 id="home-cats" className="text-title mb-4 sm:mb-6">Find your next device</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
        {tiles.map((t) => (
          <li key={t.slug}>
            <Link href={t.href} className="pg-card flex h-full flex-col gap-3 rounded-[22px] pg-glass p-4 font-bold sm:gap-4 sm:p-5">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background text-primary"><CategoryIcon slug={t.slug} name={t.name} className="h-6 w-6" /></span>
              <span className="text-[15px] leading-tight">{t.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
