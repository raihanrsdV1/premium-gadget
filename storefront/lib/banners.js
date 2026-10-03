import { safeUrl, toNumber } from "@/lib/seo";

const SAFE_PATH = /^\/(?!\/)/;

/**
 * GET /banners rows → plain slide/card objects for client components.
 * Links and images are re-checked (only site paths and http(s) URLs get
 * through). Product banners carry the live price.
 */
export function toBannerSlides(banners) {
  return (banners || [])
    .map((b) => {
      const p = b.type === "product" ? b.product : null;
      const link = safeUrl(b.link_url) || (p?.slug ? `/products/${p.slug}` : "/products");
      const price = p ? toNumber(p.price) : null;
      const compareAt = p ? toNumber(p.compare_at_price) : null;
      return {
        id: String(b.id),
        kind: p ? "product" : "custom",
        title: b.title || p?.name || "",
        subtitle: b.subtitle || "",
        badge: b.badge || (p?.is_on_sale ? "On sale" : null),
        image: safeUrl(b.image_url),
        mobileImage: safeUrl(b.mobile_image_url),
        href: link,
        external: !SAFE_PATH.test(link),
        ctaLabel: b.cta_label || (p ? "Buy now" : "Shop now"),
        price,
        compareAt: price !== null && compareAt !== null && compareAt > price ? compareAt : null,
      };
    })
    .filter((s) => s.title || s.image);
}
