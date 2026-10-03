import { getFeaturedProducts } from "@/lib/api/products";
import { getBrands, getCategories, getSettings } from "@/lib/api/server";
import { SITE, branchAddressLine } from "@/lib/site";
import {
  SITE_URL,
  absoluteUrl,
  conditionOf,
  formatBDT,
  highlightsOf,
  isSlug,
  toNumber,
  warrantyText,
} from "@/lib/seo";

/**
 * /llms.txt — a plain-Markdown briefing for LLMs and AI agents
 * (https://llmstxt.org): who the shop is, where, how buying works, and links
 * to categories and top products. Rebuilt hourly; every API-backed section is
 * optional so the shop facts are always served.
 */
export const revalidate = 3600;
const HOURLY = { revalidate: 3600 };

// Markdown-safe single line (API text must not break the list structure).
const md = (v) => String(v ?? "").replace(/[\r\n]+/g, " ").replace(/([[\]])/g, "\\$1").trim();

function productLine(p) {
  const facts = [];
  const price = toNumber(p.price);
  const compareAt = toNumber(p.compare_at_price);
  if (price !== null) facts.push(compareAt && compareAt > price ? `${formatBDT(price)} (was ${formatBDT(compareAt)})` : formatBDT(price));
  const cond = conditionOf(p);
  facts.push(cond.code === "new" ? "New" : [cond.label, p.condition_grade && `Grade ${p.condition_grade}`].filter(Boolean).join(", "));
  const hl = highlightsOf(p).map((h) => h.value);
  if (hl.length) facts.push(hl.join(" · "));
  const warranty = warrantyText(p);
  if (warranty) facts.push(warranty);
  if (p.in_stock === false) facts.push("out of stock");
  return `- [${md(p.name)}](${absoluteUrl(`/products/${p.slug}`)}): ${md(facts.join(" | "))}`;
}

function categoryLines(categories) {
  const active = categories.filter((c) => isSlug(c.slug) && c.is_active !== false && Number(c.product_count ?? 1) > 0);
  const children = (id) => active.filter((c) => c.parent_id === id);
  const line = (c, indent) => {
    const note = [c.description && md(c.description), c.product_count != null && `${c.product_count} product${Number(c.product_count) === 1 ? "" : "s"}`]
      .filter(Boolean)
      .join(" — ");
    return `${indent}- [${md(c.name)}](${absoluteUrl(`/categories/${c.slug}`)})${note ? `: ${note}` : ""}`;
  };
  const ids = new Set(active.map((c) => c.id));
  const out = [];
  active
    .filter((c) => !c.parent_id || !ids.has(c.parent_id))
    .forEach((root) => {
      out.push(line(root, ""));
      children(root.id).forEach((child) => out.push(line(child, "  ")));
    });
  return out;
}

function buyingLines(settings) {
  const lines = [];
  const checkout = settings?.checkout || {};
  const cod = checkout.cod_enabled !== false;
  const codCap = toNumber(checkout.cod_max_order_value);
  lines.push(`- Order online at ${SITE_URL} (sign in or create an account, add products to the cart, check out with a delivery address), order by phone/WhatsApp, or buy in person at either branch.`);
  lines.push(
    cod
      ? `- Payment: cash on delivery${codCap ? ` (orders up to ${formatBDT(codCap)})` : ""}, or secure online payment through SSLCommerz (cards, bKash, Nagad, Rocket, net banking).`
      : "- Payment: secure online payment through SSLCommerz (cards, bKash, Nagad, Rocket, net banking)."
  );

  const zones = Array.isArray(settings?.shipping?.zones) ? settings.shipping.zones : [];
  if (zones.length) {
    lines.push("- Delivery zones:");
    zones.forEach((z) => {
      const fee = toNumber(z.fee);
      lines.push(`  - ${md(z.label || z.code)}: ${fee === null ? "fee on request" : fee === 0 ? "free" : formatBDT(fee)}${z.eta ? `, ${md(z.eta)}` : ""}`);
    });
    const free = toNumber(settings.shipping.free_shipping_threshold);
    if (free) lines.push(`  - Free delivery on orders over ${formatBDT(free)}.`);
  } else {
    lines.push("- Delivery: courier delivery across Bangladesh; call or WhatsApp for the delivery fee to your area.");
  }
  lines.push("- Prices are in Bangladeshi Taka (BDT, ৳) and include the product only; the delivery fee is added at checkout.");
  lines.push("- Used laptops are tested and condition-graded (A+, A, B, …) with battery health listed; each product page states its warranty (shop or brand) and what it covers.");
  lines.push("- Laptop and gadget repairs are done in-house at the branches.");
  return lines;
}

export async function GET() {
  const [settings, categories, brands, featured] = await Promise.all([
    getSettings(HOURLY),
    getCategories(HOURLY),
    getBrands(HOURLY),
    getFeaturedProducts({ limit: 24, revalidate: 3600 }).catch(() => []),
  ]);

  const out = [];
  out.push(`# ${SITE.name}`);
  out.push("");
  out.push(
    `> ${SITE.name} is a laptop and gadget shop in Chattogram, Bangladesh. It sells tested, graded used laptops and brand-new laptops, MacBooks, accessories and gadgets with warranty, and repairs laptops in-house. Two branches (GEC and WASA). Call/WhatsApp ${SITE.phoneDisplay}. Cash on delivery across Bangladesh.`
  );
  out.push("");
  out.push("## Contact");
  out.push(`- Phone / WhatsApp: ${SITE.phoneDisplay} (${SITE.phoneE164}), ${SITE.whatsappUrl}`);
  out.push(`- Facebook: ${SITE.facebookUrl}`);
  out.push(`- Website: ${SITE_URL}/`);
  out.push("");
  out.push("## Branches");
  SITE.branches.forEach((b) => out.push(`- ${b.name}: ${branchAddressLine(b)}`));
  out.push("");
  out.push("## How buying works");
  out.push(...buyingLines(settings));
  out.push("");
  out.push("## Machine-readable");
  out.push(`- [Product feed (JSON)](${SITE_URL}/products.json): every product with price, availability, condition and key specs`);
  out.push(`- [Sitemap](${SITE_URL}/sitemap.xml)`);
  out.push("- Every product page embeds Schema.org Product JSON-LD with offers, shipping, warranty and full specifications.");
  out.push("");

  out.push("## Categories");
  const catLines = categories ? categoryLines(categories) : [];
  out.push(...(catLines.length ? catLines : [`- [All products](${SITE_URL}/products)`]));
  out.push(`- [Used laptops & gadgets](${SITE_URL}/products?condition=used)`);
  out.push(`- [New laptops & gadgets](${SITE_URL}/products?condition=new)`);
  out.push("");

  const brandList = (brands || []).filter((b) => isSlug(b.slug) && Number(b.product_count ?? 1) > 0);
  if (brandList.length) {
    out.push("## Brands");
    brandList.forEach((b) => out.push(`- [${md(b.name)}](${absoluteUrl(`/brands/${b.slug}`)})`));
    out.push("");
  }

  const top = (featured || []).filter((p) => isSlug(p?.slug));
  if (top.length) {
    out.push("## Featured products");
    top.forEach((p) => out.push(productLine(p)));
    out.push("");
  }

  out.push("## Optional");
  out.push(`- [Laptop & gadget repair services](${SITE_URL}/repairs): screen, battery, keyboard, SSD/RAM upgrades, motherboard repair`);
  out.push(`- [Search](${SITE_URL}/search?q=thinkpad): full-text product search`);
  out.push("");

  return new Response(out.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
