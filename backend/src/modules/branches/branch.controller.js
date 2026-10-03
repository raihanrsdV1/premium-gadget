const asyncHandler = require('../../utils/asyncHandler');
const service = require('./branch.service');

const listPublic = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listPublic() });
});

const getPublic = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getPublic(req.validatedParams.idOrSlug) });
});

const listAdmin = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listAdmin() });
});

const create = asyncHandler(async (req, res) => {
  const result = await service.create(req.validatedBody, req.user);
  res.status(201).json({ success: true, data: result });
});

const update = asyncHandler(async (req, res) => {
  const result = await service.update(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data: result });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.validatedParams.id, req.user);
  res.json({ success: true, message: 'Branch deleted' });
});

module.exports = { listPublic, getPublic, listAdmin, create, update, remove };
