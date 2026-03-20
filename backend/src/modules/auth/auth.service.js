const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../../config/database');
const config = require('../../config');
const ApiError = require('../../utils/ApiError');

/**
 * Register a new customer.
 */
const register = async ({ full_name, phone, password, email }) => {
  // Check if phone already exists
  const existing = await query('SELECT id FROM users WHERE phone = $1', [phone]);
  if (existing.rows.length > 0) {
    throw ApiError.conflict('Phone number already registered');
  }

  // Check email uniqueness if provided
  if (email) {
    const emailExists = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (emailExists.rows.length > 0) {
      throw ApiError.conflict('Email already registered');
    }
  }

  const password_hash = await bcrypt.hash(password, 12);

  const result = await query(
    `INSERT INTO users (full_name, phone, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'customer')
     RETURNING id, full_name, phone, email, role, phone_verified, created_at`,
    [full_name, phone, email || null, password_hash]
  );

  const user = result.rows[0];
  const token = generateToken(user);

  return { user, token };
};

/**
 * Log in with phone + password.
 */
const login = async ({ phone, password }) => {
  const result = await query(
    'SELECT id, full_name, phone, email, password_hash, role, phone_verified, is_active FROM users WHERE phone = $1 AND deleted_at IS NULL',
    [phone]
  );

  if (result.rows.length === 0) {
    throw ApiError.unauthorized('Invalid phone or password');
  }

  const user = result.rows[0];

  if (!user.is_active) {
    throw ApiError.forbidden('Account has been deactivated');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid phone or password');
  }

  delete user.password_hash;
  const token = generateToken(user);

  return { user, token };
};

/**
 * Generate a 6-digit OTP and store it.
 */
const sendOtp = async ({ phone, purpose }) => {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await query(
    `INSERT INTO otp_codes (phone, code, purpose, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [phone, code, purpose, expiresAt]
  );

  // TODO: Integrate SMS gateway to actually send the code
  // For development, log it
  console.log(`📱 OTP for ${phone}: ${code}`);

  return { message: 'OTP sent successfully' };
};

/**
 * Verify an OTP and mark phone as verified.
 */
const verifyOtp = async ({ phone, code }) => {
  const result = await query(
    `SELECT id FROM otp_codes
     WHERE phone = $1 AND code = $2 AND purpose = 'phone_verify'
       AND expires_at > NOW() AND used_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [phone, code]
  );

  if (result.rows.length === 0) {
    throw ApiError.badRequest('Invalid or expired OTP');
  }

  // Mark OTP as used
  await query('UPDATE otp_codes SET used_at = NOW() WHERE id = $1', [result.rows[0].id]);

  // Mark phone as verified
  await query('UPDATE users SET phone_verified = TRUE, updated_at = NOW() WHERE phone = $1', [phone]);

  return { message: 'Phone verified successfully' };
};

/**
 * Get current user profile.
 */
const getProfile = async (userId) => {
  const result = await query(
    'SELECT id, full_name, phone, email, role, avatar_url, phone_verified, created_at FROM users WHERE id = $1 AND deleted_at IS NULL',
    [userId]
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('User not found');
  }

  return result.rows[0];
};

// ─── Helpers ──────────────────────────────────────────

function generateToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

module.exports = { register, login, sendOtp, verifyOtp, getProfile };
