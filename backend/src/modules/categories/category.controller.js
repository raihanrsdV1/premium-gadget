const asyncHandler = require('../../utils/asyncHandler');
const service = require('./category.service');

const getAll = asyncHandler(async (req, res) => {
  const data = await service.getAll(req.validatedQuery);
  res.json({ success: true, data });
});

const getAdminList = asyncHandler(async (req, res) => {
  const data = await service.getAdminList(req.validatedQuery);
  res.json({ success: true, data });
});

const getOne = asyncHandler(async (req, res) => {
  const data = await service.getOne(req.validatedParams.idOrSlug);
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

const getSpecTemplate = asyncHandler(async (req, res) => {
  const data = await service.getSpecTemplate(req.validatedParams.idOrSlug);
  res.json({ success: true, data });
});

const getAdminSpecTemplate = asyncHandler(async (req, res) => {
  const data = await service.getSpecTemplate(req.validatedParams.id, { includeHidden: true });
  res.json({ success: true, data });
});

const putSpecTemplate = asyncHandler(async (req, res) => {
  const data = await service.putSpecTemplate(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.validatedParams.id, req.user);
  res.json({ success: true, message: 'Category deleted' });
});

module.exports = {
  getAll, getAdminList, getOne, getSpecTemplate, getAdminSpecTemplate, create, update, putSpecTemplate, remove,
};
