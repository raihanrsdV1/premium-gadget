const asyncHandler = require('../../utils/asyncHandler');
const service = require('./coupon.service');

const getAll = asyncHandler(async (req, res) => {
  const result = await service.getAll(req.validatedQuery);
  res.json({ success: true, ...result });
});

const getById = asyncHandler(async (req, res) => {
  const result = await service.getById(req.validatedParams.id);
  res.json({ success: true, data: result });
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
  const result = await service.remove(req.validatedParams.id, req.user);
  res.json({
    success: true,
    data: result,
    message: result.deleted
      ? 'Coupon deleted'
      : 'Coupon has been used, so it was deactivated instead of deleted',
  });
});

// Customer: check a code against their cart (no use is reserved).
const validateForCart = asyncHandler(async (req, res) => {
  const result = await service.validateForCart(req.validatedBody, req.user);
  res.json({ success: true, data: result });
});

module.exports = { getAll, getById, create, update, remove, validateForCart };
