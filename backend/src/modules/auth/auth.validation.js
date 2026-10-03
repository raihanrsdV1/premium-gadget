const { z, bdPhone, httpUrl, nullable } = require('../../utils/validators');
const { validate } = require('../../middleware/validate');

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long');

const otpCode = z.string().regex(/^\d{6}$/, 'OTP must be 6 digits');

const registerSchema = z.object({
  full_name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  phone: bdPhone,
  password,
  email: z.string().trim().toLowerCase().email('Invalid email').max(255).optional().or(z.literal('')),
});

const loginSchema = z.object({
  phone: bdPhone,
  password: z.string().min(1, 'Password is required').max(128),
});

const sendOtpSchema = z.object({
  phone: bdPhone,
  purpose: z.enum(['phone_verify', 'password_reset']).default('phone_verify'),
});

const verifyOtpSchema = z.object({
  phone: bdPhone,
  code: otpCode,
});

const resetPasswordSchema = z.object({
  phone: bdPhone,
  code: otpCode,
  new_password: password,
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1).max(128),
  new_password: password,
});

const updateProfileSchema = z
  .object({
    full_name: z.string().trim().min(2).max(120).optional(),
    email: nullable(z.string().trim().toLowerCase().email().max(255)),
    avatar_url: nullable(httpUrl),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

module.exports = {
  registerSchema,
  loginSchema,
  sendOtpSchema,
  verifyOtpSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
  validate,
};
