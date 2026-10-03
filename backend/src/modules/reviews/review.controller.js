const asyncHandler = require('../../utils/asyncHandler');
const service = require('./review.service');

const listPublic = asyncHandler(async (req, res) => {
  const result = await service.listPublic(req.validatedQuery);
  res.json({ success: true, ...result });
});

const listMine = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listMine(req.validatedQuery, req.user) });
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
  res.json({ success: true, message: 'Review deleted' });
});

const listAdmin = asyncHandler(async (req, res) => {
  const result = await service.listAdmin(req.validatedQuery);
  res.json({ success: true, ...result });
});

const moderate = asyncHandler(async (req, res) => {
  const result = await service.moderate(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data: result });
});

module.exports = { listPublic, listMine, create, update, remove, listAdmin, moderate };
