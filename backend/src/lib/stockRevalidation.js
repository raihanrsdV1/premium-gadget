const { revalidate, TAGS } = require('./revalidate');
const orderEvents = require('../events/orderEvents');

/**
 * Stock changes flip a product's in-stock state, which the storefront shows
 * on listing cards, product pages and hero banners. After any committed stock
 * change, ask the storefront to refresh those pages (fire-and-forget; a no-op
 * unless revalidation is configured).
 */
const STOCK_TAGS = [TAGS.products, TAGS.banners, TAGS.collections];

const stockChanged = () => {
  revalidate(STOCK_TAGS);
};

/** Wrap an async service function: once it resolves (committed), revalidate. */
const afterStockChange = (fn) => async (...args) => {
  const result = await fn(...args);
  stockChanged();
  return result;
};

let registered = false;
/**
 * Order status changes (checkout reservation, confirmation, cancellation,
 * expiry, returns) all move stock; the order event fires after commit.
 */
const registerOrderStockListener = () => {
  if (registered) return;
  registered = true;
  orderEvents.on(orderEvents.STATUS_CHANGED, stockChanged);
};

module.exports = { afterStockChange, registerOrderStockListener, stockChanged };
