const { Router } = require('express');
const controller = require('./user.controller');
const { authenticate, authorize } = require('../auth/auth.middleware');

const router = Router();

router.get('/', authenticate, authorize('super_admin'), controller.getAll);
router.get('/:id', authenticate, controller.getById);
router.put('/:id', authenticate, controller.update);
router.delete('/:id', authenticate, authorize('super_admin'), controller.remove);

module.exports = router;
