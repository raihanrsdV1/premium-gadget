const { Router } = require('express');
const controller = require('./branch.controller');
const { authenticate, authorize, requireStaff } = require('../auth/auth.middleware');
const { validate } = require('../../middleware/validate');
const { idParams } = require('../../utils/validators');
const { createBranchSchema, updateBranchSchema, idOrSlugParams } = require('./branch.validation');

const router = Router();
const superAdmin = [authenticate, authorize('super_admin')];

// Staff — every branch, including inactive ones. Declared before /:idOrSlug.
router.get('/admin', authenticate, requireStaff, controller.listAdmin);

// Public — active branches only (store locator / contact page).
router.get('/', controller.listPublic);
router.get('/:idOrSlug', validate(idOrSlugParams, 'params'), controller.getPublic);

// super_admin only — branches are structural, shop staff can't change them.
router.post('/', ...superAdmin, validate(createBranchSchema), controller.create);
router.put('/:id', ...superAdmin, validate(idParams, 'params'), validate(updateBranchSchema), controller.update);
router.delete('/:id', ...superAdmin, validate(idParams, 'params'), controller.remove);

module.exports = router;
