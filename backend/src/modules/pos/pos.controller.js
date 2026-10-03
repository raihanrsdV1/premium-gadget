const asyncHandler = require('../../utils/asyncHandler');
const posService = require('./pos.service');

const createSale = asyncHandler(async (req, res) => {
  const result = await posService.createSale(req.validatedBody, req.user);
  res.status(201).json({ success: true, data: result });
});

const getSales = asyncHandler(async (req, res) => {
  const result = await posService.getSales(req.validatedQuery, req.user);
  res.json({ success: true, ...result });
});

const getSaleById = asyncHandler(async (req, res) => {
  const result = await posService.getSaleById(req.validatedParams.id, req.user);
  res.json({ success: true, data: result });
});

const voidSale = asyncHandler(async (req, res) => {
  const result = await posService.voidSale(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data: result });
});

const catalog = asyncHandler(async (req, res) => {
  const result = await posService.catalog(req.validatedQuery, req.user);
  res.json({ success: true, data: result });
});

module.exports = { createSale, getSales, getSaleById, voidSale, catalog };
