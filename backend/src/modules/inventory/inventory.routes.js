const { Router } = require('express');
const controller = require('./inventory.controller');
const { updateSchema, validate } = require('./inventory.validation');
const { authenticate, authorize } = require('../auth/auth.middleware');

const router = Router();

// Public
router.get('/', controller.getAll);
router.get('/:id', controller.getById);

// Admin
router.post('/', authenticate, authorize('super_admin', 'branch_admin'), controller.create);
router.put('/:id', authenticate, authorize('super_admin', 'branch_admin'), validate(updateSchema), controller.update);
router.delete('/:id', authenticate, authorize('super_admin'), controller.remove);

module.exports = router;
