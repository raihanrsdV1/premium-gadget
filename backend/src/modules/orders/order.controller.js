const asyncHandler = require('../../utils/asyncHandler');
const service = require('./order.service');

// Online checkout — Phase A (authenticated customer).
const checkout = asyncHandler(async (req, res) => {
  const result = await service.create(req.validatedBody, req.user);
  res.status(201).json({ success: true, data: result });
});

// The authenticated user's own orders.
const getMine = asyncHandler(async (req, res) => {
  const result = await service.getMyOrders(req.user);
  res.json({ success: true, data: result });
});

// A single order owned by the user, by order number.
const getMineOne = asyncHandler(async (req, res) => {
  const result = await service.getMyOrder(req.user, req.params.orderNumber);
  res.json({ success: true, data: result });
});

const getAll = asyncHandler(async (req, res) => {
  const result = await service.getAll(req.query);
  res.json({ success: true, ...result });
});

const getById = asyncHandler(async (req, res) => {
  const result = await service.getById(req.params.id);
  res.json({ success: true, data: result });
});

const update = asyncHandler(async (req, res) => {
  const result = await service.update(req.params.id, req.body);
  res.json({ success: true, data: result });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  res.json({ success: true, message: 'Deleted successfully' });
});

module.exports = { checkout, getMine, getMineOne, getAll, getById, update, remove };
