const { Router } = require('express');
const controller = require('./user.controller');
const { authenticate, authorize } = require('../auth/auth.middleware');
const { validate } = require('../../middleware/validate');
const {
  userIdParams,
  listQuerySchema,
  adminUpdateUserSchema,
  createStaffSchema,
  changeRoleSchema,
  changeStatusSchema,
  adminResetPasswordSchema,
} = require('./user.validation');

const router = Router();
const superAdmin = [authenticate, authorize('super_admin')];
const withId = validate(userIdParams, 'params');

// Customers manage their own account via /auth/profile. Everything here is
// super_admin only, except reading your own record.
router.get('/', ...superAdmin, validate(listQuerySchema, 'query'), controller.getAll);
router.post('/staff', ...superAdmin, validate(createStaffSchema), controller.createStaff);
router.get('/:id', authenticate, withId, controller.getById);
router.put('/:id', ...superAdmin, withId, validate(adminUpdateUserSchema), controller.update);
router.delete('/:id', ...superAdmin, withId, controller.remove);

// Role, status and password changes are separate, audited operations that
// revoke the user's sessions.
router.patch('/:id/role', ...superAdmin, withId, validate(changeRoleSchema), controller.changeRole);
router.patch('/:id/status', ...superAdmin, withId, validate(changeStatusSchema), controller.changeStatus);
router.post('/:id/reset-password', ...superAdmin, withId, validate(adminResetPasswordSchema), controller.resetPassword);

module.exports = router;
