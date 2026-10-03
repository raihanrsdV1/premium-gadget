import { SITE, organizationId } from "@/lib/site";
import {
  SITE_URL,
  absoluteUrl,
  conditionOf,
  safeUrl,
  specGroupsOf,
  toNumber,
} from "@/lib/seo";

/**
 * Schema.org builders. Output goes through components/seo/JsonLd (which
 * escapes it for a <script> tag); keep values plain data here.
 */

const BDT = "BDT";
const inStockUrl = (available) =>
  available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";

/** Reference to the shop's Organization node (defined once in the root layout). */
export const sellerJsonLd = () => ({
  "@type": "Organization",
  "@id": organizationId(SITE_URL),
  name: SITE.name,
  url: SITE_URL,
});

export function breadcrumbJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  };
}

/** "1-2 days" → { min: 1, max: 2 }. */
function parseEta(eta) {
  const m = /(\d+)\s*(?:-|–|to)?\s*(\d+)?\s*day/i.exec(String(eta || ""));
  if (!m) return null;
  const min = Number(m[1]);
  return { min, max: m[2] ? Number(m[2]) : min };
}

/**
 * OfferShippingDetails for Bangladesh, one per delivery zone in /settings.
 * @returns {object[]|undefined}
 */
export function shippingDetailsJsonLd(settings) {
  const zones = settings?.shipping?.zones;
  if (!Array.isArray(zones) || !zones.length) return undefined;
  const details = zones
    .filter((z) => toNumber(z?.fee) !== null)
    .map((z) => {
      const districts = Array.isArray(z.districts) ? z.districts.filter(Boolean) : [];
      const eta = parseEta(z.eta);
      return {
        "@type": "OfferShippingDetails",
        ...(z.label ? { shippingLabel: String(z.label) } : {}),
        shippingRate: { "@type": "MonetaryAmount", value: toNumber(z.fee), currency: BDT },
        shippingDestination: {
          "@type": "DefinedRegion",
          addressCountry: "BD",
          ...(districts.length ? { addressRegion: districts.map(String) } : {}),
        },
        ...(eta
          ? {
              deliveryTime: {
                "@type": "ShippingDeliveryTime",
                transitTime: { "@type": "QuantitativeValue", minValue: eta.min, maxValue: eta.max, unitCode: "DAY" },
              },
            }
          : {}),
      };
    });
  return details.length ? details : undefined;
}

function warrantyJsonLd(product) {
  const months = toNumber(product.warranty_months);
  if (!months || months <= 0) return undefined;
  return {
    "@type": "WarrantyPromise",
    durationOfWarranty: { "@type": "QuantitativeValue", value: months, unitCode: "MON" },
    ...(product.warranty_notes ? { description: String(product.warranty_notes) } : {}),
  };
}

const isoDate = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : undefined;
};

/** Every spec as a PropertyValue, plus the used-device facts agents ask about. */
function additionalProperties(product) {
  const props = specGroupsOf(product).flatMap((g) =>
    g.items.map((it) => ({ "@type": "PropertyValue", name: it.label, value: it.value }))
  );
  const has = (name) => props.some((p) => p.name.toLowerCase() === name.toLowerCase());
  const add = (name, value, extra = {}) => {
    if (value !== null && value !== undefined && value !== "" && !has(name)) {
      props.push({ "@type": "PropertyValue", name, value, ...extra });
    }
  };
  add("Condition grade", product.condition_grade || null);
  add("Battery health", toNumber(product.battery_health), { unitText: "%" });
  add("Battery cycle count", toNumber(product.battery_cycles));
  add("Included accessories", product.accessories || null);
  add("Condition notes", product.condition_notes || null);
  return props;
}

/**
 * Product JSON-LD: Offer (single variant) or AggregateOffer (several), with
 * BD shipping, warranty, every spec as additionalProperty and, when approved
 * reviews exist, aggregateRating + review[].
 *
 * @param {object} product - GET /products/:slug
 * @param {{ url: string, description: string, settings?: object|null,
 *           reviews?: { reviews: object[], summary: object }|null,
 *           categoryPath?: string|null }} ctx
 */
export function productJsonLd(product, { url, description, settings, reviews, categoryPath }) {
  const cond = conditionOf(product);
  const variants = (product.variants || []).filter((v) => toNumber(v.price) !== null);
  const seller = sellerJsonLd();
  const shippingDetails = shippingDetailsJsonLd(settings);
  const warranty = warrantyJsonLd(product);

  const images = (product.image_list?.length ? product.image_list.map((i) => i.url) : product.images || [])
    .map(safeUrl)
    .filter(Boolean)
    .map(absoluteUrl);

  // `nested`: an offer inside the AggregateOffer, which already carries the
  // seller / shipping / warranty shared by every variant.
  const variantOffer = (v, nested = false) => {
    const price = toNumber(v.price);
    const compareAt = toNumber(v.compare_at_price);
    const onSaleUntil = v.is_on_sale ? isoDate(v.sale_ends_at) : undefined;
    return {
      "@type": "Offer",
      ...(variants.length > 1 && v.variant_name ? { name: String(v.variant_name) } : {}),
      ...(v.sku ? { sku: String(v.sku) } : {}),
      url,
      price,
      priceCurrency: BDT,
      ...(compareAt && compareAt > price
        ? {
            priceSpecification: [
              { "@type": "UnitPriceSpecification", price, priceCurrency: BDT },
              {
                "@type": "UnitPriceSpecification",
                priceType: "https://schema.org/StrikethroughPrice",
                price: compareAt,
                priceCurrency: BDT,
              },
            ],
          }
        : {}),
      ...(onSaleUntil ? { priceValidUntil: onSaleUntil } : {}),
      availability: inStockUrl(toNumber(v.available) > 0),
      itemCondition: cond.schema,
      ...(nested
        ? {}
        : {
            seller,
            ...(shippingDetails ? { shippingDetails } : {}),
            ...(warranty ? { warranty } : {}),
          }),
    };
  };

  let offers;
  if (variants.length === 1) {
    offers = variantOffer(variants[0]);
  } else if (variants.length > 1) {
    const prices = variants.map((v) => toNumber(v.price));
    const saleEnds = variants
      .filter((v) => v.is_on_sale)
      .map((v) => isoDate(v.sale_ends_at))
      .filter(Boolean)
      .sort();
    offers = {
      "@type": "AggregateOffer",
      url,
      priceCurrency: BDT,
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: variants.length,
      ...(saleEnds.length ? { priceValidUntil: saleEnds[0] } : {}),
      availability: inStockUrl(variants.some((v) => toNumber(v.available) > 0)),
      itemCondition: cond.schema,
      seller,
      ...(shippingDetails ? { shippingDetails } : {}),
      ...(warranty ? { warranty } : {}),
      offers: variants.map((v) => variantOffer(v, true)),
    };
  }

  // Reviews: GET /reviews summary when available, else the product's own rating.
  const summary = reviews?.summary?.count > 0 ? reviews.summary : product.rating?.count > 0 ? product.rating : null;
  const aggregateRating = summary && toNumber(summary.average)
    ? {
        "@type": "AggregateRating",
        ratingValue: toNumber(summary.average),
        reviewCount: toNumber(summary.count),
        bestRating: 5,
        worstRating: 1,
      }
    : undefined;
  const reviewList = aggregateRating
    ? (reviews?.reviews || [])
        .filter((r) => toNumber(r.rating))
        .slice(0, 10)
        .map((r) => ({
          "@type": "Review",
          reviewRating: { "@type": "Rating", ratingValue: toNumber(r.rating), bestRating: 5, worstRating: 1 },
          author: { "@type": "Person", name: r.reviewer_name || "Verified customer" },
          ...(isoDate(r.created_at) ? { datePublished: isoDate(r.created_at) } : {}),
          ...(r.title ? { name: String(r.title) } : {}),
          ...(r.body ? { reviewBody: String(r.body) } : {}),
        }))
    : [];

  const sku = variants[0]?.sku;
  const properties = additionalProperties(product);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: product.name,
    description,
    url,
    ...(sku ? { sku: String(sku) } : {}),
    ...(images.length ? { image: images } : {}),
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
    ...(categoryPath || product.category ? { category: categoryPath || product.category } : {}),
    itemCondition: cond.schema,
    ...(properties.length ? { additionalProperty: properties } : {}),
    ...(offers ? { offers } : {}),
    ...(aggregateRating ? { aggregateRating } : {}),
    ...(reviewList.length ? { review: reviewList } : {}),
  };
}

/** ItemList for a listing page (summary pattern: url + name per item). */
export function itemListJsonLd({ name, url, products, offset = 0 }) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url,
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({
      "@type": "ListItem",
      position: offset + i + 1,
      url: absoluteUrl(`/products/${p.slug}`),
      name: p.name,
    })),
  };
}
