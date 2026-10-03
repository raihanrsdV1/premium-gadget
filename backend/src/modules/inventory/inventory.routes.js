const { Router } = require('express');
const controller = require('./inventory.controller');
const { authenticate, authorize, requireStaff } = require('../auth/auth.middleware');
const { validate } = require('../../middleware/validate');
const { idParams } = require('../../utils/validators');
const v = require('./inventory.validation');

const router = Router();

// Stock levels, cost prices and the ledger are internal: staff only. A
// branch_admin is scoped to their own branch inside the service.
router.use(authenticate, requireStaff);

// Static paths first so they aren't captured by /:id.
router.get('/movements', validate(v.movementsQuerySchema, 'query'), controller.getMovements);
router.post('/transfer', validate(v.transferSchema), controller.transfer);

// Serial registry (used laptops).
router.get('/units', validate(v.unitListQuerySchema, 'query'), controller.listUnits);
router.post('/units', validate(v.unitCreateSchema), controller.createUnit);
router.patch('/units/:id', validate(idParams, 'params'), validate(v.unitUpdateSchema), controller.updateUnit);

router.get('/', validate(v.listQuerySchema, 'query'), controller.getAll);
router.post('/', validate(v.createSchema), controller.create);
router.get('/:id', validate(idParams, 'params'), controller.getById);
router.put('/:id', validate(idParams, 'params'), validate(v.updateSchema), controller.update);
router.post('/:id/adjust', validate(idParams, 'params'), validate(v.adjustSchema), controller.adjust);
router.delete('/:id', authorize('super_admin'), validate(idParams, 'params'), controller.remove);

module.exports = router;
