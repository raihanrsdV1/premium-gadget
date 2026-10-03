const { Router } = require('express');
const controller = require('./audit.controller');
const { authenticate, authorize } = require('../auth/auth.middleware');
const { validate } = require('../../middleware/validate');
const { listQuery } = require('./audit.validation');

const router = Router();

// The activity log (who changed what) is for the owner only.
router.use(authenticate, authorize('super_admin'));
router.get('/', validate(listQuery, 'query'), controller.list);
router.get('/actions', controller.actions);

module.exports = router;
