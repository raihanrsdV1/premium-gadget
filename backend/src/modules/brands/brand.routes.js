const { Router } = require('express');
const controller = require('./brand.controller');
const { authenticate, authorize, requireStaff } = require('../auth/auth.middleware');
const { validate } = require('../../middleware/validate');
const { idParams } = require('../../utils/validators');
const { createSchema, updateSchema, listQuerySchema, idOrSlugParams } = require('./brand.validation');

const router = Router();

// Public
router.get('/', validate(listQuerySchema, 'query'), controller.getAll);

// Staff (declared before /:idOrSlug so "admin" isn't read as a slug)
router.get('/admin', authenticate, requireStaff, validate(listQuerySchema, 'query'), controller.getAdminList);

router.get('/:idOrSlug', validate(idOrSlugParams, 'params'), controller.getOne);

router.post('/', authenticate, requireStaff, validate(createSchema), controller.create);
router.put('/:id', authenticate, requireStaff, validate(idParams, 'params'), validate(updateSchema), controller.update);
router.delete('/:id', authenticate, authorize('super_admin'), validate(idParams, 'params'), controller.remove);

module.exports = router;
