const fs = require('fs/promises');
const path = require('path');
const config = require('../../config');
const ApiError = require('../../utils/ApiError');

/**
 * Local-disk driver for development. Files go under backend/uploads, which
 * app.js serves at /uploads. Refused in production (no persistent disk in
 * the containers) unless ALLOW_LOCAL_UPLOADS=true is set deliberately.
 */

const ROOT = path.resolve(__dirname, '..', '..', '..', 'uploads');

const assertAllowed = () => {
  if (config.isProd && process.env.ALLOW_LOCAL_UPLOADS !== 'true') {
    throw new ApiError(503, 'Local image storage is disabled in production; configure R2 storage');
  }
};

/** Absolute path for a key, guaranteed to stay inside ROOT. */
const fileFor = (key) => {
  const full = path.resolve(ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error('Storage key escapes the upload directory');
  return full;
};

const publicUrl = (key) => `${new URL(config.urls.serverPublic).origin}/uploads/${key}`;

const put = async ({ key, body }) => {
  assertAllowed();
  const file = fileFor(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  // 'wx': never overwrite an existing object.
  await fs.writeFile(file, body, { flag: 'wx' });
  return { key, url: publicUrl(key) };
};

const remove = async (key) => {
  assertAllowed();
  try {
    await fs.unlink(fileFor(key));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
};

module.exports = { put, remove, ROOT };
