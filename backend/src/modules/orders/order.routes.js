const { Router } = require('express');
const controller = require('./order.controller');
const { createOrderSchema, validate } = require('./order.validation');
const { authenticate, authorize } = require('../auth/auth.middleware');

const router = Router();

// Customer — online checkout (Phase A) and own orders.
// NOTE: /checkout and /mine are declared before /:id so they aren't captured
// as an :id param.
router.post('/checkout', authenticate, validate(createOrderSchema), controller.checkout);
router.get('/mine', authenticate, controller.getMine);
router.get('/mine/:orderNumber', authenticate, controller.getMineOne);

// Admin
router.get('/', authenticate, authorize('super_admin', 'branch_admin'), controller.getAll);
router.get('/:id', authenticate, authorize('super_admin', 'branch_admin'), controller.getById);
router.put('/:id', authenticate, authorize('super_admin', 'branch_admin'), controller.update);
router.delete('/:id', authenticate, authorize('super_admin'), controller.remove);

module.exports = router;
