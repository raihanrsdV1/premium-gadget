const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const config = require('../../src/config');
const storage = require('../../src/lib/storage');
const { ROOT } = require('../../src/lib/storage/local');
const { api, query, resetDb, factories: f } = require('../helpers');
const { actors } = require('./_actors');

const U = '/api/v1/uploads';

// ─── Keep backend/uploads exactly as we found it ─────────────────────────────
const listFiles = (dir = ROOT) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)])
    : [];
const listDirs = (dir = ROOT) =>
  fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory())
    .flatMap((e) => [...listDirs(path.join(dir, e.name)), path.join(dir, e.name)]);

let before;
let dirsBefore;
beforeAll(() => {
  before = new Set(listFiles());
  dirsBefore = new Set(listDirs());
});

const cleanupFiles = async () => {
  const { rows } = await query('SELECT storage_key FROM media');
  for (const r of rows) fs.rmSync(path.join(ROOT, r.storage_key), { force: true });
  // Any file a failed test may have left behind.
  for (const file of listFiles()) if (!before.has(file)) fs.rmSync(file, { force: true });
  for (const dir of listDirs()) {
    if (!dirsBefore.has(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  }
};

beforeEach(resetDb);
afterEach(cleanupFiles);
afterAll(() => {
  expect(new Set(listFiles())).toEqual(before);
});

// ─── Fixtures ───────────────────────────────────────────────────────────────
const solid = (width, height, background = '#cc3333') =>
  sharp({ create: { width, height, channels: 3, background } });

/** JPEG with camera EXIF, GPS and a "rotate 90°" orientation flag. */
const exifJpeg = () =>
  solid(60, 30)
    .withExif({
      IFD0: { Make: 'SecretCam', Copyright: 'Owner' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '22/1 20/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '91/1 49/1 0/1' },
    })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();

const keyOf = (url) => url.replace(/^https?:\/\/[^/]+\/uploads\//, '');

describe('POST /uploads/images', () => {
  test('authz: anonymous 401, customer 403', async () => {
    const a = await actors();
    const img = await solid(10, 10).png().toBuffer();
    await api.post(`${U}/images`).attach('images', img, 'a.png').expect(401);
    await api.post(`${U}/images`).set(a.cust).attach('images', img, 'a.png').expect(403);
    expect((await query('SELECT COUNT(*)::int AS n FROM media')).rows[0].n).toBe(0);
  });

  test('re-encodes to WebP: EXIF/GPS stripped, orientation applied, key layout, media row, served statically', async () => {
    const a = await actors();
    const input = await exifJpeg();
    const inMeta = await sharp(input).metadata();
    expect(inMeta.exif).toBeTruthy();
    expect(inMeta.exif.toString('latin1')).toContain('SecretCam');

    const res = await api.post(`${U}/images`).set(a.ba).attach('images', input, 'photo.jpg').expect(201);
    expect(res.body.data).toHaveLength(1);
    const out = res.body.data[0];
    expect(Object.keys(out).sort()).toEqual(['height', 'id', 'url', 'width']);
    expect(out.url).toMatch(/^http:\/\/localhost:5001\/uploads\/products\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.webp$/);
    // Orientation 6 = rotated 90°, so the 60×30 source comes out 30×60.
    expect([out.width, out.height]).toEqual([30, 60]);

    const file = path.join(ROOT, keyOf(out.url));
    const written = fs.readFileSync(file);
    const meta = await sharp(written).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(written.toString('latin1')).not.toMatch(/SecretCam|GPS/);

    const row = (await query('SELECT * FROM media WHERE id = $1', [out.id])).rows[0];
    expect(row).toMatchObject({ storage_key: keyOf(out.url), url: out.url, content_type: 'image/webp', width: 30, height: 60, uploaded_by: a.users.ba.id });
    expect(row.size_bytes).toBe(written.length);

    const served = await api.get(`/uploads/${keyOf(out.url)}`).expect(200);
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['content-type']).toMatch(/image\/webp/);
  });

  test('large images are fitted within 1600×1600; small ones are not enlarged', async () => {
    const a = await actors();
    const big = await solid(3200, 2000).jpeg({ quality: 50 }).toBuffer();
    const small = await solid(300, 200).png().toBuffer();
    const res = await api.post(`${U}/images`).set(a.ba)
      .attach('images', big, 'big.jpg')
      .attach('images', small, 'small.png')
      .expect(201);
    expect(res.body.data.map((d) => [d.width, d.height])).toEqual([[1600, 1000], [300, 200]]);
  });

  test('accepts jpeg, png, webp, avif and gif regardless of the claimed name/type', async () => {
    const a = await actors();
    const files = await Promise.all([
      solid(20, 20).jpeg().toBuffer(),
      solid(20, 20).png().toBuffer(),
      solid(20, 20).webp().toBuffer(),
      solid(20, 20).avif().toBuffer(),
      solid(20, 20).gif().toBuffer(),
    ]);
    let req = api.post(`${U}/images`).set(a.sa);
    files.forEach((buf, i) => {
      req = req.attach('images', buf, { filename: `file${i}.bin`, contentType: 'application/octet-stream' });
    });
    const res = await req.expect(201);
    expect(res.body.data).toHaveLength(5);
    expect((await query('SELECT COUNT(*)::int AS n FROM media')).rows[0].n).toBe(5);
  });

  test.each([
    ['plain text', Buffer.from('hello, this is definitely not an image at all')],
    ['HTML', Buffer.from('<!doctype html><html><body><script>alert(1)</script></body></html>')],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>')],
    ['truncated JPEG', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1])],
  ])('rejects %s disguised as image/jpeg .jpg (400), stores nothing', async (_, buf) => {
    const a = await actors();
    const res = await api.post(`${U}/images`).set(a.ba)
      .attach('images', buf, { filename: 'cat.jpg', contentType: 'image/jpeg' })
      .expect(400);
    expect(res.body.message).toMatch(/not a supported image/);
    expect((await query('SELECT COUNT(*)::int AS n FROM media')).rows[0].n).toBe(0);
    expect(listFiles().filter((x) => !before.has(x))).toEqual([]);
  });

  test('one bad file rejects the whole batch', async () => {
    const a = await actors();
    const good = await solid(20, 20).png().toBuffer();
    await api.post(`${U}/images`).set(a.ba)
      .attach('images', good, 'ok.png')
      .attach('images', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'evil.png')
      .expect(400);
    expect((await query('SELECT COUNT(*)::int AS n FROM media')).rows[0].n).toBe(0);
    expect(listFiles().filter((x) => !before.has(x))).toEqual([]);
  });

  test('multipart limits: no files, wrong field, too many, too large', async () => {
    const a = await actors();
    const img = await solid(10, 10).png().toBuffer();
    await api.post(`${U}/images`).set(a.ba).expect(400);
    await api.post(`${U}/images`).set(a.ba).attach('file', img, 'a.png').expect(400);

    let many = api.post(`${U}/images`).set(a.ba);
    for (let i = 0; i < 11; i++) many = many.attach('images', img, `a${i}.png`);
    await many.expect(400);

    const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(8 * 1024 * 1024)]);
    const res = await api.post(`${U}/images`).set(a.ba).attach('images', huge, 'huge.jpg').expect(400);
    expect(res.body.message).toMatch(/too large/i);
    expect((await query('SELECT COUNT(*)::int AS n FROM media')).rows[0].n).toBe(0);
  });

  test('local driver refuses to write in production unless ALLOW_LOCAL_UPLOADS=true', async () => {
    const a = await actors();
    const img = await solid(10, 10).png().toBuffer();
    const prev = { isProd: config.isProd, allow: process.env.ALLOW_LOCAL_UPLOADS };
    config.isProd = true;
    delete process.env.ALLOW_LOCAL_UPLOADS;
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {}); // 5xx are logged
    try {
      const res = await api.post(`${U}/images`).set(a.ba).attach('images', img, 'a.png').expect(503);
      expect(res.body.message).toMatch(/R2/);
      process.env.ALLOW_LOCAL_UPLOADS = 'true';
      await api.post(`${U}/images`).set(a.ba).attach('images', img, 'a.png').expect(201);
    } finally {
      quiet.mockRestore();
      config.isProd = prev.isProd;
      if (prev.allow === undefined) delete process.env.ALLOW_LOCAL_UPLOADS;
      else process.env.ALLOW_LOCAL_UPLOADS = prev.allow;
    }
  });

  test('storage keys cannot escape the upload directory', async () => {
    for (const key of ['../evil.webp', 'products/../../evil.webp', '/etc/passwd', 'a/.hidden', 'a//b.webp', '']) {
      await expect(storage.put({ key, body: Buffer.from('x'), contentType: 'image/webp' })).rejects.toThrow(/Invalid storage key/);
    }
  });
});

describe('media → product images → DELETE /uploads/:id', () => {
  const upload = async (headers) => {
    const img = await solid(40, 40).png().toBuffer();
    return (await api.post(`${U}/images`).set(headers).attach('images', img, 'a.png').expect(201)).body.data[0];
  };

  test('attach by media_id; delete is 409 while in use, then removes row and file', async () => {
    const a = await actors();
    const media = await upload(a.ba);
    const { product } = await f.product();

    const img = (await api.post(`/api/v1/products/${product.id}/images`).set(a.ba).send({ media_id: media.id, alt_text: 'Front' }).expect(201)).body.data;
    expect(img).toMatchObject({ image_url: media.url, is_primary: true });
    const pub = (await api.get(`/api/v1/products/${product.slug}`).expect(200)).body.data;
    expect(pub.images).toEqual([media.url]);

    const busy = await api.delete(`${U}/${media.id}`).set(a.ba).expect(409);
    expect(busy.body.message).toMatch(/still used/);
    expect(fs.existsSync(path.join(ROOT, keyOf(media.url)))).toBe(true);

    await api.delete(`/api/v1/products/${product.id}/images/${img.id}`).set(a.ba).expect(200);
    await api.delete(`${U}/${media.id}`).set(a.ba).expect(200);
    expect(fs.existsSync(path.join(ROOT, keyOf(media.url)))).toBe(false);
    expect((await query('SELECT COUNT(*)::int AS n FROM media')).rows[0].n).toBe(0);
    await api.delete(`${U}/${media.id}`).set(a.ba).expect(404);
  });

  test('also 409 while a category/brand/product uses it as a banner or logo', async () => {
    const a = await actors();
    const media = await upload(a.sa);
    const brand = await f.brand();
    await query('UPDATE brands SET logo_url = $1 WHERE id = $2', [media.url, brand.id]);
    await api.delete(`${U}/${media.id}`).set(a.sa).expect(409);
    await query('UPDATE brands SET logo_url = NULL WHERE id = $1', [brand.id]);
    await api.delete(`${U}/${media.id}`).set(a.sa).expect(200);
  });

  test('authz: anon 401, customer 403, other staff 403, uploader and super_admin OK', async () => {
    const a = await actors();
    const mine = await upload(a.ba);
    const another = await upload(a.ba);

    await api.delete(`${U}/${mine.id}`).expect(401);
    await api.delete(`${U}/${mine.id}`).set(a.cust).expect(403);
    await api.delete(`${U}/${mine.id}`).set(a.baOther).expect(403);
    await api.delete(`${U}/not-a-uuid`).set(a.ba).expect(400);
    await api.delete(`${U}/${mine.id}`).set(a.ba).expect(200);
    await api.delete(`${U}/${another.id}`).set(a.sa).expect(200);
    const log = (await query("SELECT action FROM admin_audit_log WHERE entity = 'media' ORDER BY created_at")).rows.map((r) => r.action);
    expect(log).toEqual(['media.upload', 'media.upload', 'media.delete', 'media.delete']);
  });
});
