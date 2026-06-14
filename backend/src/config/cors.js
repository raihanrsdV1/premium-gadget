const config = require('./index');

// Allowed browser origins: the configured origin(s) (CORS_ORIGIN may be a
// comma-separated list) plus the Next.js storefront dev origin on :3000.
const allowed = new Set(
  String(config.cors.origin)
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
);
allowed.add('http://localhost:3000');

const corsOptions = {
  origin(origin, callback) {
    // Allow:
    //  - known browser origins (storefront/admin) — reflected for XHR
    //  - no Origin header (curl / SSR / server-to-server)
    //  - Origin: "null" — sent by the browser on cross-origin POST navigations,
    //    e.g. the SSLCommerz gateway POSTing to our success/fail/cancel callbacks
    if (!origin || origin === 'null' || allowed.has(origin)) {
      return callback(null, true);
    }
    // Unknown origin: withhold CORS headers but DO NOT throw — a thrown error
    // hard-blocks the request (500), which would break non-XHR navigations.
    // Browsers still block disallowed XHR client-side since no header is set.
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

module.exports = corsOptions;
