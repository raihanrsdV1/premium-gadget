/**
 * Business identity (name / branches / phone / socials). Keep this the single
 * source so the footer, contact blocks and Schema.org data always match —
 * Google and AI assistants cross-check these "NAP" details.
 *
 * TODO: read from the backend's GET /settings and GET /branches once the
 * storefront redesign wires them up, so the shop can edit these from admin.
 */
export const SITE = {
  name: "Premium Gadget",
  tagline: "New & used laptops in Chattogram",
  phoneDisplay: "01886-670543",
  phoneE164: "+8801886670543",
  whatsappUrl: "https://wa.me/8801886670543",
  facebookUrl: "https://www.facebook.com/premiumgadget.official/",
  logoPath: "/brand/logo-mark.png",
  logoSize: { width: 512, height: 512 },
  themeColor: "#2A50C8",
  navy: "#12205A",
  branches: [
    {
      id: "gec",
      name: "GEC Branch",
      nameBn: "জিইসি শাখা",
      street: "Shop 451/A, Level 4, Sanmar Ocean City, Nasirabad",
      locality: "Chattogram",
      postalCode: "4203",
    },
    {
      id: "wasa",
      name: "WASA Branch",
      nameBn: "ওয়াসা শাখা",
      street: "Shop 502, Level 5, Meridian Kohinoor City, WASA",
      locality: "Chattogram",
      postalCode: null,
    },
  ],
};

// Back-compat: the main (GEC) branch as "the" address.
SITE.address = {
  ...SITE.branches[0],
  country: "BD",
  display: `${SITE.branches[0].street}, ${SITE.branches[0].locality} ${SITE.branches[0].postalCode}`,
};

/** One-line postal address, e.g. for llms.txt and contact blocks. */
export const branchAddressLine = (b) =>
  `${b.street}, ${b.locality}${b.postalCode ? ` ${b.postalCode}` : ""}, Bangladesh`;

const postalAddress = (b) => ({
  "@type": "PostalAddress",
  streetAddress: b.street,
  addressLocality: b.locality,
  ...(b.postalCode ? { postalCode: b.postalCode } : {}),
  addressCountry: "BD",
});

export const postalAddressJsonLd = postalAddress(SITE.branches[0]);

/** Stable Schema.org node id for the shop, so offers can reference it as seller. */
export const organizationId = (siteUrl) => `${siteUrl}/#organization`;

/** One ElectronicsStore (a LocalBusiness) per branch, for the Organization's `department`. */
export const branchesJsonLd = (siteUrl) =>
  SITE.branches.map((b) => ({
    "@type": "ElectronicsStore",
    "@id": `${siteUrl}/#branch-${b.id}`,
    name: `${SITE.name} — ${b.name}`,
    url: siteUrl,
    image: `${siteUrl}${SITE.logoPath}`,
    telephone: SITE.phoneE164,
    priceRange: "৳৳",
    address: postalAddress(b),
    areaServed: { "@type": "Country", name: "Bangladesh" },
    parentOrganization: { "@id": organizationId(siteUrl) },
  }));
