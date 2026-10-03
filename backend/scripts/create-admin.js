/**
 * Create (or promote) a super_admin account. This is the only way to get the
 * first admin into a production database — no admin is ever seeded with a
 * known password.
 *
 * Usage (on the droplet):
 *   docker compose -f docker-compose.yml run --rm \
 *     -e ADMIN_NAME="Owner Name" -e ADMIN_PHONE=01886670543 -e ADMIN_PASSWORD='a-long-passphrase' \
 *     backend npm run create-admin
 *
 *   Add -e ADMIN_RESET=true to reset the password / re-activate / promote an
 *   existing account with that phone.
 *
 * Avoid leaving the password in shell history: prefix the command with a
 * space (HISTCONTROL=ignorespace) or read it with `read -s ADMIN_PASSWORD`.
 */
require('dotenv').config();
const { Pool } = require('pg');
const { hashPassword } = require('../src/utils/password');

const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

async function main() {
  const name = (process.env.ADMIN_NAME || '').trim();
  const phone = (process.env.ADMIN_PHONE || '').replace(/[\s-]/g, '').replace(/^\+?880/, '0');
  const password = process.env.ADMIN_PASSWORD || '';
  const reset = process.env.ADMIN_RESET === 'true';

  if (!process.env.DATABASE_URL) fail('DATABASE_URL is not set');
  if (name.length < 2) fail('ADMIN_NAME is required');
  if (!/^01[3-9]\d{8}$/.test(phone)) fail('ADMIN_PHONE must be a Bangladesh mobile number (01XXXXXXXXX)');
  if (password.length < 12) fail('ADMIN_PASSWORD must be at least 12 characters');
  if (/^(admin|password|premium)/i.test(password) || /@123$/.test(password)) {
    fail('ADMIN_PASSWORD is too guessable');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const hash = await hashPassword(password);
    const existing = await pool.query('SELECT id, role FROM users WHERE phone = $1', [phone]);

    if (existing.rows.length && !reset) {
      fail(`A user with phone ${phone} already exists (role: ${existing.rows[0].role}). Re-run with ADMIN_RESET=true to promote/reset it.`);
    }

    if (existing.rows.length) {
      await pool.query(
        `UPDATE users
            SET full_name = $1, password_hash = $2, role = 'super_admin', is_active = TRUE,
                deleted_at = NULL, phone_verified = TRUE, password_changed_at = NOW(),
                token_version = token_version + 1
          WHERE id = $3`,
        [name, hash, existing.rows[0].id]
      );
      console.log(`✓ Updated ${phone} → super_admin (password reset, other sessions revoked)`);
    } else {
      // Attach to the first active branch if one exists (POS needs a branch).
      const branch = await pool.query(
        'SELECT id FROM branches WHERE is_active ORDER BY created_at ASC LIMIT 1'
      );
      await pool.query(
        `INSERT INTO users (full_name, phone, password_hash, role, phone_verified, is_active, branch_id)
         VALUES ($1, $2, $3, 'super_admin', TRUE, TRUE, $4)`,
        [name, phone, hash, branch.rows[0]?.id || null]
      );
      console.log(`✓ Created super_admin ${phone}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => fail(err.message));
