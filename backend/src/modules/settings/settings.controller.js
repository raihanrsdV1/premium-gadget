const asyncHandler = require('../../utils/asyncHandler');
const service = require('./settings.service');

// Public storefront settings. Cacheable briefly by browsers and the CDN.
const getPublic = asyncHandler(async (req, res) => {
  const data = await service.getPublic();
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ success: true, data });
});

// Every setting, for the admin app.
const getAdmin = asyncHandler(async (req, res) => {
  const data = await service.getAll();
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data });
});

const update = asyncHandler(async (req, res) => {
  const data = await service.update(req.validatedParams.key, req.validatedBody, req.user);
  res.json({ success: true, data });
});

module.exports = { getPublic, getAdmin, update };
