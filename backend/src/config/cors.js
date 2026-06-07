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
    // Non-browser requests (no Origin header, e.g. curl/SSR) are allowed.
    if (!origin || allowed.has(origin)) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

module.exports = corsOptions;
