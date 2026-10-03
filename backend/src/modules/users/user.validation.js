const {
  z, uuid, bdPhone, httpUrl, nullable, queryBool, paginationQuery, searchTerm,
} = require('../../utils/validators');

// Lower-cased so self-checks (actor.id === id) can't be dodged with an
// upper-case UUID.
const userIdParams = z.object({ id: uuid.transform((v) => v.toLowerCase()) });

const listQuerySchema = z.object({
  ...paginationQuery,
  q: searchTerm.optional(),
  role: z.enum(['super_admin', 'branch_admin', 'customer']).optional(),
  branch_id: uuid.optional(),
  is_active: queryBool.optional(),
});

// Profile fields a super_admin may edit on any account. Role / branch /
// active-status changes are separate, audited operations.
const adminUpdateUserSchema = z
  .object({
    full_name: z.string().trim().min(2).max(120).optional(),
    email: nullable(z.string().trim().toLowerCase().email().max(255)),
    avatar_url: nullable(httpUrl),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long');

const branchRequired = (v) => v.role !== 'branch_admin' || Boolean(v.branch_id);
const branchRequiredIssue = { message: 'branch_id is required for a branch_admin', path: ['branch_id'] };

const createStaffSchema = z
  .object({
    full_name: z.string().trim().min(2).max(120),
    phone: bdPhone,
    email: z.string().trim().toLowerCase().email().max(255).optional().or(z.literal('').transform(() => undefined)),
    password,
    role: z.enum(['branch_admin', 'super_admin']),
    branch_id: nullable(uuid),
  })
  .refine(branchRequired, branchRequiredIssue);

const changeRoleSchema = z
  .object({
    role: z.enum(['customer', 'branch_admin', 'super_admin']),
    branch_id: nullable(uuid),
    // Required when promoting an account whose phone isn't verified.
    new_password: password.optional(),
  })
  .refine(branchRequired, branchRequiredIssue);

const changeStatusSchema = z.object({
  is_active: z.boolean(),
});

const adminResetPasswordSchema = z.object({
  new_password: password,
});

module.exports = {
  userIdParams,
  listQuerySchema,
  adminUpdateUserSchema,
  createStaffSchema,
  changeRoleSchema,
  changeStatusSchema,
  adminResetPasswordSchema,
};
