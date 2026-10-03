const { Router } = require('express');
const controller = require('./review.controller');
const { authenticate, requireStaff } = require('../auth/auth.middleware');
const { formLimiter } = require('../../middleware/rateLimiter');
const { validate } = require('../../middleware/validate');
const { idParams } = require('../../utils/validators');
const v = require('./review.validation');

const router = Router();

// Public — approved reviews of a product + rating summary.
router.get('/', validate(v.listQuerySchema, 'query'), controller.listPublic);

// Customer — own reviews (static paths before /:id).
router.get('/mine', authenticate, validate(v.mineQuerySchema, 'query'), controller.listMine);
router.post('/', authenticate, formLimiter, validate(v.createSchema), controller.create);
router.put('/:id', authenticate, validate(idParams, 'params'), validate(v.updateSchema), controller.update);
router.delete('/:id', authenticate, validate(idParams, 'params'), controller.remove);

// Staff — moderation.
router.get('/admin', authenticate, requireStaff, validate(v.adminQuerySchema, 'query'), controller.listAdmin);
router.patch('/:id/moderation', authenticate, requireStaff, validate(idParams, 'params'), validate(v.moderationSchema), controller.moderate);

module.exports = router;
