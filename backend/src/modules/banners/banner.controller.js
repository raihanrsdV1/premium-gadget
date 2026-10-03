const asyncHandler = require('../../utils/asyncHandler');
const service = require('./banner.service');

// Short shared cache: slides change rarely, and writes also trigger
// storefront revalidation.
const PUBLIC_CACHE = 'public, max-age=60';

const getPublic = asyncHandler(async (req, res) => {
  const data = await service.getPublic(req.validatedQuery);
  res.set('Cache-Control', PUBLIC_CACHE);
  res.json({ success: true, data });
});

const getAdminList = asyncHandler(async (req, res) => {
  const data = await service.getAdminList(req.validatedQuery);
  res.json({ success: true, data });
});

const create = asyncHandler(async (req, res) => {
  const data = await service.create(req.validatedBody, req.user);
  res.status(201).json({ success: true, data });
});

const update = asyncHandler(async (req, res) => {
  const data = await service.update(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data });
});

const reorder = asyncHandler(async (req, res) => {
  const data = await service.reorder(req.validatedBody, req.user);
  res.json({ success: true, data });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.validatedParams.id, req.user);
  res.json({ success: true, message: 'Banner deleted' });
});

module.exports = { getPublic, getAdminList, create, update, reorder, remove };
