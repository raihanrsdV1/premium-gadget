const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const corsOptions = require('./config/cors');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const { rateLimiter } = require('./middleware/rateLimiter');
const ApiError = require('./utils/ApiError');

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

const app = express();

// ─── Global middleware ────────────────────────────────
app.use(helmet());
app.use(cors(corsOptions));
app.use(rateLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ─── Static files (uploads) ──────────────────────────
app.use('/uploads', express.static('uploads'));

// ─── Health check ────────────────────────────────────
app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, message: 'Premium Gadget API is running 🚀', timestamp: new Date().toISOString() });
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

// ─── 404 handler ──────────────────────────────────────
app.use((req, res, next) => {
  next(ApiError.notFound(`Route ${req.originalUrl} not found`));
});

// ─── Global error handler ─────────────────────────────
app.use(errorHandler);

module.exports = app;
