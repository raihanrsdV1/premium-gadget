const { z } = require('zod');

const registerSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(120),
  phone: z.string().regex(/^01[3-9]\d{8}$/, 'Invalid Bangladesh phone number'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
});

const loginSchema = z.object({
  phone: z.string().regex(/^01[3-9]\d{8}$/, 'Invalid Bangladesh phone number'),
  password: z.string().min(1, 'Password is required'),
});

const sendOtpSchema = z.object({
  phone: z.string().regex(/^01[3-9]\d{8}$/, 'Invalid Bangladesh phone number'),
  purpose: z.enum(['phone_verify', 'login', 'password_reset']).default('phone_verify'),
});

const verifyOtpSchema = z.object({
  phone: z.string().regex(/^01[3-9]\d{8}$/, 'Invalid Bangladesh phone number'),
  code: z.string().length(6, 'OTP must be 6 digits'),
});

/**
 * Zod validation middleware factory.
 * @param {z.ZodSchema} schema
 */
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return next(result.error);
  }
  req.validatedBody = result.data;
  next();
};

module.exports = {
  registerSchema,
  loginSchema,
  sendOtpSchema,
  verifyOtpSchema,
  validate,
};
