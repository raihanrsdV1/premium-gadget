const crypto = require('crypto');
const sharp = require('sharp');
const { withTransaction } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { audit } = require('../../utils/audit');
const storage = require('../../lib/storage');

const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 82;
// Decompression-bomb guard: a tiny file can declare a gigantic canvas.
const MAX_INPUT_PIXELS = 50_000_000;
const SHARP_OPTIONS = { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' };

const UNSUPPORTED = (n) =>
  ApiError.badRequest(`File ${n} is not a supported image (JPEG, PNG, WebP, AVIF or GIF)`);

/**
 * Identify the format from magic bytes. The client's filename and MIME type
 * are ignored, and anything that doesn't start like an allowed raster format
 * (notably SVG/HTML, which libvips would happily rasterise) never reaches the
 * decoder.
 * @returns {'jpeg'|'png'|'gif'|'webp'|'avif'|null}
 */
const sniff = (buf) => {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  const gif = buf.toString('latin1', 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'gif';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('latin1', 4, 8) === 'ftyp') {
    // ISO-BMFF: major brand at 8, compatible brands from 16 to the box end.
    const boxEnd = Math.min(buf.readUInt32BE(0), buf.length, 256);
    for (let i = 8; i + 4 <= boxEnd; i += 4) {
      if (i === 12) continue; // minor version, not a brand
      const brand = buf.toString('latin1', i, i + 4);
      if (brand === 'avif' || brand === 'avis') return 'avif';
    }
  }
  return null;
};

/**
 * Decode and re-encode one upload: apply EXIF orientation, drop all metadata
 * (GPS, camera serials, ICC), fit within 1600×1600 without enlarging, WebP.
 * Re-encoding means only pixels we produced are ever stored or served.
 *
 * @param {Buffer} buf
 * @param {number} n - 1-based position, for error messages
 */
const reencode = async (buf, n) => {
  const sniffed = sniff(buf);
  if (!sniffed) throw UNSUPPORTED(n);
  try {
    const meta = await sharp(buf, SHARP_OPTIONS).metadata();
    const format = meta.format === 'heif' ? (meta.compression === 'av1' ? 'avif' : 'heif') : meta.format;
    if (format !== sniffed) throw UNSUPPORTED(n);

    const { data, info } = await sharp(buf, SHARP_OPTIONS)
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, size: info.size };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw UNSUPPORTED(n);
  }
};

const newKey = () => {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `products/${yyyy}/${mm}/${crypto.randomUUID()}.webp`;
};

/**
 * Validate, re-encode and store uploaded images, recording each in `media`.
 * All-or-nothing: if any file is rejected nothing is stored, and stored
 * objects are removed again if the database write fails.
 *
 * @param {Array<{ buffer: Buffer }>} files - multer memoryStorage files
 * @param {object} actor - req.user
 * @returns {Promise<Array<{ id: string, url: string, width: number, height: number }>>}
 */
const uploadImages = async (files, actor) => {
  if (!files || !files.length) throw ApiError.badRequest('No images uploaded (multipart field "images")');

  // Sequential: bounds CPU/memory per request; uploads are staff-only and rare.
  const encoded = [];
  for (let i = 0; i < files.length; i += 1) encoded.push(await reencode(files[i].buffer, i + 1));

  const stored = [];
  try {
    for (const img of encoded) {
      const { key, url } = await storage.put({ key: newKey(), body: img.data, contentType: 'image/webp' });
      stored.push({ ...img, key, url });
    }
    return await withTransaction(async (client) => {
      const out = [];
      for (const s of stored) {
        const { rows } = await client.query(
          `INSERT INTO media (storage_key, url, content_type, width, height, size_bytes, uploaded_by)
           VALUES ($1, $2, 'image/webp', $3, $4, $5, $6)
           RETURNING id, url, width, height`,
          [s.key, s.url, s.width, s.height, s.size, actor.id]
        );
        await audit({ actor, action: 'media.upload', entity: 'media', entityId: rows[0].id, data: { key: s.key, bytes: s.size }, db: client });
        out.push(rows[0]);
      }
      return out;
    });
  } catch (err) {
    await Promise.all(stored.map((s) => storage.remove(s.key).catch(() => {})));
    throw err;
  }
};

/**
 * Delete an uploaded image and its stored object. Refused (409) while any
 * catalog row still points at its URL. Branch staff may only delete their
 * own uploads.
 */
const remove = async (id, actor) =>
  withTransaction(async (client) => {
    // FOR UPDATE conflicts with the FOR SHARE taken when a product image is
    // attached by media_id, so attach-vs-delete can't interleave.
    const { rows } = await client.query('SELECT * FROM media WHERE id = $1 FOR UPDATE', [id]);
    const media = rows[0];
    if (!media) throw ApiError.notFound('Image not found');
    if (actor.role !== 'super_admin' && media.uploaded_by !== actor.id) {
      throw ApiError.forbidden('You can only delete images you uploaded');
    }

    const { rows: [use] } = await client.query(
      `SELECT (SELECT COUNT(*) FROM product_images WHERE image_url = $1)::int AS product_images,
              (SELECT COUNT(*) FROM products   WHERE og_image_url = $1)::int
            + (SELECT COUNT(*) FROM categories WHERE icon_url = $1 OR banner_url = $1)::int
            + (SELECT COUNT(*) FROM brands     WHERE logo_url = $1 OR banner_url = $1)::int AS other`,
      [media.url]
    );
    if (use.product_images || use.other) {
      throw ApiError.conflict(
        use.product_images
          ? `Image is still used by ${use.product_images} product image(s); remove it from those products first`
          : 'Image is still used by a product, category or brand; remove it there first'
      );
    }

    await client.query('DELETE FROM media WHERE id = $1', [id]);
    // Inside the transaction: if the object can't be removed, the row stays.
    await storage.remove(media.storage_key);
    await audit({ actor, action: 'media.delete', entity: 'media', entityId: id, data: { key: media.storage_key }, db: client });
  });

module.exports = { uploadImages, remove, sniff };
