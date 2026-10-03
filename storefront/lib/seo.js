import { SITE } from "@/lib/site";

/**
 * SEO helpers shared by pages, JSON-LD builders, the sitemap and the agent
 * feeds (llms.txt, products.json). Everything absolute is built from
 * NEXT_PUBLIC_SITE_URL so canonicals, OG tags and structured data agree.
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

export const DEFAULT_DESCRIPTION =
  "Premium Gadget in Chattogram sells tested used and brand-new laptops, accessories and gadgets with warranty, plus expert repairs. GEC & WASA branches, cash on delivery across Bangladesh.";

export const DEFAULT_OG_IMAGE = {
  url: `${SITE_URL}/opengraph-image`,
  width: 1200,
  height: 630,
  alt: `${SITE.name} — ${SITE.tagline}`,
};

/** Product/category slug shape (also the only shape allowed in cache tags). */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isSlug = (v) => typeof v === "string" && v.length <= 200 && SLUG_RE.test(v);

/** Absolute URL for a site path; absolute http(s) URLs pass through. */
export function absoluteUrl(pathOrUrl = "/") {
  if (!pathOrUrl) return `${SITE_URL}/`;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${SITE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

/** Only http(s) URLs or site-relative paths are allowed out of API data into hrefs/srcs. */
export function safeUrl(raw) {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v || /[\u0000-\u001F\u007F\s\\]/.test(v)) return null;
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Metadata for an indexable page: canonical, Open Graph and Twitter card.
 * `title` may be a string (gets the layout's " · Premium Gadget" template)
 * or `{ absolute }`.
 */
export function pageMetadata({ title, description, path = "/", images, noindex = false }) {
  const url = absoluteUrl(path);
  const plainTitle = typeof title === "string" ? title : title?.absolute || SITE.name;
  const ogImages = images?.length ? images : [DEFAULT_OG_IMAGE];
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SITE.name,
      locale: "en_BD",
      url,
      title: plainTitle,
      description,
      images: ogImages,
    },
    twitter: {
      card: "summary_large_image",
      title: plainTitle,
      description,
      images: ogImages.map((i) => (typeof i === "string" ? i : i.url)),
    },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

// ─── Product facts ──────────────────────────────────────────────────────────

const CONDITIONS = {
  new: { label: "New", schema: "https://schema.org/NewCondition" },
  used: { label: "Used", schema: "https://schema.org/UsedCondition" },
  refurbished: { label: "Refurbished", schema: "https://schema.org/RefurbishedCondition" },
  // Opened packaging: Google's definition of "used".
  open_box: { label: "Open box", schema: "https://schema.org/UsedCondition" },
};

/**
 * The API's list rows carry `condition` as a label ("Pre-Owned") and detail
 * rows as a code ("used"); `condition_code` is always the code when present.
 */
export function conditionOf(product) {
  const raw = String(product?.condition_code || product?.condition || "new").toLowerCase();
  const code = raw === "pre-owned" ? "used" : raw.replace(/\s+/g, "_");
  return { code: CONDITIONS[code] ? code : "new", ...(CONDITIONS[code] || CONDITIONS.new) };
}

export const toNumber = (v) => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
};

/** "৳1,85,000" — lakh grouping, as prices are written in Bangladesh. */
export function formatBDT(value) {
  const n = toNumber(value);
  return n === null ? "" : `৳${Math.round(n).toLocaleString("en-IN")}`;
}

export function warrantyText(product) {
  const m = toNumber(product?.warranty_months);
  if (!m || m <= 0) return null;
  const span = m % 12 === 0 ? `${m / 12} year${m === 12 ? "" : "s"}` : `${m} month${m === 1 ? "" : "s"}`;
  const kind = product.warranty_type === "brand" ? "brand" : product.warranty_type === "shop" ? "shop" : "";
  return `${span}${kind ? ` ${kind}` : ""} warranty`;
}

/** Highlights ({label, value}, ≤4) when the API provides them, else []. */
export function highlightsOf(product) {
  if (!Array.isArray(product?.highlights)) return [];
  return product.highlights
    .filter((h) => h && h.value !== undefined && h.value !== null && String(h.value).trim())
    .slice(0, 4)
    .map((h) => ({ label: String(h.label ?? "").trim(), value: String(h.value).trim() }));
}

/**
 * Spec groups for display and structured data: the API's `spec_groups` when
 * present, else the flat `specifications` as a single unnamed group.
 */
export function specGroupsOf(product) {
  const clean = (items) =>
    (items || [])
      .filter((it) => it && String(it.label ?? "").trim() && it.value !== null && it.value !== undefined && String(it.value).trim())
      .map((it) => ({ label: String(it.label).trim(), value: String(it.value).trim() }));

  if (Array.isArray(product?.spec_groups)) {
    const groups = product.spec_groups
      .map((g) => ({ name: g?.name ? String(g.name).trim() : null, items: clean(g?.items) }))
      .filter((g) => g.items.length);
    if (groups.length) return groups;
  }
  const flat = clean((product?.specifications || []).map((s) => ({ label: s?.key, value: s?.value })));
  return flat.length ? [{ name: null, items: flat }] : [];
}

/** Lowest active variant price (variants come cheapest-first from the API). */
export function priceRange(product) {
  const prices = (product?.variants || []).map((v) => toNumber(v.price)).filter((n) => n !== null);
  if (!prices.length) {
    const p = toNumber(product?.price);
    return p === null ? null : { low: p, high: p };
  }
  return { low: Math.min(...prices), high: Math.max(...prices) };
}

function clamp(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).trimEnd()}…`;
}

/**
 * Product meta description: the admin's `meta_description`, or one generated
 * from the facts shoppers (and answer engines) look for — price, condition,
 * key specs, warranty, where to buy, how to pay.
 */
export function productDescription(product, { cod = true } = {}) {
  const custom = product?.meta_description?.trim();
  if (custom) return clamp(custom, 320);

  const parts = [];
  const range = priceRange(product);
  parts.push(
    range
      ? `${product.name} price in Bangladesh: ${formatBDT(range.low)}${range.high > range.low ? " onwards" : ""}.`
      : `${product.name}.`
  );

  const cond = conditionOf(product);
  if (cond.code === "new") {
    parts.push("Brand new.");
  } else {
    const facts = [cond.label];
    if (product.condition_grade) facts.push(`Grade ${product.condition_grade}`);
    if (toNumber(product.battery_health) !== null) facts.push(`${toNumber(product.battery_health)}% battery health`);
    parts.push(`${facts.join(", ")}.`);
  }

  const keySpecs = highlightsOf(product).map((h) => h.value);
  const fallback = (product.key_features || []).slice(0, 3);
  const specs = keySpecs.length ? keySpecs : fallback;
  if (specs.length) parts.push(`${specs.join(" · ")}.`);

  const warranty = warrantyText(product);
  if (warranty) parts.push(`${warranty.charAt(0).toUpperCase()}${warranty.slice(1)}.`);

  parts.push("Available at GEC & WASA, Chattogram.");
  if (cod) parts.push("Cash on delivery.");
  return clamp(parts.join(" "), 320);
}

/** Root-to-leaf category trail for a category slug, from the flat /categories list. */
export function categoryTrail(categories, slug) {
  if (!Array.isArray(categories) || !slug) return [];
  const byId = new Map(categories.map((c) => [c.id, c]));
  const trail = [];
  let node = categories.find((c) => c.slug === slug);
  for (let guard = 0; node && guard < 10; guard += 1) {
    trail.unshift({ id: node.id, name: node.name, slug: node.slug });
    node = node.parent_id ? byId.get(node.parent_id) : null;
  }
  return trail;
}

/** Escape a value for an XML text node / attribute. */
export function xmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
}
