// R2 driver with the S3 client mocked: no network.
const mockSend = jest.fn(async () => ({}));
const mockClientConfigs = [];
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation((cfg) => {
    mockClientConfigs.push(cfg);
    return { send: mockSend };
  }),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ type: 'put', input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ type: 'delete', input })),
}));

const sharp = require('sharp');
const config = require('../../src/config');
const { api, query, resetDb } = require('../helpers');
const { actors } = require('./_actors');

const saved = JSON.parse(JSON.stringify(config.storage));

beforeEach(async () => {
  await resetDb();
  mockSend.mockClear();
  config.storage.driver = 'r2';
  Object.assign(config.storage.r2, {
    accountId: 'acct123',
    accessKeyId: 'AKIDTEST',
    secretAccessKey: 'secret',
    bucket: 'pg-images',
    publicBaseUrl: 'https://img.premiumgadget.test',
  });
});

afterAll(() => {
  config.storage.driver = saved.driver;
  Object.assign(config.storage.r2, saved.r2);
});

test('uploads go to the R2 bucket with a public URL; delete removes the object', async () => {
  const a = await actors();
  const img = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#000' } }).png().toBuffer();

  const res = await api.post('/api/v1/uploads/images').set(a.ba).attach('images', img, 'a.png').expect(201);
  const { url, id } = res.body.data[0];
  expect(url).toMatch(/^https:\/\/img\.premiumgadget\.test\/products\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.webp$/);

  expect(mockClientConfigs[0]).toMatchObject({
    region: 'auto',
    endpoint: 'https://acct123.r2.cloudflarestorage.com',
    credentials: { accessKeyId: 'AKIDTEST', secretAccessKey: 'secret' },
  });
  const put = mockSend.mock.calls[0][0];
  expect(put.type).toBe('put');
  expect(put.input).toMatchObject({ Bucket: 'pg-images', ContentType: 'image/webp' });
  expect(`https://img.premiumgadget.test/${put.input.Key}`).toBe(url);
  expect((await sharp(put.input.Body).metadata()).format).toBe('webp');

  const row = (await query('SELECT storage_key FROM media WHERE id = $1', [id])).rows[0];
  expect(row.storage_key).toBe(put.input.Key);

  await api.delete(`/api/v1/uploads/${id}`).set(a.ba).expect(200);
  const del = mockSend.mock.calls[1][0];
  expect(del).toEqual({ type: 'delete', input: { Bucket: 'pg-images', Key: put.input.Key } });
});

test('a failed bucket write stores nothing and returns 500 without details', async () => {
  const a = await actors();
  const img = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#000' } }).png().toBuffer();
  mockSend.mockRejectedValueOnce(Object.assign(new Error('AccessDenied: key AKIDTEST'), { name: 'AccessDenied' }));
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const res = await api.post('/api/v1/uploads/images').set(a.ba).attach('images', img, 'a.png').expect(500);
    expect(JSON.stringify(res.body)).not.toMatch(/AKIDTEST|AccessDenied/);
  } finally {
    spy.mockRestore();
  }
  expect((await query('SELECT COUNT(*)::int AS n FROM media')).rows[0].n).toBe(0);
});

test('missing R2 settings → 503', async () => {
  const a = await actors();
  config.storage.r2.bucket = undefined;
  const img = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#000' } }).png().toBuffer();
  const quiet = jest.spyOn(console, 'error').mockImplementation(() => {}); // 5xx are logged
  const res = await api.post('/api/v1/uploads/images').set(a.ba).attach('images', img, 'a.png').expect(503);
  quiet.mockRestore();
  expect(res.body.message).toMatch(/not configured/);
  expect(mockSend).not.toHaveBeenCalled();
});
