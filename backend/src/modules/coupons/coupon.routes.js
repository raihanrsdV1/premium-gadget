const { Router } = require('express');
const controller = require('./coupon.controller');
const { createSchema, updateSchema, listQuerySchema, validateCartSchema } = require('./coupon.validation');
const { validate } = require('../../middleware/validate');
const { idParams } = require('../../utils/validators');
const { lookupLimiter } = require('../../middleware/rateLimiter');
const { authenticate, authorize, requireStaff } = require('../auth/auth.middleware');

const router = Router();

// Customer (declared before /:id).
router.post('/validate', authenticate, lookupLimiter, validate(validateCartSchema), controller.validateForCart);

// Staff reads (POS staff need to see codes).
router.get('/', authenticate, requireStaff, validate(listQuerySchema, 'query'), controller.getAll);
router.get('/:id', authenticate, requireStaff, validate(idParams, 'params'), controller.getById);

// Owner only.
router.post('/', authenticate, authorize('super_admin'), validate(createSchema), controller.create);
router.put('/:id', authenticate, authorize('super_admin'), validate(idParams, 'params'), validate(updateSchema), controller.update);
router.delete('/:id', authenticate, authorize('super_admin'), validate(idParams, 'params'), controller.remove);

module.exports = router;
