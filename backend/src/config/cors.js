const config = require('./index');

// Allowed browser origins come only from CORS_ORIGIN (comma-separated):
// the storefront domain(s) and the local admin app's origin.
const allowed = new Set(config.cors.origins);

const corsOptions = {
  origin(origin, callback) {
    // No Origin header: curl, server-to-server (storefront SSR, SSLCommerz IPN)
    // and same-origin navigations. CORS doesn't apply; let them through.
    if (!origin || allowed.has(origin)) {
      return callback(null, true);
    }
    // Unknown origin (including "null" from the gateway's form-POST redirects):
    // withhold CORS headers but don't error — non-XHR navigations still work,
    // and browsers block disallowed XHR client-side.
    return callback(null, false);
  },
  // Auth uses the Authorization header, not cookies.
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
};

module.exports = corsOptions;
