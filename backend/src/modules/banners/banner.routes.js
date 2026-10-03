const { Router } = require('express');
const controller = require('./banner.controller');
const { authenticate, authorize, requireStaff } = require('../auth/auth.middleware');
const { validate } = require('../../middleware/validate');
const { idParams } = require('../../utils/validators');
const v = require('./banner.validation');

const router = Router();

const staff = [authenticate, requireStaff];
const superAdmin = [authenticate, authorize('super_admin')];
const id = validate(idParams, 'params');

// Public
router.get('/', validate(v.publicQuerySchema, 'query'), controller.getPublic);

// Staff (static paths before /:id)
router.get('/admin', ...staff, validate(v.adminQuerySchema, 'query'), controller.getAdminList);
router.post('/', ...staff, validate(v.createSchema), controller.create);
router.put('/order', ...staff, validate(v.reorderSchema), controller.reorder);
router.put('/:id', ...staff, id, validate(v.updateSchema), controller.update);
router.delete('/:id', ...superAdmin, id, controller.remove);

module.exports = router;
