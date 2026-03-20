const { z } = require('zod');

const updateUserSchema = z.object({
  full_name: z.string().min(2).max(120).optional(),
  email: z.string().email().optional(),
  avatar_url: z.string().url().optional(),
});

module.exports = { updateUserSchema };
