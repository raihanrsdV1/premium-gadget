const { Router } = require('express');
const controller = require('./settings.controller');
const { SETTING_SCHEMAS, keyParams } = require('./settings.validation');
const { isKnownKey } = require('./settings.service');
const { validate } = require('../../middleware/validate');
const { authenticate, authorize, requireStaff } = require('../auth/auth.middleware');
const ApiError = require('../../utils/ApiError');

const router = Router();

// Pick the body schema by key; unknown keys are a 404, not a 400.
const validateSettingBody = (req, res, next) => {
  const { key } = req.validatedParams;
  if (!isKnownKey(key)) return next(ApiError.notFound('Unknown setting'));
  return validate(SETTING_SCHEMAS[key])(req, res, next);
};

// Public
router.get('/', controller.getPublic);

// Staff
router.get('/admin', authenticate, requireStaff, controller.getAdmin);

// Owner only
router.put(
  '/:key',
  authenticate,
  authorize('super_admin'),
  validate(keyParams, 'params'),
  validateSettingBody,
  controller.update
);

module.exports = router;
