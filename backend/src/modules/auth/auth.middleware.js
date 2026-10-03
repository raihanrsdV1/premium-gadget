const jwt = require('jsonwebtoken');
const config = require('../../config');
const ApiError = require('../../utils/ApiError');
const { query } = require('../../config/database');

const STAFF_ROLES = ['super_admin', 'branch_admin'];

/**
 * Resolve a Bearer token to an active user, or null. The user's role, branch
 * and active flag are always re-read from the DB, and the token's version must
 * match users.token_version (bumped on password change / "log out
 * everywhere"), so revoked sessions stop working immediately.
 */
const resolveUser = async (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7).trim();
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  const result = await query(
    `SELECT id, full_name, phone, email, role, phone_verified, is_active, branch_id, token_version
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [decoded.id]
  );
  const user = result.rows[0];
  if (!user || !user.is_active) throw ApiError.unauthorized('User not found or deactivated');
  if ((decoded.tv ?? 0) !== user.token_version) throw ApiError.unauthorized('Session has been revoked');

  delete user.token_version;
  return user;
};

/** Require a valid token; attaches req.user. */
const authenticate = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (!user) throw ApiError.unauthorized('No token provided');
    req.user = user;
    next();
  } catch (err) {
    next(err instanceof ApiError ? err : ApiError.unauthorized('Invalid or expired token'));
  }
};

/**
 * Attach req.user when a valid token is present; continue anonymously when
 * there is none. A present-but-invalid token is still rejected (401) so
 * clients notice expired sessions.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (user) req.user = user;
    next();
  } catch (err) {
    next(err instanceof ApiError ? err : ApiError.unauthorized('Invalid or expired token'));
  }
};

/**
 * Role-based access control middleware.
 * @param  {...string} roles - Allowed roles (e.g., 'super_admin', 'branch_admin')
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(ApiError.forbidden('You do not have permission to perform this action'));
  }
  next();
};

/** Shorthand for staff-only routes. */
const requireStaff = authorize(...STAFF_ROLES);

const isStaff = (user) => Boolean(user && STAFF_ROLES.includes(user.role));

/**
 * Requires phone to be OTP-verified before proceeding (e.g., at checkout).
 */
const requirePhoneVerified = (req, res, next) => {
  if (!req.user.phone_verified) {
    return next(ApiError.forbidden('Phone number must be verified before this action'));
  }
  next();
};

module.exports = {
  authenticate,
  optionalAuth,
  authorize,
  requireStaff,
  isStaff,
  requirePhoneVerified,
  STAFF_ROLES,
};
