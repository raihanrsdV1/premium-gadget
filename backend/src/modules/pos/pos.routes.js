const { Router } = require('express');
const controller = require('./pos.controller');
const { authenticate, authorize, requireStaff } = require('../auth/auth.middleware');
const { validate } = require('../../middleware/validate');
const { idParams } = require('../../utils/validators');
const {
  createSaleSchema, listSalesQuerySchema, voidSaleSchema, catalogQuerySchema,
} = require('./pos.validation');

const router = Router();

// All POS routes are staff-only; branch scoping happens in the service.
router.use(authenticate, requireStaff);

// Counter product lookup (SKU / barcode first, then name).
router.get('/catalog', validate(catalogQuerySchema, 'query'), controller.catalog);

router.post('/sales', validate(createSaleSchema), controller.createSale);
router.get('/sales', validate(listSalesQuerySchema, 'query'), controller.getSales);
router.get('/sales/:id', validate(idParams, 'params'), controller.getSaleById);

// Voiding reverses money and stock: super_admin only.
router.post('/sales/:id/void', authorize('super_admin'), validate(idParams, 'params'), validate(voidSaleSchema), controller.voidSale);

module.exports = router;
