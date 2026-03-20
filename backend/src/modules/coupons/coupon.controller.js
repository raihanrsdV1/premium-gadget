const asyncHandler = require('../../utils/asyncHandler');
const service = require('./coupon.service');

const getAll = asyncHandler(async (req, res) => {
  const result = await service.getAll(req.query);
  res.json({ success: true, ...result });
});

const getById = asyncHandler(async (req, res) => {
  const result = await service.getById(req.params.id);
  res.json({ success: true, data: result });
});

const create = asyncHandler(async (req, res) => {
  const result = await service.create(req.body);
  res.status(201).json({ success: true, data: result });
});

const update = asyncHandler(async (req, res) => {
  const result = await service.update(req.params.id, req.body);
  res.json({ success: true, data: result });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  res.json({ success: true, message: 'Deleted successfully' });
});

module.exports = { getAll, getById, create, update, remove };
