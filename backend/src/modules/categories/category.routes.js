const { Router } = require('express');
const controller = require('./category.controller');
const { authenticate, authorize, requireStaff } = require('../auth/auth.middleware');
const { validate } = require('../../middleware/validate');
const { idParams } = require('../../utils/validators');
const { createSchema, updateSchema, listQuerySchema, idOrSlugParams } = require('./category.validation');
const { putTemplateBodySchema } = require('./spec-template');

const router = Router();

// Public
router.get('/', validate(listQuerySchema, 'query'), controller.getAll);

// Staff (declared before /:idOrSlug so "admin" isn't read as a slug)
router.get('/admin', authenticate, requireStaff, validate(listQuerySchema, 'query'), controller.getAdminList);
// Same as the public template read, but also for hidden categories.
router.get(
  '/admin/:id/spec-template',
  authenticate,
  requireStaff,
  validate(idParams, 'params'),
  controller.getAdminSpecTemplate
);

router.get('/:idOrSlug', validate(idOrSlugParams, 'params'), controller.getOne);
// Resolved spec template (own, else inherited from the nearest ancestor).
router.get('/:idOrSlug/spec-template', validate(idOrSlugParams, 'params'), controller.getSpecTemplate);

router.post('/', authenticate, requireStaff, validate(createSchema), controller.create);
router.put('/:id', authenticate, requireStaff, validate(idParams, 'params'), validate(updateSchema), controller.update);
router.put(
  '/:id/spec-template',
  authenticate,
  requireStaff,
  validate(idParams, 'params'),
  validate(putTemplateBodySchema),
  controller.putSpecTemplate
);
router.delete('/:id', authenticate, authorize('super_admin'), validate(idParams, 'params'), controller.remove);

module.exports = router;
