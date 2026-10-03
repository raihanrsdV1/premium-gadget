const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query, withTransaction } = require('../../config/database');
const config = require('../../config');
const ApiError = require('../../utils/ApiError');
const sms = require('../../lib/sms');
const { hashPassword, verifyPassword, needsRehash, getDummyHash } = require('../../utils/password');
const { STAFF_ROLES } = require('./auth.middleware');

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_S = 60;
const OTP_MAX_PER_HOUR = 5;

const PROFILE_FIELDS =
  'id, full_name, phone, email, role, avatar_url, phone_verified, branch_id, created_at';

const hashOtp = (phone, code) =>
  crypto.createHmac('sha256', config.jwt.secret).update(`${phone}:${code}`).digest('hex');

function generateToken(user) {
  const staff = STAFF_ROLES.includes(user.role);
  return jwt.sign(
    { id: user.id, role: user.role, tv: user.token_version ?? 0 },
    config.jwt.secret,
    { expiresIn: staff ? config.jwt.staffExpiresIn : config.jwt.expiresIn, algorithm: 'HS256' }
  );
}

const publicUser = (u) => {
  const { password_hash, token_version, is_active, deleted_at, ...rest } = u; // eslint-disable-line no-unused-vars
  return rest;
};

/**
 * Register a new customer. Role is always 'customer' — staff accounts are
 * created by a super_admin via the users module.
 */
const register = async ({ full_name, phone, password, email }) => {
  const existing = await query('SELECT id FROM users WHERE phone = $1', [phone]);
  if (existing.rows.length > 0) throw ApiError.conflict('Phone number already registered');

  if (email) {
    const emailExists = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (emailExists.rows.length > 0) throw ApiError.conflict('Email already registered');
  }

  const password_hash = await hashPassword(password);
  const result = await query(
    `INSERT INTO users (full_name, phone, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'customer')
     RETURNING ${PROFILE_FIELDS}, token_version`,
    [full_name, phone, email || null, password_hash]
  );

  const user = result.rows[0];
  return { user: publicUser(user), token: generateToken(user) };
};

/**
 * Log in with phone + password.
 */
const login = async ({ phone, password }) => {
  const result = await query(
    `SELECT ${PROFILE_FIELDS}, password_hash, is_active, token_version
       FROM users WHERE phone = $1 AND deleted_at IS NULL`,
    [phone]
  );
  const user = result.rows[0];

  // Unknown phones are checked against a dummy hash so timing doesn't reveal
  // which numbers have accounts.
  const isMatch = await verifyPassword(password, user ? user.password_hash : await getDummyHash());
  if (!user || !isMatch) throw ApiError.unauthorized('Invalid phone or password');
  if (!user.is_active) throw ApiError.forbidden('Account has been deactivated');

  // Upgrade legacy (bcrypt) hashes transparently on a successful login.
  const newHash = needsRehash(user.password_hash) ? await hashPassword(password) : null;
  await query(
    'UPDATE users SET last_login_at = NOW(), password_hash = COALESCE($2, password_hash) WHERE id = $1',
    [user.id, newHash]
  );
  return { user: publicUser(user), token: generateToken(user) };
};

/**
 * Generate a 6-digit OTP, store its hash, and send it by SMS.
 * Rate-limited per phone (cooldown + hourly cap). For password_reset the
 * response is identical whether or not the phone has an account.
 */
const sendOtp = async ({ phone, purpose }) => {
  if (!sms.isConfigured()) {
    throw new ApiError(503, 'SMS service is not available yet. Please contact the shop.');
  }

  const recent = await query(
    `SELECT
       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int AS last_hour,
       MAX(created_at) AS last_sent
     FROM otp_codes WHERE phone = $1`,
    [phone]
  );
  const { last_hour: lastHour, last_sent: lastSent } = recent.rows[0];
  if (lastSent && Date.now() - new Date(lastSent).getTime() < OTP_RESEND_COOLDOWN_S * 1000) {
    throw new ApiError(429, `Please wait ${OTP_RESEND_COOLDOWN_S} seconds before requesting another code`);
  }
  if (lastHour >= OTP_MAX_PER_HOUR) {
    throw new ApiError(429, 'Too many codes requested. Please try again later.');
  }

  const genericResponse = { message: 'If the number is valid, a code has been sent' };

  // For password resets on unknown numbers we still store a (useless) code
  // row, so the cooldown and hourly cap behave identically and the endpoint
  // can't be used to discover which phones have accounts. No SMS is sent.
  let deliver = true;
  if (purpose === 'password_reset') {
    const u = await query('SELECT id FROM users WHERE phone = $1 AND deleted_at IS NULL AND is_active', [phone]);
    deliver = u.rows.length > 0;
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await withTransaction(async (client) => {
    // Only the newest code for a phone+purpose is ever valid.
    await client.query(
      `UPDATE otp_codes SET used_at = NOW()
        WHERE phone = $1 AND purpose = $2 AND used_at IS NULL`,
      [phone, purpose]
    );
    await client.query(
      `INSERT INTO otp_codes (phone, code, purpose, expires_at) VALUES ($1, $2, $3, $4)`,
      [phone, hashOtp(phone, code), purpose, new Date(Date.now() + OTP_TTL_MS)]
    );
  });

  if (deliver) {
    await sms.send(phone, `Your Premium Gadget verification code is ${code}. It expires in 5 minutes.`);
  }
  return genericResponse;
};

/**
 * Consume the latest OTP for phone+purpose. Wrong guesses count against the
 * code; after OTP_MAX_ATTEMPTS it is burned.
 */
const consumeOtp = async (client, { phone, code, purpose }) => {
  const { rows } = await client.query(
    `SELECT id, code, attempts FROM otp_codes
      WHERE phone = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > NOW()
      ORDER BY created_at DESC LIMIT 1
      FOR UPDATE`,
    [phone, purpose]
  );
  const otp = rows[0];
  if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) return false;

  const expected = Buffer.from(otp.code);
  const given = Buffer.from(hashOtp(phone, code));
  const ok = expected.length === given.length && crypto.timingSafeEqual(expected, given);

  if (ok) {
    await client.query('UPDATE otp_codes SET used_at = NOW() WHERE id = $1', [otp.id]);
  } else {
    await client.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
  }
  return ok;
};

/**
 * Verify a phone_verify OTP and mark the phone as verified.
 */
const verifyOtp = async ({ phone, code }) => {
  const ok = await withTransaction(async (client) => {
    const valid = await consumeOtp(client, { phone, code, purpose: 'phone_verify' });
    if (valid) {
      await client.query('UPDATE users SET phone_verified = TRUE WHERE phone = $1', [phone]);
    }
    return valid;
  });
  if (!ok) throw ApiError.badRequest('Invalid or expired OTP');
  return { message: 'Phone verified successfully' };
};

/**
 * Reset a forgotten password with a password_reset OTP. Revokes all existing
 * sessions.
 */
const resetPassword = async ({ phone, code, new_password }) => {
  const ok = await withTransaction(async (client) => {
    const valid = await consumeOtp(client, { phone, code, purpose: 'password_reset' });
    if (!valid) return false;
    // Hash only after the code checks out, so wrong guesses cost us nothing.
    const hash = await hashPassword(new_password);
    const r = await client.query(
      `UPDATE users
          SET password_hash = $1, password_changed_at = NOW(),
              token_version = token_version + 1, phone_verified = TRUE
        WHERE phone = $2 AND deleted_at IS NULL`,
      [hash, phone]
    );
    return r.rowCount > 0;
  });
  if (!ok) throw ApiError.badRequest('Invalid or expired OTP');
  return { message: 'Password has been reset. Please log in.' };
};

/**
 * Change password for the logged-in user. Revokes other sessions and returns
 * a fresh token for this one.
 */
const changePassword = async (userId, { current_password, new_password }) => {
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!rows.length || !(await verifyPassword(current_password, rows[0].password_hash))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  const hash = await hashPassword(new_password);
  const result = await query(
    `UPDATE users
        SET password_hash = $1, password_changed_at = NOW(), token_version = token_version + 1
      WHERE id = $2
      RETURNING ${PROFILE_FIELDS}, token_version`,
    [hash, userId]
  );
  const user = result.rows[0];
  return { user: publicUser(user), token: generateToken(user) };
};

/** Invalidate every token issued to this user. */
const logoutAll = async (userId) => {
  await query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [userId]);
  return { message: 'Logged out of all sessions' };
};

/**
 * Get current user profile.
 */
const getProfile = async (userId) => {
  const result = await query(
    `SELECT ${PROFILE_FIELDS} FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  if (result.rows.length === 0) throw ApiError.notFound('User not found');
  return result.rows[0];
};

/**
 * Update the logged-in user's own profile (name, email, avatar). Phone and
 * role can't be changed here.
 */
const updateProfile = async (userId, data) => {
  if (data.email) {
    const taken = await query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2',
      [data.email, userId]
    );
    if (taken.rows.length) throw ApiError.conflict('Email already registered');
  }
  const sets = [];
  const vals = [];
  for (const key of ['full_name', 'email', 'avatar_url']) {
    if (data[key] !== undefined) {
      vals.push(data[key]);
      sets.push(`${key} = $${vals.length}`);
    }
  }
  vals.push(userId);
  const result = await query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length} AND deleted_at IS NULL
     RETURNING ${PROFILE_FIELDS}`,
    vals
  );
  if (!result.rows.length) throw ApiError.notFound('User not found');
  return result.rows[0];
};

module.exports = {
  register,
  login,
  sendOtp,
  verifyOtp,
  resetPassword,
  changePassword,
  logoutAll,
  getProfile,
  updateProfile,
  generateToken,
};
