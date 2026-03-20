const asyncHandler = require('../../utils/asyncHandler');
const posService = require('./pos.service');

const createSale = asyncHandler(async (req, res) => {
  const result = await posService.createSale(req.body, req.user);
  res.status(201).json({ success: true, data: result });
});

const getSales = asyncHandler(async (req, res) => {
  const result = await posService.getSales(req.query, req.user);
  res.json({ success: true, ...result });
});

const getSaleById = asyncHandler(async (req, res) => {
  const result = await posService.getSaleById(req.params.id);
  res.json({ success: true, data: result });
});

module.exports = { createSale, getSales, getSaleById };
