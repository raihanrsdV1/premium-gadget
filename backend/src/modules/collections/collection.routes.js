const { Router } = require('express');
const controller = require('./collection.controller');
const { authenticate, authorize, requireStaff } = require('../auth/auth.middleware');
const { validate } = require('../../middleware/validate');
const { idParams } = require('../../utils/validators');
const v = require('./collection.validation');

const router = Router();

const staff = [authenticate, requireStaff];
const superAdmin = [authenticate, authorize('super_admin')];
const id = validate(idParams, 'params');

// Public
router.get('/', validate(v.publicListQuery, 'query'), controller.getPublicList);

// Staff reads (static paths before /:slug)
router.get('/admin', ...staff, controller.getAdminList);
router.get('/admin/:id', ...staff, id, controller.getAdminById);

router.get('/:slug', validate(v.slugParams, 'params'), validate(v.productsQuery, 'query'), controller.getPublicOne);

// Writes: super admin only
router.post('/', ...superAdmin, validate(v.createSchema), controller.create);
router.put('/home-order', ...superAdmin, validate(v.homeOrderSchema), controller.setHomeOrder);
router.put('/:id', ...superAdmin, id, validate(v.updateSchema), controller.update);
router.put('/:id/products', ...superAdmin, id, validate(v.setProductsSchema), controller.setProducts);
router.delete('/:id', ...superAdmin, id, controller.remove);

module.exports = router;
