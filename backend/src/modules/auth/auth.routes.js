const { Router } = require('express');
const authController = require('./auth.controller');
const { authenticate } = require('./auth.middleware');
const { authLimiter } = require('../../middleware/rateLimiter');
const { validate, registerSchema, loginSchema, sendOtpSchema, verifyOtpSchema } = require('./auth.validation');

const router = Router();

// Public routes
router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/otp/send', authLimiter, validate(sendOtpSchema), authController.sendOtp);
router.post('/otp/verify', authLimiter, validate(verifyOtpSchema), authController.verifyOtp);

// Protected routes
router.get('/profile', authenticate, authController.getProfile);

module.exports = router;
