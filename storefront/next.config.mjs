/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== "production";
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5001/api/v1").origin;
  } catch {
    return "";
  }
})();

// Next.js hydration relies on inline scripts, so script-src needs
// 'unsafe-inline' unless we move to per-request nonces (forces dynamic
// rendering everywhere). The XSS sinks themselves are fixed (JsonLd escapes
// its payload); this CSP still blocks third-party script hosts, plugins,
// framing (clickjacking on checkout) and form/base-URI hijacking.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https: ${apiOrigin}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}${isDev ? " ws: http://localhost:*" : ""}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      // Product images uploaded via admin (Cloudflare R2 public bucket / custom domain).
      { protocol: "https", hostname: "*.r2.dev" },
    ],
  },
  // Old condition/brand/theme "categories" now live as filters and a collection.
  async redirects() {
    return [
      { source: "/categories/used-laptops", destination: "/categories/laptops?condition=used", permanent: true },
      { source: "/categories/new-laptops", destination: "/categories/laptops?condition=new", permanent: true },
      { source: "/categories/macbooks", destination: "/categories/laptops?brand=apple", permanent: true },
      { source: "/categories/gaming-laptops", destination: "/collections/gaming-laptops", permanent: true },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
