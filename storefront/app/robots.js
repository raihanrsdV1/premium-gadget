import { SITE_URL } from "@/lib/seo";

// Personal / transactional pages and the API stay out of every index.
const DISALLOW = ["/cart", "/checkout", "/orders", "/order-success", "/login", "/register", "/wishlist", "/api/"];

// AI / answer-engine crawlers are welcome — named explicitly because a bot
// that matches its own group ignores the "*" group, so each group repeats the
// disallow list.
const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "CCBot",
  "Applebot-Extended",
];

export default function robots() {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      { userAgent: AI_BOTS, allow: "/", disallow: DISALLOW },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
