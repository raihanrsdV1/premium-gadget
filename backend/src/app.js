const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const corsOptions = require('./config/cors');
const { query } = require('./config/database');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const { rateLimiter } = require('./middleware/rateLimiter');
const ApiError = require('./utils/ApiError');
const { requestContext } = require('./utils/requestContext');
const { registerOrderStockListener } = require('./lib/stockRevalidation');

// ─── Import route modules ────────────────────────────
const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/user.routes');
const categoryRoutes = require('./modules/categories/category.routes');
const brandRoutes = require('./modules/brands/brand.routes');
const productRoutes = require('./modules/products/product.routes');
const branchRoutes = require('./modules/branches/branch.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const orderRoutes = require('./modules/orders/order.routes');
const paymentRoutes = require('./modules/payments/payment.routes');
const repairRoutes = require('./modules/repairs/repair.routes');
const reviewRoutes = require('./modules/reviews/review.routes');
const posRoutes = require('./modules/pos/pos.routes');
const couponRoutes = require('./modules/coupons/coupon.routes');
const wishlistRoutes = require('./modules/wishlists/wishlist.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const uploadRoutes = require('./modules/uploads/upload.routes');
const bannerRoutes = require('./modules/banners/banner.routes');
const collectionRoutes = require('./modules/collections/collection.routes');
const { searchRouter, catalogRouter } = require('./modules/catalog/catalog.routes');
const auditRoutes = require('./modules/audit/audit.routes');

const app = express();

// Order status changes move stock; keep the storefront's stock display fresh.
registerOrderStockListener();

// Correct client IPs behind Caddy / Cloudflare (rate limiting, logs).
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

// ─── Global middleware ────────────────────────────────
// Context + logging first, so rate-limited and malformed requests are logged too.
app.use(requestContext);
app.use(requestLogger);

// The API serves JSON only, so the strictest CSP applies. Images served from
// /uploads (local storage driver) must be embeddable by the storefront, hence
// cross-origin CORP.
app.use(
  helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(cors(corsOptions));
app.use(rateLimiter);
app.use(express.json({ limit: '200kb' }));
// SSLCommerz callbacks are form-encoded POSTs.
app.use(express.urlencoded({ extended: false, limit: '200kb' }));

// ─── Static files (local storage driver only) ────────
// Only re-encoded images are ever written here (see modules/uploads). Served
// with nosniff and a sandboxing CSP as defence in depth.
app.use(
  '/uploads',
  express.static(path.join(__dirname, '..', 'uploads'), {
    index: false,
    dotfiles: 'deny',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  })
);

// ─── Health check (DB-aware; exempt from rate limiting) ──
app.get('/api/v1/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ success: false, status: 'database_unavailable' });
  }
});

// ─── API routes (v1) ─────────────────────────────────
const API_PREFIX = '/api/v1';

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);
app.use(`${API_PREFIX}/categories`, categoryRoutes);
app.use(`${API_PREFIX}/brands`, brandRoutes);
app.use(`${API_PREFIX}/products`, productRoutes);
app.use(`${API_PREFIX}/branches`, branchRoutes);
app.use(`${API_PREFIX}/inventory`, inventoryRoutes);
app.use(`${API_PREFIX}/orders`, orderRoutes);
app.use(`${API_PREFIX}/payments`, paymentRoutes);
app.use(`${API_PREFIX}/repairs`, repairRoutes);
app.use(`${API_PREFIX}/reviews`, reviewRoutes);
app.use(`${API_PREFIX}/pos`, posRoutes);
app.use(`${API_PREFIX}/coupons`, couponRoutes);
app.use(`${API_PREFIX}/wishlists`, wishlistRoutes);
app.use(`${API_PREFIX}/settings`, settingsRoutes);
app.use(`${API_PREFIX}/uploads`, uploadRoutes);
app.use(`${API_PREFIX}/banners`, bannerRoutes);
app.use(`${API_PREFIX}/collections`, collectionRoutes);
app.use(`${API_PREFIX}/search`, searchRouter);
app.use(`${API_PREFIX}/catalog`, catalogRouter);
app.use(`${API_PREFIX}/audit-log`, auditRoutes);

// ─── 404 handler ──────────────────────────────────────
app.use((req, res, next) => {
  next(ApiError.notFound('Route not found'));
});

// ─── Global error handler ─────────────────────────────
app.use(errorHandler);

module.exports = app;
