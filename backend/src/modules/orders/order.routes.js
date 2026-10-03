const { Router } = require('express');
const controller = require('./order.controller');
const {
  checkoutSchema, orderNumberParams, listQuerySchema, statusUpdateSchema, adminNoteSchema, paymentUpdateSchema,
} = require('./order.validation');
const { validate } = require('../../middleware/validate');
const { idParams } = require('../../utils/validators');
const { authenticate, authorize, requireStaff } = require('../auth/auth.middleware');
const { commerceLimiters } = require('../../middleware/rateLimiter');

const router = Router();

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * The storefront pre-fills the recipient's name and phone from the account
 * but only sends them once edited. Blank → the account's own details (still
 * validated by the schema). Every other address field stays required.
 */
const defaultRecipientFromAccount = (req, res, next) => {
  const a = req.body && req.body.shipping_address;
  if (a && typeof a === 'object' && !Array.isArray(a)) {
    req.body.shipping_address = {
      ...a,
      full_name: isBlank(a.full_name) ? req.user.full_name : a.full_name,
      phone: isBlank(a.phone) ? req.user.phone : a.phone,
    };
  }
  next();
};

// Customer — online checkout and own orders.
// NOTE: /checkout and /mine are declared before /:id so they aren't captured
// as an :id param.
router.post(
  '/checkout',
  authenticate,
  commerceLimiters.couponAttempt, // failed checkouts with a coupon_code only
  defaultRecipientFromAccount,
  validate(checkoutSchema),
  controller.checkout
);
router.get('/mine', authenticate, controller.getMine);
router.get('/mine/:orderNumber', authenticate, validate(orderNumberParams, 'params'), controller.getMineOne);

// Staff (branch_admin is scoped to orders fulfilled by their branch).
// Orders are never deleted: cancel or return them instead.
router.get('/', authenticate, requireStaff, validate(listQuerySchema, 'query'), controller.getAll);
router.get('/:id', authenticate, requireStaff, validate(idParams, 'params'), controller.getById);
router.patch(
  '/:id/status',
  authenticate, requireStaff, validate(idParams, 'params'), validate(statusUpdateSchema),
  controller.updateStatus
);
router.patch(
  '/:id/payment',
  authenticate, authorize('super_admin'), validate(idParams, 'params'), validate(paymentUpdateSchema),
  controller.updatePayment
);
router.patch('/:id', authenticate, requireStaff, validate(idParams, 'params'), validate(adminNoteSchema), controller.updateAdminNote);

module.exports = router;
