const asyncHandler = require('../../utils/asyncHandler');
const service = require('./inventory.service');

const getAll = asyncHandler(async (req, res) => {
  const result = await service.getAll(req.validatedQuery, req.user);
  res.json({ success: true, ...result });
});

const getById = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getById(req.validatedParams.id, req.user) });
});

const create = asyncHandler(async (req, res) => {
  const result = await service.create(req.validatedBody, req.user);
  res.status(201).json({ success: true, data: result });
});

const update = asyncHandler(async (req, res) => {
  const result = await service.update(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data: result });
});

const adjust = asyncHandler(async (req, res) => {
  const result = await service.adjust(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data: result });
});

const transfer = asyncHandler(async (req, res) => {
  const result = await service.transfer(req.validatedBody, req.user);
  res.status(201).json({ success: true, data: result });
});

const getMovements = asyncHandler(async (req, res) => {
  const result = await service.getMovements(req.validatedQuery, req.user);
  res.json({ success: true, ...result });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.validatedParams.id, req.user);
  res.json({ success: true, message: 'Inventory record deleted' });
});

const createUnit = asyncHandler(async (req, res) => {
  const result = await service.createUnit(req.validatedBody, req.user);
  res.status(201).json({ success: true, data: result });
});

const listUnits = asyncHandler(async (req, res) => {
  const result = await service.listUnits(req.validatedQuery, req.user);
  res.json({ success: true, ...result });
});

const updateUnit = asyncHandler(async (req, res) => {
  const result = await service.updateUnit(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data: result });
});

module.exports = {
  getAll, getById, create, update, adjust, transfer, getMovements, remove, createUnit, listUnits, updateUnit,
};
