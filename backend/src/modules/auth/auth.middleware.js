const jwt = require('jsonwebtoken');
const config = require('../../config');
const ApiError = require('../../utils/ApiError');
const { query } = require('../../config/database');

/**
 * Verify JWT token and attach user to req.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('No token provided');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret);

    // Fetch user to ensure they still exist and are active
    const result = await query(
      'SELECT id, full_name, phone, email, role, phone_verified, is_active, branch_id FROM users WHERE id = $1 AND deleted_at IS NULL',
      [decoded.id]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      throw ApiError.unauthorized('User not found or deactivated');
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    next(ApiError.unauthorized('Invalid or expired token'));
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

/**
 * Requires phone to be OTP-verified before proceeding (e.g., at checkout).
 */
const requirePhoneVerified = (req, res, next) => {
  if (!req.user.phone_verified) {
    return next(ApiError.forbidden('Phone number must be verified before this action'));
  }
  next();
};

module.exports = { authenticate, authorize, requirePhoneVerified };
