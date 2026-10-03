const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const config = require('../../config');
const ApiError = require('../../utils/ApiError');

/**
 * Cloudflare R2 driver (S3-compatible API). Objects are served from the
 * bucket's public URL (r2.dev subdomain or a custom domain).
 */

let client;

const settings = () => {
  const r2 = config.storage.r2;
  if (!r2.accountId || !r2.accessKeyId || !r2.secretAccessKey || !r2.bucket || !r2.publicBaseUrl) {
    throw new ApiError(503, 'Image storage is not configured');
  }
  return r2;
};

const getClient = () => {
  if (!client) {
    const r2 = settings();
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
    });
  }
  return client;
};

const put = async ({ key, body, contentType }) => {
  const r2 = settings();
  await getClient().send(
    new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Keys are random UUIDs and never overwritten, so cache forever.
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
  return { key, url: `${r2.publicBaseUrl}/${key}` };
};

const remove = async (key) => {
  const r2 = settings();
  await getClient().send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }));
};

module.exports = { put, remove };
