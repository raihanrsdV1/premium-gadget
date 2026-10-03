import Link from "next/link";
import { X } from "lucide-react";
import ProductCard from "@/components/product/ProductCard";
import Img from "@/components/ui/Img";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import CatEmpty from "@/components/ui/CatEmpty";
import JsonLd from "@/components/seo/JsonLd";
import { ListingSidebar, ListingToolbar } from "./ListingControls";
import { CONDITION_LABELS, listingHref } from "@/lib/listing";
import { absoluteUrl, formatBDT } from "@/lib/seo";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/structuredData";
import { PAGE_SIZE } from "@/lib/listing";

/** Active filter chips: [{ label, href }] where href removes just that filter. */
function activeChips(basePath, params, facets, hide) {
  const chips = [];
  const drop = (patch) => listingHref(basePath, params, { ...patch, page: 1 });
  if (!hide.category && params.category) {
    const c = facets.categories?.find((x) => x.slug === params.category);
    chips.push({ label: c?.name || params.category, href: drop({ category: undefined }) });
  }
  if (!hide.brand && params.brand) {
    const b = facets.brands?.find((x) => x.slug === params.brand);
    chips.push({ label: b?.name || params.brand, href: drop({ brand: undefined }) });
  }
  if (params.condition) chips.push({ label: CONDITION_LABELS[params.condition] || params.condition, href: drop({ condition: undefined }) });
  if (params.min_price !== undefined || params.max_price !== undefined) {
    const lo = params.min_price !== undefined ? formatBDT(params.min_price) : null;
    const hi = params.max_price !== undefined ? formatBDT(params.max_price) : null;
    chips.push({ label: lo && hi ? `${lo} - ${hi}` : lo ? `From ${lo}` : `Up to ${hi}`, href: drop({ min_price: undefined, max_price: undefined }) });
  }
  if (params.instock) chips.push({ label: "In stock", href: drop({ instock: undefined }) });
  return chips;
}

function Pagination({ basePath, params, pagination }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages } = pagination;
  // Window of pages around the current one, with first/last kept.
  const nums = [...new Set([1, page - 1, page, page + 1, totalPages].filter((n) => n >= 1 && n <= totalPages))].sort((a, b) => a - b);
  const item = "flex h-10 min-w-10 items-center justify-center rounded-full border-[1.5px] px-3 text-sm font-bold transition-colors";
  return (
    <nav aria-label="Pagination" className="mt-10">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        <li>
          {pagination.hasPrev ? (
            <Link href={listingHref(basePath, params, { page: page - 1 })} rel="prev" className={`${item} border-foreground/25 hover:bg-accent`}>Previous</Link>
          ) : (
            <span className={`${item} border-border text-muted-foreground opacity-60`} aria-disabled="true">Previous</span>
          )}
        </li>
        {nums.map((n, i) => (
          <li key={n} className="flex items-center gap-2">
            {i > 0 && n - nums[i - 1] > 1 && <span className="text-muted-foreground" aria-hidden="true">...</span>}
            <Link
              href={listingHref(basePath, params, { page: n })}
              aria-current={n === page ? "page" : undefined}
              aria-label={`Page ${n}`}
              className={`${item} ${n === page ? "border-primary bg-primary text-primary-foreground" : "border-foreground/25 hover:bg-accent"}`}
            >
              {n}
            </Link>
          </li>
        ))}
        <li>
          {pagination.hasNext ? (
            <Link href={listingHref(basePath, params, { page: page + 1 })} rel="next" className={`${item} border-foreground/25 hover:bg-accent`}>Next</Link>
          ) : (
            <span className={`${item} border-border text-muted-foreground opacity-60`} aria-disabled="true">Next</span>
          )}
        </li>
      </ul>
    </nav>
  );
}

/**
 * Shared listing: /products, /categories/[slug], /brands/[slug], /collections/[slug].
 * Server-rendered; only the filter controls are client components. Filter state
 * is in the URL (`params`, from parseListingParams).
 *
 * @param {object} props
 * @param {string} props.basePath      route the filters navigate within
 * @param {object} props.params        parsed params
 * @param {string} props.heading
 * @param {string} [props.eyebrow]     small label above the heading
 * @param {string} [props.description]
 * @param {string} [props.bannerUrl]
 * @param {React.ReactNode} [props.headerExtra]  e.g. a countdown
 * @param {{name:string,path:string}[]} props.breadcrumbs  includes Home and current page
 * @param {{categories?:object[],brands?:object[]}} [props.facets]
 * @param {{category?:boolean,brand?:boolean}} [props.hide]  facets fixed by the route
 * @param {{name:string,slug:string}[]} [props.children_]  sub-category links (category pages)
 * @param {boolean} [props.showFilters=false]
 */
export default function ListingPage({
  basePath,
  params,
  heading,
  eyebrow,
  description,
  bannerUrl,
  headerExtra,
  breadcrumbs,
  products,
  pagination,
  failed,
  facets = {},
  hide = {},
  subLinks = [],
  conditionTabs = [],
  showFilters = true,
  sortOptions,
  jsonLdType = "CollectionPage",
  emptyAction,
  footer,
}) {
  const chips = activeChips(basePath, params, facets, hide);
  const canonical = absoluteUrl(listingHref(basePath, { page: params.page }));
  const total = pagination?.total ?? products.length;

  const collectionLd = {
    "@context": "https://schema.org",
    "@type": jsonLdType,
    name: heading,
    url: canonical,
    ...(description ? { description } : {}),
  };

  return (
    <div className="container py-5 sm:py-8">
      <JsonLd data={breadcrumbJsonLd(breadcrumbs)} />
      <JsonLd data={collectionLd} />
      {products.length > 0 && (
        <JsonLd data={itemListJsonLd({ name: heading, url: canonical, products, offset: ((pagination?.page || params.page) - 1) * PAGE_SIZE })} />
      )}

      <Breadcrumbs items={breadcrumbs} className="mb-4" />

      <header className="relative mb-6 overflow-hidden rounded-3xl bg-navy text-navy-foreground sm:mb-8">
        {bannerUrl && (
          <>
            <Img src={bannerUrl} alt="" fill sizes="100vw" priority className="object-cover opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/80 to-transparent" aria-hidden="true" />
          </>
        )}
        <div className="relative flex flex-col gap-3 px-5 py-7 sm:px-9 sm:py-10">
          {eyebrow && <span className="w-fit rounded-full bg-white/12 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#C9D3F5]">{eyebrow}</span>}
          <h1 className="text-display text-white">{heading}</h1>
          {description && <p className="max-w-2xl text-sm leading-relaxed text-[#DCE3FA] sm:text-base">{description}</p>}
          {headerExtra}
          {subLinks.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-2" aria-label="Sub-categories">
              {subLinks.map((s) => (
                <li key={s.slug}>
                  <Link href={s.href} className="inline-flex h-9 items-center rounded-full bg-white/12 px-4 text-sm font-semibold text-white hover:bg-white/25">{s.name}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {conditionTabs.length > 1 && (
        <nav aria-label="Condition" className="mb-5">
          <ul className="inline-flex max-w-full flex-wrap gap-1 rounded-full bg-tint p-1">
            {[{ code: undefined, label: "All", count: conditionTabs.reduce((n, c) => n + (c.count || 0), 0) }, ...conditionTabs].map((c) => {
              const on = params.condition === c.code;
              return (
                <li key={c.code || "all"}>
                  <Link
                    href={listingHref(basePath, params, { condition: c.code, page: 1 })}
                    aria-current={on ? "true" : undefined}
                    className={`inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition-colors ${on ? "bg-primary text-primary-foreground shadow-card" : "text-foreground hover:bg-white"}`}
                  >
                    {c.label}
                    {c.count > 0 && <span className={`text-xs font-semibold ${on ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{c.count}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <div className="flex gap-8">
        {showFilters && <ListingSidebar basePath={basePath} params={params} facets={facets} hide={hide} activeCount={chips.length} />}

        <div className="min-w-0 flex-1">
          <ListingToolbar
            basePath={basePath}
            params={params}
            facets={facets}
            hide={hide}
            total={failed ? null : total}
            activeCount={chips.length}
            showFilters={showFilters}
            sortOptions={sortOptions}
          />

          {chips.length > 0 && (
            <ul className="mt-3 flex flex-wrap items-center gap-2" aria-label="Active filters">
              {chips.map((c) => (
                <li key={c.label}>
                  <Link href={c.href} scroll={false} aria-label={`Remove filter ${c.label}`} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-tint pl-3 pr-2 text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground">
                    {c.label} <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </li>
              ))}
              <li>
                <Link href={listingHref(basePath, {}, { sort: params.sort })} scroll={false} className="px-1 text-xs font-bold text-muted-foreground underline-offset-4 hover:underline">Clear all</Link>
              </li>
            </ul>
          )}

          <div className="mt-5">
            {failed ? (
              <CatEmpty title="We couldn't load products" text="Something went wrong on our side. Please try again in a moment." action={{ href: basePath, label: "Try again" }} />
            ) : products.length === 0 ? (
              chips.length > 0 ? (
                <CatEmpty
                  title="No matches for those filters"
                  text="Try removing a filter or widening the price range."
                  action={{ href: listingHref(basePath, {}, { sort: params.sort }), label: "Clear filters" }}
                  secondary={{ href: "/products", label: "Browse everything" }}
                />
              ) : (
                <CatEmpty
                  title="Nothing here yet"
                  text="New stock arrives often. Message us on WhatsApp and we will find what you need."
                  action={emptyAction || { href: "/products", label: "Browse all products" }}
                />
              )
            ) : (
              <ul className={`grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 ${showFilters ? "2xl:grid-cols-4" : "lg:grid-cols-4"}`}>
                {products.map((p, i) => (
                  <li key={p.id}><ProductCard product={p} priority={i < 2} /></li>
                ))}
              </ul>
            )}
          </div>

          <Pagination basePath={basePath} params={params} pagination={pagination} />
        </div>
      </div>

      {footer}
    </div>
  );
}
