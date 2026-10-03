const { Router } = require('express');
const authController = require('./auth.controller');
const { authenticate } = require('./auth.middleware');
const { authLimiter, failedAttemptLimiter, otpRequestLimiter } = require('../../middleware/rateLimiter');
const {
  validate,
  registerSchema,
  loginSchema,
  sendOtpSchema,
  verifyOtpSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
} = require('./auth.validation');

const router = Router();

// Public routes. Per-IP limits, plus failed-attempt limits per phone that
// count only failures (so an attacker can't lock the real owner out).
const loginGuard = failedAttemptLimiter();
const codeGuard = failedAttemptLimiter({ perIp: 10, perPhone: 30 });

router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, ...loginGuard, validate(loginSchema), authController.login);
router.post('/otp/send', authLimiter, otpRequestLimiter, validate(sendOtpSchema), authController.sendOtp);
router.post('/otp/verify', authLimiter, ...codeGuard, validate(verifyOtpSchema), authController.verifyOtp);
router.post('/password/reset', authLimiter, ...codeGuard, validate(resetPasswordSchema), authController.resetPassword);

// Protected routes
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, validate(updateProfileSchema), authController.updateProfile);
router.post('/password/change', authenticate, authLimiter, validate(changePasswordSchema), authController.changePassword);
router.post('/logout-all', authenticate, authController.logoutAll);

module.exports = router;
