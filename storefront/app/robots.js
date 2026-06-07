const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// Allow all crawlers, including AI/LLM crawlers explicitly so the storefront
// is indexable by search engines and answer engines alike.
export default function robots() {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "ClaudeBot", allow: "/" },
      { userAgent: "PerplexityBot", allow: "/" },
      { userAgent: "Google-Extended", allow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
