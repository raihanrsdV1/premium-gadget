const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// Static sitemap for now. TODO: make dynamic by enumerating products from the
// API once more pages are migrated.
export default function sitemap() {
  const now = new Date();
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/products/macbook-pro-m3-14-inch`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}
