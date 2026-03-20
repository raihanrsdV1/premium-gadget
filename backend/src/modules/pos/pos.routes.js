const { Router } = require('express');
const controller = require('./pos.controller');
const { authenticate, authorize, requirePhoneVerified } = require('../auth/auth.middleware');

const router = Router();

// All POS routes are admin-only
router.use(authenticate, authorize('super_admin', 'branch_admin'));

// Create a walk-in sale
router.post('/sales', controller.createSale);

// List POS sales
router.get('/sales', controller.getSales);

// Get sale details
router.get('/sales/:id', controller.getSaleById);

module.exports = router;
