const asyncHandler = require('../../utils/asyncHandler');
const service = require('./order.service');

// Online checkout (authenticated customer).
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
  const result = await service.getMyOrder(req.user, req.validatedParams.orderNumber);
  res.json({ success: true, data: result });
});

const getAll = asyncHandler(async (req, res) => {
  const result = await service.getAll(req.validatedQuery, req.user);
  res.json({ success: true, ...result });
});

const getById = asyncHandler(async (req, res) => {
  const result = await service.getById(req.validatedParams.id, req.user);
  res.json({ success: true, data: result });
});

const updateStatus = asyncHandler(async (req, res) => {
  const result = await service.updateStatus(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data: result });
});

const updateAdminNote = asyncHandler(async (req, res) => {
  const result = await service.updateAdminNote(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data: result });
});

const updatePayment = asyncHandler(async (req, res) => {
  const result = await service.updatePayment(req.validatedParams.id, req.validatedBody, req.user);
  res.json({ success: true, data: result });
});

module.exports = { checkout, getMine, getMineOne, getAll, getById, updateStatus, updateAdminNote, updatePayment };
